// ======================================================
// SELL4LIFE – ORDERS ROUTES
// CLEAN + CONSISTENT + ITEM-LEVEL RETURN FOUNDATION
// ======================================================

import express from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import bcrypt from 'bcrypt';

import {
  canRequestCancel,
  getDerivedOrderStatus,
  getDerivedVendorStatus,
  getDerivedPaymentStatus,
} from '../utils/orderLogic.js';

import { pushUniqueHistory } from '../utils/historyLogic.js';

import { findOrderItem, validateReturnRequest, applyReturnRequest } from '../utils/returnLogic.js';

import Vendor from '../models/vendor.js';
import Order from '../models/order.js';
import Product from '../models/product.js';
import User from '../models/user.js';

import stripe from '../config/stripe.js';

import authMiddleware from '../middleware/authMiddleware.js';
import { resolveAcceptedOffer } from '../utils/offerLogic.js';
import { isCountryAllowedByScope } from '../utils/shippingScope.js';
import { getPlatformConfig } from '../models/platformConfig.js';
import { COOKIE_OPTS, generateBaseUsername, createUniqueUsername, createToken } from '../utils/authTokens.js';

const router = express.Router();

/* ======================================================
   NORMALIZE ORDER
====================================================== */

// Strip vendor-internal/private fields before an item ever reaches the buyer
// (supplier sourcing info must never leak to the customer who bought it).
function sanitizeItemForBuyer(item) {
  const obj = typeof item.toObject === 'function' ? item.toObject() : { ...item };
  delete obj.supplier;
  delete obj.supplierUrl;
  return obj;
}

