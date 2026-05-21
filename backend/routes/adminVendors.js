import { calculateVendorMetrics } from '../utils/vendorMetrics.js';

import express from 'express';
import mongoose from 'mongoose';

import Vendor from '../models/vendor.js';
import User from '../models/user.js';
import Order from '../models/order.js';

import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';

const router = express.Router();

/* ======================================================
   ALL ROUTES REQUIRE ADMIN
====================================================== */
router.use(authMiddleware);
router.use(adminMiddleware);

/* ======================================================
   GET ALL VENDORS
====================================================== */

router.get('/', async (req, res) => {
  try {
    const { q, status } = req.query;

    const page = Number(req.query.page) || 1;
    const limit = 5;
    const skip = (page - 1) * limit;

    /* ===============================
       FILTER BUILD
    =============================== */
    const filter = {};

    if (status && status !== 'all') {
      filter.status = status;
    }

    if (q) {
      const users = await User.find({
        email: { $regex: q, $options: 'i' },
      }).select('_id');

      filter.$or = [
        { storeName: { $regex: q, $options: 'i' } },
        { userId: { $in: users.map((u) => u._id) } },
      ];
    }

    /* ===============================
       FETCH VENDORS
    =============================== */
    const vendorsRaw = await Vendor.find(filter)
      .populate('userId', 'email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    /* ===============================
       ADD STATS (ORDERS / REVENUE)
    =============================== */
    const vendors = await Promise.all(
      vendorsRaw.map(async (v) => {
        const ordersRaw = await Order.find({
          'vendorOrders.vendorId': v._id,
        });

        const metrics = calculateVendorMetrics(ordersRaw, v._id);

        return {
          ...v.toObject(),
          ...metrics,
        };
      })
    );

    const total = await Vendor.countDocuments(filter);

    res.json({
      vendors,
      pagination: {
        page,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('❌ Admin vendors fetch error:', error);
    res.status(500).json({ message: 'Failed to fetch vendors' });
  }
});

/* ======================================================
   APPROVE (pending → approved)
====================================================== */
router.patch('/:id/approve', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid vendor ID' });
    }

    const vendor = await Vendor.findOneAndUpdate(
      { _id: id, status: 'pending' },
      {
        status: 'approved',
        approvedAt: new Date(),
      },
      { new: true }
    );

    if (!vendor) {
      return res.status(400).json({
        message: 'Vendor not found or not in pending state',
      });
    }

    res.json({ message: 'Vendor approved', vendor });
  } catch (error) {
    console.error('❌ Approve vendor error:', error);
    res.status(500).json({ message: 'Failed to approve vendor' });
  }
});

/* ======================================================
   SUSPEND (approved → suspended)
====================================================== */
router.patch('/:id/suspend', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid vendor ID' });
    }

    const vendor = await Vendor.findOneAndUpdate(
      { _id: id, status: 'approved' },
      {
        status: 'suspended',
        suspendedAt: new Date(),
      },
      { new: true }
    );

    if (!vendor) {
      return res.status(400).json({
        message: 'Vendor not found or not in approved state',
      });
    }

    res.json({ message: 'Vendor suspended', vendor });
  } catch (error) {
    console.error('❌ Suspend vendor error:', error);
    res.status(500).json({ message: 'Failed to suspend vendor' });
  }
});

/* ======================================================
   REACTIVATE (suspended → approved)
====================================================== */
router.patch('/:id/reactivate', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid vendor ID' });
    }

    const vendor = await Vendor.findOneAndUpdate(
      { _id: id, status: 'suspended' },
      {
        status: 'approved',
      },
      { new: true }
    );

    if (!vendor) {
      return res.status(400).json({
        message: 'Vendor not found or not in suspended state',
      });
    }

    res.json({ message: 'Vendor reactivated', vendor });
  } catch (error) {
    console.error('❌ Reactivate vendor error:', error);
    res.status(500).json({ message: 'Failed to reactivate vendor' });
  }
});

export default router;
