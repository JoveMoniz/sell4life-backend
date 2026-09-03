import './config/env.js';
import User from './models/user.js';
// ======================================================
// DEPLOY TEST
// ======================================================
console.log('🚀 Backend redeployed at:', new Date().toISOString());

// ======================================================
// LOAD ENVIRONMENT VARIABLES
// ======================================================

// ======================================================
// CORE IMPORTS
// ======================================================
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';

// ======================================================
// ROUTES
// ======================================================
import { startRefundWorker } from './jobs/refundWorker.js';
import { startVendorPayoutWorker } from './jobs/vendorPayoutWorker.js';
import { startCjProductSyncWorker } from './jobs/cjProductSyncWorker.js';
import { startCjOrderStatusSyncWorker } from './jobs/cjOrderStatusSyncWorker.js';
import { startAnalyticsRollupWorker } from './jobs/analyticsRollupWorker.js';
import { startSellerInviteWorker } from './jobs/sellerInviteWorker.js';
import authRoute from './routes/auth.js';
import vendorRoutes from './routes/vendor.js';
import ordersRoute from './routes/orders.js';
import productsRoute from './routes/products.js';
import cartRoutes from './routes/cart.js';
import adminOrdersRoute from './routes/adminOrders.js';
import adminUsersRoute from './routes/adminUsers.js';
import adminVendorsRoutes from './routes/adminVendors.js';
import adminConfigRoute from './routes/adminConfig.js';
import reviewsRoute from './routes/reviews.js';
import storesRoute from './routes/stores.js';
import accountRoute from './routes/account.js';
import stripeWebhookRoute from './routes/stripeWebhook.js';
import passwordResetRoute from './routes/passwordReset.js';
import messagesRoute from './routes/messages.js';
import trackRoute from './routes/track.js';
import adminAnalyticsRoute from './routes/adminAnalytics.js';
import sitemapRoute from './routes/sitemap.js';
import currencyRoute from './routes/currency.js';
import publicStatusRoute from './routes/publicStatus.js';
import { initGeoIp, isGeoIpLoaded } from './utils/geoip.js';

// ======================================================
// APP INITIALIZATION
// ======================================================
const app = express();

// ======================================================
// TRUST PROXY
// Render sits behind two proxy hops (an edge/CDN layer, then its own
// internal load balancer) before reaching this app — trusting only 1
// hop resolves req.ip to Render's own internal address instead of the
// real visitor, silently breaking GeoIP country lookups.
// ======================================================
app.set('trust proxy', 3);

// ======================================================
// SECURITY HEADERS
// ======================================================
app.use(helmet());

// ======================================================
// COOKIE PARSER
// ======================================================
app.use(cookieParser());

// ======================================================
// CORS CONFIGURATION
// Registered before the rate limiters below so that a 429 response still
// carries proper CORS headers — otherwise a rate-limited request looks to
// the browser like an opaque "blocked by CORS policy" error instead of a
// readable "too many requests", which is what it actually is.
// ======================================================
const allowedOrigins = [
  'https://sell4life.com',
  'https://www.sell4life.com',
  'https://staging.sell4life.com',
  'http://127.0.0.1:8080',
  'http://localhost:8080',
];

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },

  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// ======================================================
// RATE LIMITERS
// General API limiter + stricter auth limiter
// ======================================================
// A plain string `message` makes express-rate-limit call res.send() with
// text/html, which breaks any frontend code that assumes every API response
// is JSON (res.json() throws, masking the real "too many requests" reason
// behind a generic parse-error message) — so every limiter below gets a
// JSON-shaped message instead.
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again shortly.' },
  // Tracking and the admin analytics dashboard get their own, more
  // generous limiters below — a single active visitor already fires
  // several beacons per pageview (shared-IP scenarios like offices or
  // mobile carrier NAT would otherwise exhaust this limit almost
  // immediately), and the dashboard's 20s realtime poll plus its
  // multi-endpoint page load adds up fast under normal, legitimate use
  // by an already-authenticated admin.
  skip: (req) => req.path.startsWith('/interactions') || req.path.startsWith('/admin/analytics'),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts — please wait a few minutes and try again.' },
});

const trackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again shortly.' },
});

// Authenticated-admin-only route — abuse risk is much lower than a public
// endpoint, and the dashboard genuinely needs the headroom (7 requests per
// load, plus a 20s realtime poll for as long as the tab stays open).
const adminAnalyticsLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again shortly.' },
});

app.use('/api', apiLimiter);
app.use('/api/interactions', trackLimiter);
app.use('/api/admin/analytics', adminAnalyticsLimiter);
app.post('/api/auth/login', authLimiter);
app.post('/api/auth/register', authLimiter);
app.post('/api/auth/forgot-password', authLimiter);
app.post('/api/auth/reset-password', authLimiter);
app.post('/api/auth/resend-verification', authLimiter);

// ======================================================
// REQUEST LOGGER
// Simple request log for debugging
// ======================================================
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ======================================================
// STRIPE WEBHOOK
// MUST be before any JSON parsing
// ======================================================
app.use('/api/stripe', stripeWebhookRoute);

// ======================================================
// BODY PARSER
// Skip Stripe routes to protect raw webhook body
// ======================================================
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api/stripe')) {
    return next();
  }

  return express.json({ limit: '1mb' })(req, res, next);
});

// ======================================================
// INVALID JSON HANDLER
// ======================================================

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
    return res.status(400).json({
      error: 'Invalid JSON payload',
    });
  }

  next(err);
});

