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
import authRoute from './routes/auth.js';
import vendorRoutes from './routes/vendor.js';
import ordersRoute from './routes/orders.js';
import productsRoute from './routes/products.js';
import cartRoutes from './routes/cart.js';
import adminOrdersRoute from './routes/adminOrders.js';
import adminUsersRoute from './routes/adminUsers.js';
import adminVendorsRoutes from './routes/adminVendors.js';
import stripeWebhookRoute from './routes/stripeWebhook.js';

// ======================================================
// APP INITIALIZATION
// ======================================================
const app = express();

// ======================================================
// TRUST PROXY
// Important for Render / reverse proxies
// ======================================================
app.set('trust proxy', 1);

// ======================================================
// SECURITY HEADERS
// ======================================================
app.use(helmet());

// ======================================================
// COOKIE PARSER
// ======================================================
app.use(cookieParser());

// ======================================================
// RATE LIMITERS
// General API limiter + stricter auth limiter
// ======================================================
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api', apiLimiter);
app.post('/api/auth/login', authLimiter);
app.post('/api/auth/register', authLimiter);

// ======================================================
// CORS CONFIGURATION
// ======================================================
const allowedOrigins = [
  'https://sell4life.com',
  'https://www.sell4life.com',
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
const APP_VERSION = '20260522i';

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
app.use('/api/vendor', vendorRoutes);
app.use('/api/orders', ordersRoute);
app.use('/api/products', productsRoute);
app.use('/api/cart', cartRoutes);

app.use('/api/admin/orders', adminOrdersRoute);
app.use('/api/admin/users', adminUsersRoute);

app.use('/api/admin/vendors', adminVendorsRoutes);

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
  });
