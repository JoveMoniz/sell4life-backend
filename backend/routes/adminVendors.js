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
   NOTIFICATION COUNTS
====================================================== */

router.get('/counts', async (req, res) => {
  try {
    const [pendingVendors, pendingPayouts] = await Promise.all([
      Vendor.countDocuments({ status: 'pending' }),
      Payout.countDocuments({ status: 'requested' }),
    ]);
    res.json({ pendingVendors, pendingPayouts });
  } catch (err) {
    console.error('Admin counts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   VENDOR TRANSACTION LEDGER (admin view of any vendor)
====================================================== */

router.get('/:id/transactions', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    const vendor = await Vendor.findById(id).populate('userId', 'email');
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    const VALID_PERIODS = ['today', 'week', 'month', 'quarter', 'rolling12', 'year'];
    const VALID_TYPES   = ['all', 'sales', 'refunds'];
    const { period, type = 'all' } = req.query;

    if (period && !VALID_PERIODS.includes(period)) {
      return res.status(400).json({ error: 'Invalid period' });
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Invalid type' });
    }

    const now = new Date();
    let periodStart = null;
    if (period === 'today') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (period === 'week') {
      periodStart = new Date(now); periodStart.setDate(periodStart.getDate() - 7);
    } else if (period === 'month') {
      periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
    } else if (period === 'quarter') {
      const q = Math.floor(now.getMonth() / 3);
      periodStart = new Date(now.getFullYear(), q * 3, 1);
    } else if (period === 'rolling12') {
      periodStart = new Date(now); periodStart.setFullYear(periodStart.getFullYear() - 1);
    } else if (period === 'year') {
      periodStart = new Date(now.getFullYear(), 0, 1);
    }

    const orderFilter = { 'vendorOrders.vendorId': vendor._id };
    if (periodStart) orderFilter.createdAt = { $gte: periodStart };

    const LIMIT = 500;
    const COMMISSION_RATE = 0.08;
    const VAT_RATE = 20 / 120;
    const STRIPE_PCT = 0.014;
    const STRIPE_FIXED = 0.20;

    const totalMatchingOrders = await Order.countDocuments(orderFilter);
    const truncated = totalMatchingOrders > LIMIT;

    const ordersRaw = await Order.find(orderFilter)
      .populate('user', 'email')
      .sort({ createdAt: -1 })
      .limit(LIMIT);

    const isVatRegistered = vendor.vatRegistered === true;
    const transactions = [];
    let totalSales = 0;
    let totalRefunds = 0;
    let totalCommission = 0;
    let totalVat = 0;
    let totalStripeFees = 0;

    ordersRaw.forEach(order => {
      const vendorOrder = order.vendorOrders.find(
        vo => String(vo.vendorId) === String(vendor._id)
      );
      if (!vendorOrder) return;

      const vendorItems = (order.items || []).filter(
        item => String(item.vendorId) === String(vendor._id)
      );

      const paymentStatus = (order.paymentStatus || '').toLowerCase();
      const isPaid = ['paid', 'refunded', 'refund_scheduled', 'partially_refunded'].includes(paymentStatus);
      const baseId = order.shortId || String(order._id).slice(0, 10).toUpperCase();
      const displayId = baseId.startsWith('S4L-') ? baseId : `S4L-${baseId}`;

      const itemsTotal = vendorItems.reduce(
        (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0
      );

      let orderRefundTotal = 0;
      const refundEntries = [];

      vendorItems.forEach(item => {
        const price = Number(item.price || 0);
        let refundQty = 0;
        let refundAmount = 0;
        let refundType = '';
        let refundDate = order.createdAt;

        if (item.status === 'Cancelled') {
          refundQty    = Number(item.quantity || 0);
          refundAmount = price * refundQty;
          refundType   = 'cancelled';
          refundDate   = item.cancelledAt || order.updatedAt || order.createdAt;
        } else if (Number(item.refundedQuantity) > 0) {
          refundQty    = Number(item.refundedQuantity);
          refundAmount = Number(item.refundedAmount) || price * refundQty;
          refundType   = 'returned';
          refundDate   = item.refundedAt || item.returnedAt || order.updatedAt || order.createdAt;
        } else if (Number(item.returnQuantity) > 0) {
          refundQty    = Number(item.returnQuantity);
          refundAmount = price * refundQty;
          refundType   = 'returned';
          refundDate   = item.returnedAt || order.updatedAt || order.createdAt;
        } else if (Number(item.returnApprovedQuantity) > 0) {
          refundQty    = Number(item.returnApprovedQuantity);
          refundAmount = price * refundQty;
          refundType   = 'return_pending';
          refundDate   = item.returnApprovedAt || order.updatedAt || order.createdAt;
        }

        if (refundQty > 0) {
          const moneyMoved = refundType !== 'return_pending';
          if (moneyMoved) orderRefundTotal += refundAmount;
          refundEntries.push({
            date:        refundDate,
            orderId:     order._id,
            displayId,
            buyerEmail:  order.user?.email || '—',
            type:        refundType,
            description: refundType === 'cancelled'     ? 'Item cancelled'
                       : refundType === 'returned'      ? 'Item returned'
                       : 'Return pending (awaiting item)',
            itemName:    item.name || 'Unknown item',
            qty:         refundQty,
            amount:      -refundAmount,
            pending:     !moneyMoved,
          });
        }
      });

      const orderTotal = Number(order.total || 0);
      const vendorShareFraction = (orderTotal > 0 && itemsTotal > 0) ? itemsTotal / orderTotal : 1;
      const rawStripeFee = Number(order.stripeFeeAmount || 0);
      const estimatedFee = Number((orderTotal * STRIPE_PCT + STRIPE_FIXED).toFixed(2));
      const orderStripeFee = rawStripeFee > 0 ? rawStripeFee : estimatedFee;
      const vendorStripeFee = Number((orderStripeFee * vendorShareFraction).toFixed(2));
      const stripeIsEstimated = rawStripeFee === 0;

      if (type === 'sales') {
        const netAmount = itemsTotal - orderRefundTotal;
        if (isPaid && netAmount > 0) {
          const commission = Number((netAmount * COMMISSION_RATE).toFixed(2));
          const vatAmount  = isVatRegistered ? Number((netAmount * VAT_RATE).toFixed(2)) : 0;
          transactions.push({
            date: order.createdAt, orderId: order._id, displayId,
            buyerEmail: order.user?.email || '—',
            type: 'sale', description: 'Order received', itemName: null, qty: null,
            amount: netAmount, commission, vatAmount, stripeFee: vendorStripeFee, stripeIsEstimated,
          });
          totalSales      += netAmount;
          totalCommission += commission;
          totalVat        += vatAmount;
          totalStripeFees += vendorStripeFee;
        }
      } else if (type === 'refunds') {
        refundEntries.forEach(e => {
          transactions.push(e);
          if (!e.pending) totalRefunds += Math.abs(e.amount);
        });
      } else {
        if (isPaid && itemsTotal > 0) {
          const commission = Number((itemsTotal * COMMISSION_RATE).toFixed(2));
          const vatAmount  = isVatRegistered ? Number((itemsTotal * VAT_RATE).toFixed(2)) : 0;
          transactions.push({
            date: order.createdAt, orderId: order._id, displayId,
            buyerEmail: order.user?.email || '—',
            type: 'sale', description: 'Order received', itemName: null, qty: null,
            amount: itemsTotal, commission, vatAmount, stripeFee: vendorStripeFee, stripeIsEstimated,
          });
          totalSales      += itemsTotal;
          totalCommission += commission;
          totalVat        += vatAmount;
          totalStripeFees += vendorStripeFee;
        }
        refundEntries.forEach(e => {
          transactions.push(e);
          if (!e.pending) totalRefunds += Math.abs(e.amount);
        });
      }

      if (type !== 'sales') {
        const vShare = (orderTotal > 0 && itemsTotal > 0) ? itemsTotal / orderTotal : 0;
        (order.disputes || []).forEach(disp => {
          const ACTIVE = ['needs_response', 'warning_needs_response', 'under_review', 'warning_under_review'];
          const isLost    = disp.status === 'lost';
          const isPending = ACTIVE.includes(disp.status);
          if (!isLost && !isPending) return;
          const disputeShare = Number((disp.amount * vShare).toFixed(2));
          if (disputeShare <= 0) return;
          const reasonLabel = (disp.reason || 'dispute').replace(/_/g, ' ');
          transactions.push({
            date: disp.createdAt, orderId: order._id, displayId,
            buyerEmail: order.user?.email || '—',
            type: 'chargeback',
            description: isLost ? `Chargeback lost – ${reasonLabel}` : `Chargeback open – ${reasonLabel}`,
            itemName: null, qty: null,
            amount: isLost ? -disputeShare : 0,
            pending: isPending, chargebackStatus: disp.status,
          });
          if (isLost) totalRefunds += disputeShare;
        });
      }
    });

    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    const net = Number((totalSales - totalRefunds).toFixed(2));
    res.json({
      vendor: {
        _id:          vendor._id,
        storeName:    vendor.storeName || '—',
        storeSlug:    vendor.storeSlug || '',
        email:        vendor.userId?.email || '—',
        status:       vendor.status,
        vatRegistered: isVatRegistered,
        vatNumber:    vendor.vatNumber || '',
      },
      transactions,
      summary: {
        totalSales:      Number(totalSales.toFixed(2)),
        totalRefunds:    Number(totalRefunds.toFixed(2)),
        totalCommission: Number(totalCommission.toFixed(2)),
        totalVat:        Number(totalVat.toFixed(2)),
        totalStripeFees: Number(totalStripeFees.toFixed(2)),
        net,
        netAfterFees:    Number((net - totalCommission).toFixed(2)),
        commissionRate:  COMMISSION_RATE,
        vatRegistered:   isVatRegistered,
      },
      period:      period || 'all',
      truncated,
      showing:     ordersRaw.length,
      totalOrders: totalMatchingOrders,
    });
  } catch (err) {
    console.error('Admin vendor transactions error:', err);
    res.status(500).json({ error: 'Server error' });
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
    if (period === 'today') {
      dateFilter = { createdAt: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } };
    } else if (period === 'week') {
      const s = new Date(now); s.setDate(s.getDate() - 7);
      dateFilter = { createdAt: { $gte: s } };
    } else if (period === 'month') {
      dateFilter = { createdAt: { $gte: new Date(now.getFullYear(), now.getMonth(), 1) } };
    } else if (period === 'quarter') {
      const q = Math.floor(now.getMonth() / 3);
      dateFilter = { createdAt: { $gte: new Date(now.getFullYear(), q * 3, 1) } };
    } else if (period === 'rolling12') {
      const s = new Date(now); s.setFullYear(s.getFullYear() - 1);
      dateFilter = { createdAt: { $gte: s } };
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
