import { calculateVendorMetrics } from '../utils/vendorMetrics.js';

import express from 'express';
import mongoose from 'mongoose';

import Vendor from '../models/vendor.js';
import User from '../models/user.js';
import Order from '../models/order.js';
import Payout from '../models/payout.js';

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
    const limit = 20;
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

/* ======================================================
   PLATFORM FINANCIALS
====================================================== */

router.get('/financials', async (req, res) => {
  try {
    const { period } = req.query;

    // Date filter for orders
    const now = new Date();
    let dateFilter = {};
    if (period === 'week') {
      const s = new Date(now); s.setDate(s.getDate() - 7);
      dateFilter = { createdAt: { $gte: s } };
    } else if (period === 'month') {
      dateFilter = { createdAt: { $gte: new Date(now.getFullYear(), now.getMonth(), 1) } };
    } else if (period === 'quarter') {
      const q = Math.floor(now.getMonth() / 3);
      dateFilter = { createdAt: { $gte: new Date(now.getFullYear(), q * 3, 1) } };
    } else if (period === 'year') {
      dateFilter = { createdAt: { $gte: new Date(now.getFullYear(), 0, 1) } };
    }

    const PAID = ['paid', 'refunded', 'partially_refunded', 'refund_scheduled'];

    const orders = await Order.find({
      paymentStatus: { $in: PAID },
      ...dateFilter,
    }).select('items vendorOrders paymentStatus stripeFeeAmount createdAt');

    // One-pass aggregation across all orders
    let totalGross = 0;
    let totalRefunds = 0;
    let totalCommission = 0;
    let totalStripe = 0;
    const vendorMap = {}; // vendorId → { gross, refunds, commission, orderIds }

    for (const order of orders) {
      // Stripe fee is once per order (platform cost)
      const orderGross = (order.items || []).reduce(
        (s, i) => s + Number(i.price || 0) * Number(i.quantity || 0), 0
      );
      const stripeFee = Number(order.stripeFeeAmount) ||
        Math.round((orderGross * 0.014 + 0.20) * 100) / 100;
      totalStripe += stripeFee;

      for (const item of order.items || []) {
        const gross = Number(item.price || 0) * Number(item.quantity || 0);
        const commission = Math.round(gross * 0.08 * 100) / 100;

        // Refund = actual money moved (mirrors vendorMetrics logic)
        let refunded = 0;
        if (item.status === 'Cancelled') {
          refunded = gross;
        } else if (Number(item.refundedQuantity) > 0) {
          refunded = Number(item.refundedAmount) ||
            Number(item.price || 0) * Number(item.refundedQuantity);
        } else if (Number(item.returnQuantity) > 0) {
          refunded = Number(item.price || 0) * Number(item.returnQuantity);
        }

        totalGross += gross;
        totalRefunds += refunded;
        totalCommission += commission;

        const vid = String(item.vendorId || '');
        if (vid && mongoose.Types.ObjectId.isValid(vid)) {
          if (!vendorMap[vid]) vendorMap[vid] = { gross: 0, refunds: 0, commission: 0, orderIds: new Set() };
          vendorMap[vid].gross += gross;
          vendorMap[vid].refunds += refunded;
          vendorMap[vid].commission += commission;
          vendorMap[vid].orderIds.add(String(order._id));
        }
      }
    }

    // Payout totals (always all-time so admin sees full picture)
    const allPayouts = await Payout.find({});
    const pendingPayouts = allPayouts.filter(p => p.status === 'requested')
      .reduce((s, p) => s + Number(p.amount), 0);
    const paidPayouts = allPayouts.filter(p => p.status === 'paid')
      .reduce((s, p) => s + Number(p.amount), 0);
    const pendingCount = allPayouts.filter(p => p.status === 'requested').length;

    // Enrich vendor rows with store info
    const vendorIds = Object.keys(vendorMap);
    const vendors = await Vendor.find({ _id: { $in: vendorIds } })
      .populate('userId', 'email')
      .select('storeName storeSlug status vatRegistered');

    const vendorRows = vendors.map(v => {
      const m = vendorMap[String(v._id)] || {};
      const gross = m.gross || 0;
      const refunds = m.refunds || 0;
      const commission = Math.round(m.commission * 100) / 100 || 0;
      return {
        _id: v._id,
        storeName: v.storeName || '—',
        storeSlug: v.storeSlug || '',
        email: v.userId?.email || '—',
        status: v.status,
        vatRegistered: v.vatRegistered || false,
        orderCount: m.orderIds ? m.orderIds.size : 0,
        gross: Math.round(gross * 100) / 100,
        refunds: Math.round(refunds * 100) / 100,
        commission,
        netToVendor: Math.round((gross - refunds - commission) * 100) / 100,
      };
    }).sort((a, b) => b.gross - a.gross);

    res.json({
      summary: {
        totalGross:        Math.round(totalGross * 100) / 100,
        totalRefunds:      Math.round(totalRefunds * 100) / 100,
        totalCommission:   Math.round(totalCommission * 100) / 100,
        totalStripe:       Math.round(totalStripe * 100) / 100,
        netProfit:         Math.round((totalCommission - totalStripe) * 100) / 100,
        pendingPayouts:    Math.round(pendingPayouts * 100) / 100,
        paidPayouts:       Math.round(paidPayouts * 100) / 100,
        pendingCount,
        orderCount:        orders.length,
        vendorCount:       vendorIds.length,
      },
      vendors: vendorRows,
    });
  } catch (err) {
    console.error('Financials error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   PAYOUT REQUESTS
====================================================== */

router.get('/payouts', async (req, res) => {
  try {
    const { status = 'requested' } = req.query;
    const VALID = ['requested', 'paid', 'rejected', 'all'];
    if (!VALID.includes(status)) return res.status(400).json({ error: 'Invalid status' });

    const filter = status === 'all' ? {} : { status };

    const payouts = await Payout.find(filter)
      .populate({
        path: 'vendorId',
        select: 'storeName storeSlug',
        populate: { path: 'userId', select: 'email' },
      })
      .sort({ requestedAt: -1 })
      .limit(100);

    res.json({ payouts });
  } catch (err) {
    console.error('Admin payouts list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/payouts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reference, note } = req.body;

    if (!['paid', 'rejected'].includes(status)) {
      return res.status(400).json({ error: 'Status must be paid or rejected' });
    }
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid payout ID' });
    }

    const update = { status, processedBy: req.user._id };
    if (note) update.note = note;
    if (status === 'paid') {
      update.paidAt = new Date();
      if (reference) update.reference = reference;
    }

    const payout = await Payout.findByIdAndUpdate(id, update, { new: true });
    if (!payout) return res.status(404).json({ error: 'Payout not found' });

    res.json({ success: true, payout });
  } catch (err) {
    console.error('Admin payout update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
