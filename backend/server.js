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
  max: 5000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again shortly.' },
  // Tracking, the admin analytics dashboard, and vendor tools get their own,
  // more generous limiters below — a single active visitor already fires
  // several beacons per pageview (shared-IP scenarios like offices or
  // mobile carrier NAT would otherwise exhaust this limit almost
  // immediately), and the dashboard's 20s realtime poll plus its
  // multi-endpoint page load adds up fast under normal, legitimate use
  // by an already-authenticated admin. The base ceiling itself is raised
  // from the original 500 for the same shared-IP reason: a household or
  // small office doing normal shopping alongside a vendor's own admin work
  // shares one public IP and one 15-minute bucket, and 500 proved too easy
  // to exhaust with entirely legitimate combined traffic.
  skip: (req) => req.path.startsWith('/interactions') || req.path.startsWith('/admin/analytics') || req.path.startsWith('/vendor'),
});

// Authenticated vendors only — bulk catalog tools (CJ sync, AI re-match,
// AI listing generation) legitimately fire one request per product in a
// tight loop, easily tens or low hundreds of requests in a single run, on
// top of normal store-management browsing. Abuse risk here is much lower
// than on public endpoints since every request requires a logged-in vendor.
const vendorLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests — please try again shortly.' },
});

// Raised from the original 20 for the same shared-IP reason as apiLimiter
// above: a household or office IP where several people sign in, plus normal
// mistyped-password retries, exhausted 20/15min on entirely legitimate
// traffic. 60 still caps sustained password-guessing far below what's
// needed against a properly-hashed password.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 60,
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
app.use('/api/vendor', vendorLimiter);
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
const APP_VERSION = '20260904a';

// ======================================================
// VERSION ENDPOINT
// ======================================================
app.get('/api/version', (req, res) => {
  res.json({
    version: APP_VERSION,
  });
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

// TEMPORARY — read-only draft-listing audit, remove after use.
app.get('/api/_debug_draft_audit', async (req, res) => {
  if (req.query.k !== 'draft-audit-7c24') return res.status(404).end();
  try {
    const Vendor = (await import('./models/vendor.js')).default;
    const Product = (await import('./models/product.js')).default;

    const vendor = await Vendor.findOne({
      storeName: { $regex: /forge\s*&\s*found/i },
    }).select('_id storeName');
    if (!vendor) return res.json({ error: 'vendor not found' });

    // Matches the real Draft tab filter exactly (see routes/vendor.js) —
    // active:false alone also sweeps in archived/trashed/admin-suspended
    // items, which is why the first pass over-counted.
    const drafts = await Product.find({
      vendor: vendor._id,
      active: false,
      archived: false,
      deletedAt: null,
    }).select('name description shortDescription bulletPoints images price stock trackInventory shippingCost shippingScope category subcategory variants comparePrice adminSuspended');

    const report = drafts.map((p) => {
      const issues = [];
      if (!p.images || p.images.length === 0) issues.push('no images');
      if (!p.description || p.description.trim().length < 20) issues.push('missing/short description');
      if (!p.bulletPoints || (Array.isArray(p.bulletPoints) ? p.bulletPoints.length === 0 : !p.bulletPoints.trim())) issues.push('no bullet points');
      if (!p.category) issues.push('no category');
      if (!p.subcategory) issues.push('no subcategory');
      if (p.price == null || p.price <= 0) issues.push('price is 0/missing');
      if (p.comparePrice != null && Number(p.comparePrice) <= Number(p.price)) issues.push('compare-at price not above price');
      if (p.shippingCost == null) issues.push('no shippingCost set');
      if (!p.shippingScope) issues.push('no shippingScope');
      if (p.adminSuspended) issues.push('ADMIN SUSPENDED');

      const hasVariants = Array.isArray(p.variants) && p.variants.length > 0;
      if (!hasVariants) {
        if (p.stock == null) issues.push('no stock value');
        else if (Number(p.stock) <= 0 && p.trackInventory) issues.push('stock 0 but trackInventory true (will show sold-out immediately)');
      } else {
        const productStock = Number(p.stock);
        const productOos = p.stock != null && productStock <= 0;
        p.variants.forEach((v, i) => {
          const label = v.sku || `variant ${i + 1}`;
          if (!v.attributes || Object.keys(v.attributes).length === 0) issues.push(`${label}: no attributes`);
          if (v.stock == null) issues.push(`${label}: no stock value`);
          const variantOos = v.stock != null && Number(v.stock) <= 0;
          if (productOos !== variantOos && v.stock != null && p.stock != null) {
            issues.push(`${label}: product stock (${p.stock}) and variant stock (${v.stock}) disagree on in-stock status`);
          }
          if (v.price == null) issues.push(`${label}: no price`);
        });
      }

      return {
        id: p._id,
        name: p.name,
        issues,
      };
    });

    res.json({
      vendor: vendor.storeName,
      totalDrafts: drafts.length,
      draftsWithIssues: report.filter((r) => r.issues.length > 0).length,
      report,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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
