/* ======================================================
   STRIPE CONFIGURATION
====================================================== */

import Stripe from 'stripe';

/* ======================================================
   ENVIRONMENT VALIDATION
====================================================== */

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

if (!STRIPE_SECRET_KEY) {
  console.error('❌ STRIPE_SECRET_KEY is not defined');
  process.exit(1);
}

/* ======================================================
   STRIPE CLIENT
====================================================== */

const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16',

  /* ======================================================
     NETWORK CONFIG
     Prevents hanging connections
  ====================================================== */

  maxNetworkRetries: 2,

  timeout: 30000,
});

/* ======================================================
   EXPORT CLIENT
====================================================== */

export default stripe;
