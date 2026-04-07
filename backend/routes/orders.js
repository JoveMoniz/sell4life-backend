import { canUpdateStatus, canRequestCancel, canRequestReturn } from '../utils/orderLogic.js';
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
   HELPER: NORMALIZE ORDER OUTPUT
====================================================== */

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
    status: order.status,
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

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Invalid cart data' });
    }

    const vendor = await Vendor.findOne({ userId: req.user._id });

    const normalizedItems = await Promise.all(
      items.map(async (item) => {
        const productId = item.productId;

        if (!productId || !mongoose.Types.ObjectId.isValid(productId)) {
          throw new Error('Invalid productId');
        }

        const product = await Product.findById(productId);

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

    const subtotal = normalizedItems.reduce((sum, i) => sum + i.subtotal, 0);
    const total = subtotal;

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
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET ORDER BY PAYMENT INTENT
   IMPORTANT: must stay before /:id
====================================================== */

router.get('/by-payment/:paymentIntentId', async (req, res) => {
  try {
    const order = await Order.findOne({
      paymentIntentId: req.params.paymentIntentId,
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(normalizeOrder(order));
  } catch (err) {
    console.error('Fetch by payment error:', err);
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

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const check = canRequestCancel(order);
    if (!check.ok) return res.status(400).json({ error: check.error });

    order.cancelRequestedAt = new Date();
    order.status = 'Cancel Requested';

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

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.user.toString() !== req.user.id) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const check = canRequestReturn(order);
    if (!check.ok) return res.status(400).json({ error: check.error });

    order.status = 'Return Requested';
    order.returnRequestedAt = new Date();

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

/* ======================================================
   ADMIN UPDATE STATUS
====================================================== */

router.patch('/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid order id' });
  }

  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.paymentStatus !== 'paid') {
      return res.status(400).json({ error: 'Cannot update unpaid order' });
    }

    const check = canUpdateStatus(order, status, 'admin');
    if (!check.ok) return res.status(400).json({ error: check.error });

    if (status === 'Returned') {
      order.statusHistory.push({
        status: 'Returned',
        note: 'Item received back',
        date: new Date(),
      });

      order.status = 'Refund Scheduled';
      order.refundScheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      order.statusHistory.push({
        status: 'Refund Scheduled',
        note: 'Auto refund scheduled in 24h',
        date: new Date(),
      });
    } else {
      order.status = status;

      order.statusHistory.push({
        status,
        date: new Date(),
      });
    }

    await order.save();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Status update failed' });
  }
});

export default router;