// ======================================================
// GLOBAL APP VERSION
// Changes every backend restart
// ======================================================
const APP_VERSION = '20260903d';

// ======================================================
// VERSION ENDPOINT
// ======================================================
app.get('/api/version', (req, res) => {
  res.json({
    version: APP_VERSION,
  });
});

// TEMP DEBUG — list every product for one vendor (all statuses, not just
// the public storefront's active-only view), flagging which ones still
// look untouched by AI listing generation (empty shortDescription/
// bulletPoints — the two fields the generator always fills together with
// title). Remove after use.
app.get('/api/_debug-vendor-products/:vendorId', async (req, res) => {
  try {
    const { default: Product } = await import('./models/product.js');
    const products = await Product.find({ vendor: req.params.vendorId })
      .select('_id name shortDescription bulletPoints slug active archived').lean();
    res.json({
      total: products.length,
      products: products.map(p => ({
        _id: p._id, name: p.name, slug: p.slug, active: p.active, archived: p.archived,
        neverGenerated: !p.shortDescription || !p.bulletPoints,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// TEMP DEBUG — fix stale slugs on products that WERE already AI-generated
// (non-empty shortDescription/bulletPoints) but whose slug still reflects
// the old pre-generation title, because the generator ran before the
// slug-regeneration fix existed. Pure DB housekeeping, no AI calls. Remove
// after use.
app.post('/api/_debug-fix-slugs/:vendorId', async (req, res) => {
  try {
    const { default: Product } = await import('./models/product.js');
    const { generateSlug } = await import('./routes/products.js');
    const products = await Product.find({ vendor: req.params.vendorId })
      .select('_id name shortDescription bulletPoints slug').lean();
    const fixed = [];
    for (const p of products) {
      if (!p.shortDescription || !p.bulletPoints) continue; // never generated — leave alone
      const baseSlug = generateSlug(p.name);
      if (p.slug === baseSlug) continue; // already matches, nothing to do
      let uniqueSlug = baseSlug;
      let counter = 1;
      while (await Product.findOne({ slug: uniqueSlug, _id: { $ne: p._id } })) {
        uniqueSlug = `${baseSlug}-${counter}`;
        counter++;
      }
      await Product.updateOne({ _id: p._id }, { $set: { slug: uniqueSlug } });
      fixed.push({ _id: p._id, name: p.name, oldSlug: p.slug, newSlug: uniqueSlug });
    }
    res.json({ fixedCount: fixed.length, fixed });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ======================================================
// HEALTH CHECK
// ======================================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    time: new Date().toISOString(),
    geoIpLoaded: isGeoIpLoaded(),
  });
});

// ======================================================
// ENVIRONMENT VALIDATION
// ======================================================
const mongoUri = process.env.MONGODB_URI;
const ownerId = process.env.OWNER_USER_ID;

if (!mongoUri) {
  console.error('❌ MONGODB_URI is not defined');
  process.exit(1);
}

if (!ownerId) {
  console.error('❌ OWNER_USER_ID is not defined');
  process.exit(1);
}

// ======================================================
// API ROUTES
// ======================================================
app.use('/api/auth', authRoute);
app.use('/api/auth', passwordResetRoute);
app.use('/api/vendor', vendorRoutes);
app.use('/api/orders', ordersRoute);
app.use('/api/products', productsRoute);
app.use('/api/cart', cartRoutes);

app.use('/api/admin/orders', adminOrdersRoute);
app.use('/api/admin/users', adminUsersRoute);
app.use('/api/admin/config', adminConfigRoute);

app.use('/api/admin/vendors', adminVendorsRoutes);
app.use('/api/reviews', reviewsRoute);
app.use('/api/stores', storesRoute);
app.use('/api/account', accountRoute);
app.use('/api/messages', messagesRoute);
app.use('/api/interactions', trackRoute);
app.use('/api/admin/analytics', adminAnalyticsRoute);
app.use('/api', sitemapRoute);
app.use('/api', publicStatusRoute);
app.use('/api/currency', currencyRoute);

// ======================================================
// 404 HANDLER
// ======================================================
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
  });
});

// ======================================================
// GLOBAL ERROR HANDLER
// ======================================================
app.use((err, req, res, next) => {
  console.error('UNHANDLED ERROR:', err);

  res.status(500).json({
    error: 'Internal server error',
  });
});

// ======================================================
// START SERVER FIRST (CRITICAL FOR RENDER)
// ======================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Sell4Life backend running on port ${PORT}`);

  // 🔥 START WORKER HERE

  initGeoIp();
});

// ======================================================
// CONNECT DATABASE (NON-BLOCKING)
// ======================================================

mongoose
  .connect(mongoUri, {
    autoIndex: true,
    serverSelectionTimeoutMS: 5000,
  })
  .then(async () => {
    console.log('✅ MongoDB connected');

    const ownerUser = await User.findById(ownerId);

    if (!ownerUser) {
      console.error('❌ OWNER USER NOT FOUND');
      process.exit(1);
    }

    if (ownerUser.role !== 'admin') {
      console.error('❌ OWNER USER MUST HAVE ADMIN ROLE');
      process.exit(1);
    }

    console.log('✅ Owner account validated');

    // ======================================================
    // START REFUND WORKER
    // ======================================================

    startRefundWorker();
    startVendorPayoutWorker();
    startCjProductSyncWorker();
    startCjOrderStatusSyncWorker();
    startAnalyticsRollupWorker();
    startSellerInviteWorker();
  });