function normalizeOrder(order) {
  return {
    id: order._id.toString(),
    shortId: order.shortId,

    user: order.user,
    email: order.email,

    items: (order.items || []).map(sanitizeItemForBuyer),
    vendorOrders: (order.vendorOrders || []).map((vo) => ({
      vendorId:       String(vo.vendorId),
      vendorStoreName: vo.vendorStoreName || vo.vendorName || '',
      status:         vo.status,
      trackingNumber: vo.trackingNumber || '',
      carrier:        vo.carrier || '',
    })),

    subtotal: order.subtotal,
    shipping: order.shipping,
    tax: order.tax,
    discount: order.discount,
    platformFee: order.platformFee,
    total: order.total,

    currency: order.currency,

    status: getDerivedOrderStatus(order),

    paymentStatus: getDerivedPaymentStatus(order),

    refundStatus: order.refundStatus,
    paymentIntentId: order.paymentIntentId,

    statusHistory: order.statusHistory || [],

    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

/* ======================================================
   CREATE PAYMENT INTENT
====================================================== */

// Shared by the authenticated and guest checkout routes — item validation,
// pricing, the EU-selling gate, and PaymentIntent creation are identical
// either way, the only difference is where buyerId/vendor come from.
async function createOrderPaymentIntent({ items, buyerId, vendor }) {
  if (!Array.isArray(items) || !items.length) {
    const err = new Error('Invalid cart data');
    err.status = 400;
    throw err;
  }

  const normalizedItems = await Promise.all(
    items.map(async (item) => {
      if (!mongoose.Types.ObjectId.isValid(item.productId)) {
        throw new Error('Invalid productId');
      }

      const product = await Product.findById(item.productId);

      if (!product) throw new Error('Product not found');
      if (!product.vendor) throw new Error('Product has no vendor');
      if (!product.active || product.archived) {
        throw new Error('Product not available');
      }

      if (vendor && String(product.vendor) === String(vendor._id)) {
        throw new Error('You cannot buy your own product');
      }

      const quantity = Math.min(99, Math.max(1, parseInt(item.quantity, 10) || 1));
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100) {
        throw new Error('Invalid quantity');
      }

      // Resolve the selected variant (if any) so price/stock reflect what
      // the buyer actually saw and added to cart, not just the base
      // product — variants can have their own price and stock, independent
      // of the base product fields, and the charge must match the display.
      const variantSku = item.variantSku || '';
      const matchedVariant = variantSku
        ? (product.variants || []).find(v => v.sku && v.sku.trim() === variantSku.trim())
        : null;

      const effectiveStock = (matchedVariant?.stock != null) ? matchedVariant.stock : product.stock;
      if (product.trackInventory && effectiveStock < quantity) {
        throw new Error(`${product.name} is out of stock`);
      }

      // An accepted offer always wins over listed/variant price — it's a
      // single-unit agreement, re-verified against our own stored message,
      // never taken from the client. Offered items ignore variants (offers
      // are only ever possible on casual/refurbished listings, which can't
      // have variants at all). Guests can't have a pending offer (offers
      // require an account), so item.offerMessageId is simply absent for them.
      let price = Number((matchedVariant?.price != null) ? matchedVariant.price : product.price);
      let offerMessageId = null;
      if (item.offerMessageId) {
        const offer = await resolveAcceptedOffer({
          offerMessageId: item.offerMessageId,
          buyerId,
          productId: product._id,
        });
        if (!offer) throw new Error('This offer is no longer valid.');
        price = offer.amount;
        offerMessageId = String(offer.msg._id);
      }

      const shippingCost = product.shipIncluded ? 0 : Number(product.shippingCost || 0);
      const subtotal = Number((price * quantity).toFixed(2));
      return {
        productId: product._id,
        vendorId: product.vendor,

        variantSku,
        sku: product.sku || '',

        name: product.name,
        price,
        quantity,
        subtotal,
        shippingCost,

        image: matchedVariant?.image || product.images?.[0] || '/assets/images/products/sell4life-placeholder.png',

        attributes: item.attributes || {},
        offerMessageId,
      };
    })
  );

  // A completed sale is what starts the clock on DAC7 (EU digital
  // platform reporting) registration for the platform, which isn't
  // sorted yet — so real checkout stays blocked for any non-GB vendor
  // until an admin flips euSellingEnabled on. Listing/browsing an EU
  // vendor's products is unaffected, only completing a real purchase.
  const cfg = await getPlatformConfig();
  if (!cfg.euSellingEnabled) {
    const vendorIds = [...new Set(normalizedItems.map((item) => String(item.vendorId)))];
    const sellingVendors = await Vendor.find({ _id: { $in: vendorIds } }).select('country storeName');
    const blockedVendor = sellingVendors.find((v) => v.country && v.country !== 'GB');
    if (blockedVendor) {
      const err = new Error(`"${blockedVendor.storeName}" isn't available for purchase yet — international seller payouts are still being finalized. Please check back soon.`);
      err.status = 400;
      throw err;
    }
  }

  const subtotal = Number(normalizedItems.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));
  const shippingAmount = Number(normalizedItems.reduce((sum, item) => sum + item.shippingCost, 0).toFixed(2));
  const total = Number((subtotal + shippingAmount).toFixed(2));

  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(total * 100),
    currency: 'gbp',
    automatic_payment_methods: { enabled: true },
    metadata: {
      userId: String(buyerId),
      shipping: String(shippingAmount),
      items: JSON.stringify(
        normalizedItems.map((item) => ({
          productId: String(item.productId),
          quantity: item.quantity,
          variantSku: item.variantSku || '',
          offerMessageId: item.offerMessageId || '',
        }))
      ),
    },
  });

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    shipping: shippingAmount,
  };
}

router.post('/create-payment-intent', authMiddleware, async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ userId: req.user._id });
    const result = await createOrderPaymentIntent({ items: req.body.items, buyerId: req.user._id, vendor });
    res.json(result);
  } catch (err) {
    console.error('PAYMENT ERROR:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Payment error',
    });
  }
});

