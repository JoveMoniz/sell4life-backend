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
// TEMP ACTION — key-gated. (1) Soft-trashes the 10 confirmed stale
// duplicate products (same vendor, same name, never-synced £0 copy
// sitting alongside a properly-synced copy) — same safety check as
// the real DELETE /vendor/products/:id route (skips if it has real
// orders). (2) Kicks off a full re-sync of every CJ-matched product
// across all CJ-connected vendors, in the background, so shippingCost
// reflects CJ's current real rates instead of old/stale values.
// Progress readable via /api/_debug_resync_status. Remove both after use.
// ======================================================
const STALE_DUPLICATE_IDS = [
  '6a3714c3c88841b331848682', // 15.6-Inch Waterproof Laptop Sleeve Briefcase (£0 copy)
  '6a3714c4c88841b331848694', // Adjustable Aluminium Laptop Stand with Dual Phone Holders (£0 copy)
  '6a3714c4c88841b3318486a6', // Foldable Adjustable Laptop Stand for 11-17 Inch Devices (£0 copy)
  '6a371774c88841b33184888b', // Women's Large Convertible Shoulder & Crossbody Bag (£0 copy)
  '6a371774c88841b33184888e', // Women's Structured Crossbody Handbag (£0 copy)
  '6a371774c88841b331848897', // Women's Large Shoulder & Crossbody Bag (£0 copy)
  '6a371774c88841b33184889a', // Minimalist PU Leather Backpack (£0 copy)
  '6a371774c88841b3318488a6', // Women's Printed Tote Bag with Flower Charm (£0 copy)
  '6a371775c88841b3318488b8', // Women's Large Waterproof Tote Bag (£0 copy, draft)
  '6a371775c88841b3318488bb', // Women's Small Convertible Shoulder Bag Backpack (£0 copy, draft)
];

let _resyncStatus = { running: false, total: 0, done: 0, updated: 0, failed: 0, skipped: 0, startedAt: null, finishedAt: null };

app.get('/api/_action_cleanup_and_resync', async (req, res) => {
  if (req.query.k !== 's4l-debug-20260912k') return res.status(404).end();
  try {
    const Product = (await import('./models/product.js')).default;
    const Vendor = (await import('./models/vendor.js')).default;
    const Order = (await import('./models/order.js')).default;
    const { decryptCredential } = await import('./utils/shippingProviders/registry.js');
    const { syncProductFromCj, looksCjSourced } = await import('./utils/cjProductSync.js');

    // (1) Trash confirmed stale duplicates
    const trashed = [];
    const skippedHasOrders = [];
    for (const id of STALE_DUPLICATE_IDS) {
      const product = await Product.findById(id);
      if (!product || product.deletedAt) continue;
      const hasOrders = await Order.exists({ 'items.productId': product._id });
      if (hasOrders) { skippedHasOrders.push(id); continue; }
      product.deletedAt = new Date();
      await product.save();
      trashed.push(id);
    }

    // (2) Kick off full re-sync in the background (not awaited)
    if (!_resyncStatus.running) {
      const vendors = await Vendor.find({
        type: 'professional',
        'supplierCredentials.cjdropshipping': { $exists: true, $ne: null },
      }).lean();

      const jobs = [];
      for (const vendor of vendors) {
        let credential;
        try { credential = decryptCredential(vendor.supplierCredentials.cjdropshipping); } catch (_) { continue; }
        const products = await Product.find({ vendor: vendor._id, archived: { $ne: true }, deletedAt: null });
        for (const product of products) {
          if (looksCjSourced(product)) jobs.push({ product, credential });
        }
      }

      _resyncStatus = { running: true, total: jobs.length, done: 0, updated: 0, failed: 0, skipped: 0, startedAt: new Date().toISOString(), finishedAt: null };

      (async () => {
        for (const { product, credential } of jobs) {
          try {
            const r = await syncProductFromCj(product, credential);
            _resyncStatus.done++;
            if (r.status === 'updated') _resyncStatus.updated++;
            else if (r.status === 'failed') _resyncStatus.failed++;
            else _resyncStatus.skipped++;
          } catch (err) {
            _resyncStatus.done++;
            _resyncStatus.failed++;
          }
        }
        _resyncStatus.running = false;
        _resyncStatus.finishedAt = new Date().toISOString();
      })();
    }

    res.json({ trashed, skippedHasOrders, resyncStarted: _resyncStatus.total });
  } catch (err) {
    res.json({ error: err.message, stack: err.stack });
  }
});

