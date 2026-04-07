import { canUpdateStatus, canRefund } from '../utils/orderLogic.js';
import express from 'express';
import mongoose from 'mongoose';

import stripe from '../config/stripe.js';

import Order from '../models/order.js';
import User from '../models/user.js';

import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';

const router = express.Router();

/* ======================================================
   ORDER STATUS CONSTANTS
====================================================== */

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

    const isDigit = /^[0-9]$/.test(firstChar);
    const isLetter = /^[a-zA-Z]$/.test(firstChar);

    /* ========================================
         SEARCH BY SHORT ID
      ======================================== */

    if (isDigit) {
      const orders = await Order.find({
        shortId: { $regex: q + '$', $options: 'i' },
      })
        .sort({ shortId: 1 })
        .limit(6)
        .select('shortId');

      return res.json(
        orders.map((o) => ({
          shortId: o.shortId,
        }))
      );
    }

    /* ========================================
         SEARCH BY EMAIL
      ======================================== */

    if (isLetter) {
      const users = await User.find({
        email: { $regex: '^' + q, $options: 'i' },
      })
        .limit(6)
        .select('email');

      return res.json(
        users.map((u) => ({
          email: u.email,
        }))
      );
    }

    return res.json([]);
  } catch (err) {
    console.error('ADMIN AUTOCOMPLETE ERROR:', err);

    res.status(500).json([]);
  }
});

/* ======================================================
   GET ORDERS (ADMIN)
====================================================== */

router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const page = Number(req.query.page) || 1;
    const limit = 20;

    const { q, status } = req.query;

    const filter = {};

    /* ========================================
       SEARCH FILTER
    ======================================== */

    if (q) {
      let search = q;

      if (search.toUpperCase().startsWith('S4L-')) {
        search = search.slice(4);
      }

      const users = await User.find({
        email: { $regex: '^' + search, $options: 'i' },
      }).select('_id');

      const userIds = users.map((u) => u._id);

      const orConditions = [];

      if (mongoose.Types.ObjectId.isValid(search)) {
        orConditions.push({ _id: search });
      }

      if (/^[0-9]/.test(search)) {
        orConditions.push({
          shortId: { $regex: search, $options: 'i' },
        });
      }

      if (userIds.length) {
        orConditions.push({
          user: { $in: userIds },
        });
      }

      if (orConditions.length) {
        filter.$or = orConditions;
      }
    }

    /* ========================================
       STATUS FILTER
    ======================================== */

    if (status && status !== 'all') {
      // Handle multiple statuses (comma separated)
      if (status.includes(',')) {
        const statuses = status.split(',').map((s) => s.trim());
        filter.status = { $in: statuses };
      } else {
        filter.status = status;
      }
    }

    /* ========================================
       FETCH ORDERS
    ======================================== */

    const skip = (page - 1) * limit;

    const orders = await Order.find(filter)
      .populate('user', 'email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Order.countDocuments(filter);

    res.json({
      orders,

      page,

      totalOrders: total,

      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('ADMIN GET ORDERS ERROR:', err);

    res.status(500).json({
      error: 'Server error',
    });
  }
});

/* ======================================================
   GET SINGLE ORDER (ADMIN)
====================================================== */

router.get('/:id', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        error: 'Invalid order id',
      });
    }

    const order = await Order.findById(req.params.id).populate('user', 'email');

    if (!order) {
      return res.status(404).json({
        error: 'Order not found',
      });
    }

    res.json(order);
  } catch (err) {
    console.error('ADMIN GET ORDER ERROR:', err);

    res.status(500).json({
      error: 'Server error',
    });
  }
});

/* ======================================================
   UPDATE ORDER STATUS (ADMIN)
====================================================== */

router.patch('/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid order id' });
  }
  try {
    const { status } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        error: 'Order not found',
      });
    }

    // ------------------------------------------------------
    // SHARED LOGIC CHECK
    // ------------------------------------------------------

    const check = canUpdateStatus(order, status, 'admin');

    if (!check.ok) {
      return res.status(400).json({ error: check.error });
    }

    // ------------------------------------------------------
    // UPDATE
    // ------------------------------------------------------

    order.status = status;

    // ------------------------------------------------------
    // SET DELIVERY DATE
    // ------------------------------------------------------

    if (status === 'Delivered') {
      order.deliveredAt = new Date();
    }

    order.statusHistory.push({
      status,
      note: 'Updated by admin',
      date: new Date(),
    });

    await order.save();

    res.json({
      success: true,
      orderId: order._id,
      status: order.status,
    });
  } catch (err) {
    console.error('ADMIN STATUS UPDATE ERROR:', err);

    res.status(500).json({
      error: 'Server error',
    });
  }
});

/* ======================================================
   REFUND ORDER (ADMIN)
====================================================== */

router.post('/:id/refund', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (order.status === 'Pending' && !force) {
      console.warn(`⚠ Refund on Pending order ${order._id}`);
    }
    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        error: 'Order not found',
      });
    }

    const force = req.body.force === true;
    if (force && order.status !== 'Returned') {
      console.warn(`⚠ FORCE REFUND by admin on order ${order._id} (status: ${order.status})`);
    }

    const check = canRefund(order, { force });

    if (!check.ok) {
      return res.status(400).json({ error: check.error });
    }

    if (!order.paymentIntentId) {
      return res.status(400).json({
        error: 'No Stripe payment reference found',
      });
    }

    /* ========================================
         STRIPE REFUND
      ======================================== */

    if (order.paymentStatus === 'refunded') {
      return res.status(400).json({ error: 'Already refunded' });
    }

    await stripe.refunds.create({
      payment_intent: order.paymentIntentId,
    });

    /* ========================================
         UPDATE ORDER
      ======================================== */

    order.paymentStatus = 'refunded';

    // 🔥 unify system state
    order.status = 'Cancelled';

    order.statusHistory.push({
      status: 'Cancelled',
      note: 'Refund issued by admin',
      date: new Date(),
    });

    await order.save();

    res.json({
      success: true,
      paymentStatus: 'refunded',
    });
  } catch (err) {
    console.error('ADMIN REFUND ERROR:', err);

    res.status(500).json({
      error: 'Refund failed',
    });
  }
});

export default router;