/* ======================================================
   GUEST CHECKOUT — no account required. Auto-creates a lightweight
   User (unusable placeholder password, passwordSet: false) so every
   later step (shipping-address, the Stripe webhook, viewing the order,
   messaging) reuses the exact same authenticated pipeline a real
   account uses — the only thing deferred is the buyer ever choosing
   their own password. See middleware/authMiddleware.js for the
   passwordSet-based email-verify exemption this relies on.
====================================================== */
router.post('/guest-checkout', async (req, res) => {
  try {
    const email = String(req.body?.email || '').toLowerCase().trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'A valid email is required' });
    }

    let user = await User.findOne({ email });

    if (user && user.passwordSet !== false) {
      // A real, already-claimed account owns this email — never silently
      // fold a guest order into someone else's account.
      return res.status(409).json({
        error: 'An account already exists with this email. Please sign in to continue.',
        code: 'ACCOUNT_EXISTS',
      });
    }

    if (!user) {
      const namePart = email.split('@')[0].replace(/[^a-zA-Z]/g, '') || 'Guest';
      const name = namePart.charAt(0).toUpperCase() + namePart.slice(1);
      const baseUsername = generateBaseUsername(name) || 'guest';
      const username = await createUniqueUsername(baseUsername);
      // Unusable placeholder — nobody can log in with it; passwordSet:false
      // is what actually marks this as an unclaimed guest account.
      const placeholderPassword = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);

      user = await User.create({
        name,
        username,
        email,
        password: placeholderPassword,
        role: 'user',
        emailVerified: false,
        passwordSet: false,
      });
    }

    const result = await createOrderPaymentIntent({ items: req.body.items, buyerId: user._id, vendor: null });
    const token = createToken(user);

    res.cookie('s4l_token', token, COOKIE_OPTS).json({
      ...result,
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (err) {
    console.error('GUEST CHECKOUT ERROR:', err);
    res.status(err.status || 500).json({
      error: err.message || 'Payment error',
    });
  }
});

/* ======================================================
   SET SHIPPING ADDRESS ON AN IN-PROGRESS PAYMENT INTENT
   Called from checkout right before confirming payment, so the
   webhook has a real delivery address to snapshot onto the order.
====================================================== */

