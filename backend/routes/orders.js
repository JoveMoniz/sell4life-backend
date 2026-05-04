// ======================================================
// SELL4LIFE – ORDERS ROUTES (CLEAN + CONSISTENT)
// ======================================================

import { canUpdateStatus, canRequestCancel, canRequestReturn } from '../utils/orderLogic.js';
import { scheduleRefund } from '../utils/refundLogic.js';
import express from 'express';
import mongoose from 'mongoose';

import Vendor from '../models/vendor.js';
import Order from '../models/order.js';
import Product from '../models/product.js';

import stripe from '../config/stripe.js';

import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';

const router = express.Router();

/* ======================================================
   HELPER: DERIVED STATUS (GLOBAL VIEW)
====================================================== */

function getDerivedOrderStatus(order) {
  const statuses = Array.isArray(order.vendorOrders)
    ? order.vendorOrders.map((vo) => vo.status)
    : [];

  if (!statuses.length) return order.status;

  if (statuses.some((s) => s === 'Cancel Requested')) return 'Cancel Requested';
  if (statuses.some((s) => s === 'Return Requested')) return 'Return Requested';
  if (statuses.some((s) => s === 'Return Approved')) return 'Return Approved';

  if (statuses.every((s) => s === 'Cancelled')) return 'Cancelled';
  if (statuses.every((s) => s === 'Returned')) return 'Returned';
  if (statuses.every((s) => s === 'Delivered')) return 'Delivered';
  if (statuses.some((s) => s === 'Shipped')) return 'Shipped';
  if (statuses.some((s) => s === 'Processing')) return 'Processing';

  return order.status || 'Pending';
}

function normalizeOrder(order) {
  return {
    id: order._id.toString(),
    shortId: order.shortId,
    user: order.user,
    items: order.items,
    subtotal: order.subtotal,
    shipping: order.shipping,
    tax: order.tax,
    total: order.total,
    status: getDerivedOrderStatus(order),
    paymentStatus: order.paymentStatus,
    paymentIntentId: order.paymentIntentId,
    statusHistory: order.statusHistory || [],
    createdAt: order.createdAt,
  };
}

/* ======================================================
   CREATE PAYMENT INTENT
====================================================== */

router.post('/create-payment-intent', authMiddleware, async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Invalid cart data' });
    }

    const vendor = await Vendor.findOne({ userId: req.user._id });

    const normalizedItems = await Promise.all(
      items.map(async (item) => {
        if (!mongoose.Types.ObjectId.isValid(item.productId)) {
          throw new Error('Invalid productId');
        }

        const product = await Product.findById(item.productId);

        if (!product) throw new Error('Product not found');
        if (!product.vendor) throw new Error('Product has no vendor');
        if (!product.active || product.archived) throw new Error('Product not available');

        if (vendor && String(product.vendor) === String(vendor._id)) {
          throw new Error('You cannot buy your own product');
        }

        const quantity = Number(item.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100) {
          throw new Error('Invalid quantity');
        }

        if (product.trackInventory && product.stock < quantity) {
          throw new Error(`${product.name} is out of stock`);
        }

        const price = Number(product.price);
        const subtotal = price * quantity;

        return {
          productId: product._id,
          vendorId: product.vendor,
          name: product.name,
          price,
          quantity,
          subtotal,
          image: product.images?.[0] || '/assets/images/products/sell4life-placeholder.png',
        };
      })
    );

    const total = normalizedItems.reduce((sum, i) => sum + i.subtotal, 0);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(total * 100),
      currency: 'gbp',
      automatic_payment_methods: { enabled: true },
      metadata: {
        userId: String(req.user._id),
        items: JSON.stringify(
          normalizedItems.map((i) => ({
            productId: String(i.productId),
            quantity: i.quantity,
            vendorId: String(i.vendorId),
            price: i.price,
          }))
        ),
      },
    });

    res.json({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error('PAYMENT ERROR:', err);
    res.status(500).json({ error: err.message || 'Payment error' });
  }
});

/* ======================================================
   GET MY ORDERS
====================================================== */

router.get('/', authMiddleware, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id }).sort({ createdAt: -1 });
    res.json({ orders: orders.map(normalizeOrder) });
  } catch {
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

    if (!order) return res.status(404).json({ error: 'Order not found' });

    if (order.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    res.json(normalizeOrder(order));
  } catch {
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

    if (!order) return res.status(404).json({ error: 'Order not found' });

    res.json(normalizeOrder(order));
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   CUSTOMER REQUEST CANCEL
====================================================== */

router.patch('/:id/request-cancel', authMiddleware, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid order id' });
  }
  try {
    const order = await Order.findById(req.params.id);

    if (!order || order.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const check = canRequestCancel(order);
    if (!check.ok) return res.status(400).json({ error: check.error });

    order.cancelRequestedAt = new Date();

    order.vendorOrders.forEach((vo) => {
      vo.status = 'Cancel Requested';
    });

    order.statusHistory.push({
      status: 'Cancel Requested',
      note: 'Requested by customer',
      date: new Date(),
    });

    await order.save();
    res.json(normalizeOrder(order));
  } catch {
    res.status(500).json({ error: 'Cancel request failed' });
  }
});

/* ======================================================
   CUSTOMER REQUEST RETURN
====================================================== */

router.patch('/:id/request-return', authMiddleware, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid order id' });
  }
  try {
    const order = await Order.findById(req.params.id);

    if (!order || order.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const check = canRequestReturn(order);
    if (!check.ok) return res.status(400).json({ error: check.error });

    order.returnRequestedAt = new Date();

    order.vendorOrders.forEach((vo) => {
      vo.status = 'Return Requested';
    });

    order.statusHistory.push({
      status: 'Return Requested',
      note: 'Requested by customer',
      date: new Date(),
    });

    await order.save();
    res.json(normalizeOrder(order));
  } catch {
    res.status(500).json({ error: 'Return request failed' });
  }
});

export default router;
