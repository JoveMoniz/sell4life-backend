import { canUpdateStatus, canRefund, getDerivedOrderStatus } from '../utils/orderLogic.js';
import { scheduleRefund } from '../utils/refundLogic.js';
import express from 'express';
import mongoose from 'mongoose';

import stripe from '../config/stripe.js';

import Order from '../models/order.js';
import User from '../models/user.js';

import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';

const router = express.Router();

/* ======================================================
   AUTOCOMPLETE (ADMIN)
====================================================== */
router.get('/autocomplete', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    let q = (req.query.q || '').trim();

    if (!q) return res.json([]);

    if (q.toUpperCase().startsWith('S4L-')) {
      q = q.slice(4);
    }

    const firstChar = q[0];

    if (/^[0-9]$/.test(firstChar)) {
      const orders = await Order.find({
        shortId: { $regex: q + '$', $options: 'i' },
      })
        .sort({ shortId: 1 })
        .limit(6)
        .select('shortId');

      return res.json(orders.map((o) => ({ shortId: o.shortId })));
    }

    if (/^[a-zA-Z]$/.test(firstChar)) {
      const users = await User.find({
        email: { $regex: '^' + q, $options: 'i' },
      })
        .limit(6)
        .select('email');

      return res.json(users.map((u) => ({ email: u.email })));
    }

    res.json([]);
  } catch (err) {
    console.error(err);
    res.status(500).json([]);
  }
});

/* ======================================================
   GET ORDERS (ADMIN)
====================================================== */
router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { q = '', status = 'all', page = 1 } = req.query;

    const limit = 20;
    const skip = (page - 1) * limit;

    let filter = {};

    /* ===============================
       SEARCH (ID OR EMAIL)
    =============================== */
    if (q) {
      let search = q.trim();

      if (search.toUpperCase().startsWith('S4L-')) {
        search = search.slice(4);
      }

      const users = await User.find({
        email: { $regex: search, $options: 'i' },
      }).select('_id');

      const userIds = users.map((u) => u._id);

      filter.$or = [
        { shortId: { $regex: search, $options: 'i' } },
        ...(userIds.length ? [{ user: { $in: userIds } }] : []),
      ];
    }

    /* ===============================
       FETCH RAW ORDERS
    =============================== */
    const ordersRaw = await Order.find(filter).populate('user', 'email').sort({ createdAt: -1 });

    /* ===============================
       APPLY DERIVED STATUS
    =============================== */
    let orders = ordersRaw.map((o) => {
      const obj = o.toObject();

      const baseId = obj.shortId || obj._id.toString().slice(0, 10).toUpperCase();

      const displayId = baseId.startsWith('S4L-') ? baseId : `S4L-${baseId}`;

      return {
        ...obj,
        status: getDerivedOrderStatus(o),
        displayId,
      };
    });

    /* ===============================
       STATUS FILTER (CORRECT WAY)
    =============================== */
    if (status && status !== 'all') {
      orders = orders.filter((o) => o.status === status);
    }

    /* ===============================
       PAGINATION AFTER FILTER
    =============================== */
    const total = orders.length;
    const paginated = orders.slice(skip, skip + limit);

    res.json({
      orders: paginated,
      page: Number(page),
      totalPages: Math.ceil(total / limit),
      totalOrders: total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET SINGLE ORDER
====================================================== */
router.get('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const order = await Order.findById(req.params.id).populate('user', 'email');

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({
      ...order.toObject(),
      status: getDerivedOrderStatus(order),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   UPDATE ORDER STATUS (CLEAN & CORRECT)
====================================================== */
router.patch('/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }
    const { status } = req.body;
    const order = await Order.findById(req.params.id);

    if (!order) return res.status(404).json({ error: 'Order not found' });

    const currentStatus = getDerivedOrderStatus(order);

    const check = canUpdateStatus({ ...order.toObject(), status: currentStatus }, status, 'admin');

    if (!check.ok) return res.status(400).json({ error: check.error });

    const alreadyHas = (s) => order.statusHistory.some((h) => h.status === s);

    // ---------------------------
    // UPDATE VENDOR ORDERS (SMART)
    // ---------------------------
    order.vendorOrders.forEach((vo) => {
      // 🔥 SPECIAL CASE: RETURN REJECTED
      if (status === 'Return Rejected') {
        vo.status = 'Delivered'; // revert back
        return;
      }

      // NORMAL FLOW
      vo.status = status;

      if (status === 'Delivered') vo.deliveredAt = new Date();
      if (status === 'Cancelled') vo.cancelledAt = new Date();
      if (status === 'Returned') vo.returnedAt = new Date();
    });

    // ---------------------------
    // HISTORY (ONLY BUSINESS EVENTS)
    // ---------------------------
    if (!alreadyHas(status)) {
      order.statusHistory.push({
        status,
        date: new Date(),
      });
    }

    // ---------------------------
    // PAYMENT SIDE (SEPARATE)
    // ---------------------------
    if (
      (status === 'Returned' || status === 'Cancelled') &&
      order.paymentStatus === 'paid' &&
      !order.refundScheduledAt
    ) {
      scheduleRefund(order); // 🔥 this now handles its own history
    }

    await order.save();

    res.json({
      success: true,
      status: getDerivedOrderStatus(order),
      paymentStatus: order.paymentStatus,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Status update failed' });
  }
});

/* ======================================================
   REFUND ORDER (MANUAL)
====================================================== */
router.post('/:id/refund', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }
    const order = await Order.findById(req.params.id);

    if (!order) return res.status(404).json({ error: 'Order not found' });

    const check = canRefund(order);
    if (!check.ok) return res.status(400).json({ error: check.error });

    await stripe.refunds.create({
      payment_intent: order.paymentIntentId,
      amount: Math.round(order.total * 100),
    });

    order.paymentStatus = 'refunded';
    order.refundScheduledAt = null;

    if (!order.statusHistory.some((h) => h.status === 'Refunded')) {
      order.statusHistory.push({
        status: 'Refunded',
        date: new Date(),
      });
    }

    await order.save();

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Refund failed' });
  }
});

export default router;