router.post('/shipping-address', authMiddleware, async (req, res) => {
  try {
    const { paymentIntentId, name, phone, address1, address2, city, county, postcode, country, saveAsDefault } = req.body;

    if (!paymentIntentId) {
      return res.status(400).json({ error: 'Missing paymentIntentId' });
    }
    if (!name || !address1 || !city || !postcode) {
      return res.status(400).json({ error: 'Please fill in name, address, city and postcode' });
    }

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (!paymentIntent || paymentIntent.metadata?.userId !== String(req.user._id)) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const address = {
      name: String(name).trim(),
      phone: String(phone || '').trim(),
      address1: String(address1).trim(),
      address2: String(address2 || '').trim(),
      city: String(city).trim(),
      county: String(county || '').trim(),
      postcode: String(postcode).trim(),
      // Checkout's country field is now a real <select> of ISO 3166-1
      // alpha-2 codes (frontend/assets/js/countries.js) — trust it, just
      // sanity-check the shape. This used to be unconditionally forced to
      // 'GB' regardless of what the buyer picked, silently mislabeling
      // every non-UK order's real destination (CJ auto-order creation,
      // HMRC reporting, and the shipping-scope check below all read this
      // field) — see project memory for the incident this caused.
      country: /^[A-Z]{2}$/.test(String(country || '').toUpperCase())
        ? String(country).toUpperCase()
        : 'GB',
    };

    // Real enforcement of each item's seller-set shipping scope — this is
    // the authoritative check (the product page's own check is browse-time
    // UI only, never trust that alone). Runs here specifically because
    // it's the earliest point the real destination country is known, and
    // it's before stripe.confirmPayment ever runs client-side, so a reject
    // here means no money has moved yet.
    try {
      const items = JSON.parse(paymentIntent.metadata?.items || '[]');
      const productIds = [...new Set(items.map(i => i.productId))];
      const products = await Product.find({ _id: { $in: productIds } }).select('name shippingScope shippingCountries');
      const blocked = products.find(p => !isCountryAllowedByScope(p, address.country));
      if (blocked) {
        return res.status(400).json({
          error: `"${blocked.name}" isn't available for delivery to the selected country. Please remove it from your cart or choose a different delivery address.`,
        });
      }
    } catch (err) {
      // A malformed/missing items list shouldn't block a legitimate
      // checkout — this check is a safety net, not the primary validation
      // (create-payment-intent already validated the cart itself).
      console.warn('shipping-scope check skipped:', err.message);
    }

    await stripe.paymentIntents.update(paymentIntentId, {
      metadata: { shippingAddress: JSON.stringify(address) },
    });

    if (saveAsDefault) {
      const User = (await import('../models/user.js')).default;
      await User.findByIdAndUpdate(req.user._id, { defaultShippingAddress: address });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('SHIPPING ADDRESS ERROR:', err);
    res.status(500).json({ error: 'Could not save shipping address' });
  }
});

/* ======================================================
   GET MY ORDERS
====================================================== */

router.get('/', authMiddleware, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id }).sort({
      createdAt: -1,
    });

    res.json({
      orders: orders.map(normalizeOrder),
    });
  } catch (err) {
    console.error('GET ORDERS ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   HAS THE CURRENT USER BOUGHT THIS PRODUCT?
   Lightweight existence check for the product page — lets a buyer
   revisiting a sold-out casual listing see "You bought this item"
   instead of a generic "Sold" state.
====================================================== */

router.get('/purchased/:productId', authMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.productId)) {
      return res.status(400).json({ error: 'Invalid product id' });
    }
    const exists = await Order.exists({
      user: req.user._id,
      'items.productId': req.params.productId,
      paymentStatus: { $in: ['paid', 'refunded', 'refund_scheduled', 'partially_refunded'] },
    });
    res.json({ purchased: !!exists });
  } catch (err) {
    console.error('CHECK PURCHASED ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET ORDER BY PAYMENT INTENT
====================================================== */

router.get('/by-payment/:paymentIntentId', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findOne({
      paymentIntentId: req.params.paymentIntentId,
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (String(order.user) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    res.json(normalizeOrder(order));
  } catch (err) {
    console.error('GET ORDER BY PAYMENT ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET ORDER BY ID
====================================================== */

router.get('/:id', authMiddleware, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid order id' });
  }

  try {
    const order = await Order.findOne({
      _id: req.params.id,
      user: req.user.id,
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(normalizeOrder(order));
  } catch (err) {
    console.error('GET ORDER ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   CUSTOMER REQUEST CANCEL
   ORDER-LEVEL FOR NOW
====================================================== */

router.patch('/:id/request-cancel', authMiddleware, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid order id' });
  }

  try {
    const order = await Order.findById(req.params.id);

    if (!order || String(order.user) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const check = canRequestCancel(order);

    if (!check.ok) {
      return res.status(400).json({ error: check.error });
    }

    order.cancelRequestedAt = new Date();

    if (order.paymentStatus === 'refunded') {
      return res.status(400).json({
        error: 'Refunded orders cannot be cancelled',
      });
    }

    order.vendorOrders.forEach((vendorOrder) => {
      vendorOrder.status = 'Cancel Requested';
    });

    order.items.forEach((item) => {
      if (['Pending', 'Processing'].includes(item.status)) {
        item.status = 'Cancel Requested';
      }
    });

    pushUniqueHistory(order, 'Cancel Requested', 'Requested by customer');
    order.status = getDerivedOrderStatus(order);

    await order.save();

    res.json(normalizeOrder(order));
  } catch (err) {
    console.error('REQUEST CANCEL ERROR:', err);
    res.status(500).json({ error: 'Cancel request failed' });
  }
});

/* ======================================================
   CUSTOMER REQUEST ITEM CANCEL (PER-ITEM)
====================================================== */

router.patch('/:id/items/:itemId/cancel-request', authMiddleware, async (req, res) => {
  const { id, itemId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ error: 'Invalid order id' });
  if (!mongoose.Types.ObjectId.isValid(itemId))
    return res.status(400).json({ error: 'Invalid item id' });

  try {
    const order = await Order.findById(id);

    if (!order || String(order.user) !== String(req.user.id))
      return res.status(403).json({ error: 'Not allowed' });

    const item = findOrderItem(order, itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    if (item.refundStatus === 'processed')
      return res.status(400).json({ error: 'Item already refunded, cannot cancel' });

    if (!['Pending', 'Processing'].includes(item.status))
      return res.status(400).json({ error: `Cannot cancel item with status: ${item.status}` });

    item.status = 'Cancel Requested';

    const vendorOrder = order.vendorOrders.find(
      vo => String(vo.vendorId) === String(item.vendorId)
    );
    if (vendorOrder) {
      const vendorItems = order.items.filter(
        i => String(i.vendorId) === String(item.vendorId)
      );
      vendorOrder.status = getDerivedVendorStatus(vendorOrder, vendorItems);
    }

    pushUniqueHistory(order, 'Cancel Requested', `Cancel requested for ${item.name}`);
    order.status = getDerivedOrderStatus(order);

    await order.save();
    res.json(normalizeOrder(order));
  } catch (err) {
    console.error('ITEM CANCEL REQUEST ERROR:', err);
    res.status(500).json({ error: 'Cancel request failed' });
  }
});

/* ======================================================
   CUSTOMER REQUEST ITEM RETURN
   NEW ITEM-LEVEL PARTIAL RETURN ROUTE
====================================================== */

router.post('/:id/items/:itemId/return-request', authMiddleware, async (req, res) => {
  const { id, itemId } = req.params;
  const { quantity, reason, reasonCategory } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid order id' });
  }

  if (!mongoose.Types.ObjectId.isValid(itemId)) {
    return res.status(400).json({ error: 'Invalid item id' });
  }

  if (!['change_of_mind', 'faulty_damaged_wrong_misdescribed'].includes(reasonCategory)) {
    return res.status(400).json({ error: 'Please select a return reason category' });
  }

  try {
    const order = await Order.findById(id);

    if (!order || String(order.user) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const item = findOrderItem(order, itemId);

    if (!item) {
      return res.status(404).json({
        error: 'Item not found',
      });
    }

    if (item.refundStatus === 'processed') {
      return res.status(400).json({
        error: 'Item already refunded',
      });
    }

    const check = validateReturnRequest(order, item, quantity, reasonCategory);

    if (!check.ok) {
      return res.status(400).json({ error: check.error });
    }

    applyReturnRequest(order, item, quantity, reason, req.user._id, reasonCategory);

    // =====================================================
    // RECALCULATE VENDOR STATUS
    // =====================================================

    order.vendorOrders.forEach((vendorOrder) => {
      vendorOrder.status = getDerivedVendorStatus(vendorOrder, order.items);
    });

    // =====================================================
    // RECALCULATE GLOBAL ORDER STATUS
    // =====================================================

    order.status = getDerivedOrderStatus(order);

    await order.save();

    res.json(normalizeOrder(order));
  } catch (err) {
    console.error('ITEM RETURN REQUEST ERROR:', err);
    res.status(500).json({ error: 'Return request failed' });
  }
});

/* ======================================================
   LEGACY CUSTOMER REQUEST WHOLE ORDER RETURN
   TEMPORARY SUPPORT
====================================================== */

router.patch('/:id/request-return', authMiddleware, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid order id' });
  }

  try {
    const order = await Order.findById(req.params.id);

    if (!order || String(order.user) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const deliveredItems = order.items.filter((item) => item.status === 'Delivered');

    if (!deliveredItems.length) {
      return res.status(400).json({
        error: 'No delivered items available for return',
      });
    }

    for (const item of deliveredItems) {
      const availableQty =
        Number(item.quantity || 0) -
        Number(item.returnQuantity || 0) -
        Number(item.returnRequestedQuantity || 0);

      if (availableQty <= 0) continue;

      const check = validateReturnRequest(order, item, availableQty);

      if (check.ok) {
        applyReturnRequest(order, item, availableQty, 'Whole order return requested', req.user._id);
      }
    }

    order.status = getDerivedOrderStatus(order);

    await order.save();

    res.json(normalizeOrder(order));
  } catch (err) {
    console.error('WHOLE ORDER RETURN REQUEST ERROR:', err);
    res.status(500).json({ error: 'Return request failed' });
  }
});

export default router;