app.get('/api/_debug_resync_status', (req, res) => {
  if (req.query.k !== 's4l-debug-20260912k') return res.status(404).end();
  res.json(_resyncStatus);
});

// TEMP DEBUG — spot-check real numbers after the full resync completed.
// Remove alongside the two routes above.
app.get('/api/_debug_resync_spotcheck', async (req, res) => {
  if (req.query.k !== 's4l-debug-20260912k') return res.status(404).end();
  try {
    const Vendor = (await import('./models/vendor.js')).default;
    const Product = (await import('./models/product.js')).default;
    const { looksCjSourced } = await import('./utils/cjProductSync.js');

    const vendors = await Vendor.find({
      type: 'professional',
      'supplierCredentials.cjdropshipping': { $exists: true, $ne: null },
    }).select('_id storeName').lean();

    const results = [];
    for (const vendor of vendors) {
      const products = await Product.find({ vendor: vendor._id, archived: { $ne: true }, deletedAt: null })
        .select('name variants shippingOriginCountry shippingCost').lean();
      const cjProducts = products.filter(looksCjSourced);
      const matched = cjProducts.filter(p => (p.variants || []).some(v => v.cjVid));
      const zero = matched.filter(p => Number(p.shippingCost) === 0).length;
      const nonZero = matched.filter(p => Number(p.shippingCost) > 0).length;
      const sample = matched.slice(0, 10).map(p => ({ name: p.name, origin: p.shippingOriginCountry, shippingCost: p.shippingCost }));
      results.push({ vendor: vendor.storeName, totalProducts: products.length, matched: matched.length, zero, nonZero, sample });
    }
    res.json({ results });
  } catch (err) {
    res.json({ error: err.message });
  }
});

// TEMP DEBUG — same as above but split by active/draft, since the vendor
// clarified only the draft batch (the ones the CSV origin-only import
// touched) should ever be GB — the rest of the catalog is genuinely
// China-sourced and always was. Checks whether the earlier "regression"
// concern was real or just an unfiltered sample mixing both groups.
app.get('/api/_debug_resync_by_status', async (req, res) => {
  if (req.query.k !== 's4l-debug-20260912k') return res.status(404).end();
  try {
    const Vendor = (await import('./models/vendor.js')).default;
    const Product = (await import('./models/product.js')).default;
    const { looksCjSourced } = await import('./utils/cjProductSync.js');

    const vendors = await Vendor.find({
      type: 'professional',
      'supplierCredentials.cjdropshipping': { $exists: true, $ne: null },
    }).select('_id storeName').lean();

    const results = [];
    for (const vendor of vendors) {
      const products = await Product.find({ vendor: vendor._id, archived: { $ne: true }, deletedAt: null })
        .select('name active variants shippingOriginCountry shippingCost').lean();
      const cjProducts = products.filter(looksCjSourced).filter(p => (p.variants || []).some(v => v.cjVid));

      for (const activeFlag of [false, true]) {
        const group = cjProducts.filter(p => p.active === activeFlag);
        const gb = group.filter(p => p.shippingOriginCountry === 'GB').length;
        const cn = group.filter(p => p.shippingOriginCountry === 'CN' || !p.shippingOriginCountry).length;
        results.push({
          vendor: vendor.storeName,
          status: activeFlag ? 'active' : 'draft',
          matchedCount: group.length,
          gbCount: gb,
          cnCount: cn,
          sample: group.slice(0, 6).map(p => ({ name: p.name, origin: p.shippingOriginCountry, shippingCost: p.shippingCost })),
        });
      }
    }
    res.json({ results });
  } catch (err) {
    res.json({ error: err.message });
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
