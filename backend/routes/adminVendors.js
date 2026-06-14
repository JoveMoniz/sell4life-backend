import { calculateVendorMetrics } from '../utils/vendorMetrics.js';
import { mailPayoutProcessed, mailVendorStatusChange } from '../utils/email.js';
import { computeVendorBalance } from '../utils/vendorBalance.js';
import { resolveCommissionRate, getFeeConfig, resolveCommissionRateForOrder } from '../utils/feeConfig.js';

import express from 'express';
import mongoose from 'mongoose';

import Vendor from '../models/vendor.js';
import User from '../models/user.js';
import Order from '../models/order.js';
import Payout from '../models/payout.js';

import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';
import stripe from '../config/stripe.js';

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
    const feeCfg = await getFeeConfig();

    const vendors = await Promise.all(
      vendorsRaw.map(async (v) => {
        const ordersRaw = await Order.find({
          'vendorOrders.vendorId': v._id,
        });

        const metrics = calculateVendorMetrics(ordersRaw, v._id);
        const vObj = v.toObject();

        let commissionRate;
        if (vObj.commissionOverride != null) {
          commissionRate = Number(vObj.commissionOverride);
        } else {
          const tierRate = feeCfg.commissionByTier?.[vObj.type];
          commissionRate = tierRate != null ? Number(tierRate) : Number(feeCfg.commissionDefault ?? 0.08);
        }

        return {
          ...vObj,
          ...metrics,
          commissionRate,
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
    ).populate('userId', 'email');

    if (!vendor) {
      return res.status(400).json({
        message: 'Vendor not found or not in pending state',
      });
    }

    if (vendor.userId?.email) {
      mailVendorStatusChange({ to: vendor.userId.email, storeName: vendor.storeName, status: 'approved' }).catch(() => {});
    }

    res.json({ message: 'Vendor approved', vendor });
  } catch (error) {
    console.error('❌ Approve vendor error:', error);
    res.status(500).json({ message: 'Failed to approve vendor' });
  }
});

/* ======================================================
   REJECT (pending → rejected)
====================================================== */
router.patch('/:id/reject', async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid vendor ID' });
    }

    const vendor = await Vendor.findOneAndUpdate(
      { _id: id, status: 'pending' },
      { status: 'rejected' },
      { new: true }
    ).populate('userId', 'email');

    if (!vendor) {
      return res.status(400).json({ message: 'Vendor not found or not in pending state' });
    }

    if (vendor.userId?.email) {
      mailVendorStatusChange({ to: vendor.userId.email, storeName: vendor.storeName, status: 'rejected' }).catch(() => {});
    }

    res.json({ message: 'Vendor rejected', vendor });
  } catch (error) {
    console.error('❌ Reject vendor error:', error);
    res.status(500).json({ message: 'Failed to reject vendor' });
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
    ).populate('userId', 'email');

    if (!vendor) {
      return res.status(400).json({
        message: 'Vendor not found or not in approved state',
      });
    }

    if (vendor.userId?.email) {
      mailVendorStatusChange({ to: vendor.userId.email, storeName: vendor.storeName, status: 'suspended' }).catch(() => {});
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
    ).populate('userId', 'email');

    if (!vendor) {
      return res.status(400).json({
        message: 'Vendor not found or not in suspended state',
      });
    }

    if (vendor.userId?.email) {
      mailVendorStatusChange({ to: vendor.userId.email, storeName: vendor.storeName, status: 'reactivated' }).catch(() => {});
    }

    res.json({ message: 'Vendor reactivated', vendor });
  } catch (error) {
    console.error('❌ Reactivate vendor error:', error);
    res.status(500).json({ message: 'Failed to reactivate vendor' });
  }
});

/* ======================================================
   SET VENDOR TIER
====================================================== */
router.patch('/:id/tier', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, refurbishedBadge } = req.body;

    const VALID_TIERS = ['casual', 'refurbished', 'professional', 'enterprise'];
    if (!VALID_TIERS.includes(type)) {
      return res.status(400).json({ message: `Invalid tier. Must be one of: ${VALID_TIERS.join(', ')}` });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ message: 'Invalid vendor ID' });
    }

    const update = { type };
    if (type === 'refurbished' && typeof refurbishedBadge === 'boolean') {
      update.refurbishedBadge = refurbishedBadge;
    }

    // Auto-generate API key when upgrading to enterprise (only if not already set)
    if (type === 'enterprise') {
      const existing = await Vendor.findById(id).select('apiKey');
      if (!existing?.apiKey) {
        const { randomBytes } = await import('crypto');
        update.apiKey = 's4l_' + randomBytes(24).toString('hex');
      }
    }

    const vendor = await Vendor.findByIdAndUpdate(id, update, { new: true }).populate('userId', 'email');
    if (!vendor) return res.status(404).json({ message: 'Vendor not found' });

    res.json({ message: `Vendor tier updated to ${type}`, vendor });
  } catch (error) {
    console.error('❌ Set vendor tier error:', error);
    res.status(500).json({ message: 'Failed to update vendor tier' });
  }
});

/* ======================================================
   VENDOR PRODUCTS (admin view)
====================================================== */

router.get('/:id/products', async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    const vendor = await Vendor.findById(id).populate('userId', 'email').select('storeName storeSlug status');
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    const Product = (await import('../models/product.js')).default;
    const products = await Product.find({ vendor: id })
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      vendor: {
        _id:       vendor._id,
        storeName: vendor.storeName,
        storeSlug: vendor.storeSlug,
        email:     vendor.userId?.email,
        status:    vendor.status,
      },
      products,
      total: products.length,
      active: products.filter(p => !p.archived).length,
      archived: products.filter(p => p.archived).length,
    });
  } catch (err) {
    console.error('Admin vendor products error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   NOTIFICATION COUNTS
====================================================== */

router.get('/counts', async (req, res) => {
  try {
    const [pendingVendors, pendingPayouts, pendingUpgrades] = await Promise.all([
      Vendor.countDocuments({ status: 'pending' }),
      Payout.countDocuments({ status: 'requested' }),
      Vendor.countDocuments({ 'upgradeRequest.status': 'pending' }),
    ]);
    res.json({ pendingVendors, pendingPayouts, pendingUpgrades });
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
    let totalShipping = 0;

    for (const order of ordersRaw) {
      const COMMISSION_RATE = await resolveCommissionRateForOrder(vendor, order.createdAt);
      const vendorOrder = order.vendorOrders.find(
        vo => String(vo.vendorId) === String(vendor._id)
      );
      if (!vendorOrder) continue;

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
      const orderShipping = vendorItems.reduce(
        (sum, item) => sum + Number(item.shippingCost || 0), 0
      );
      if (isPaid) totalShipping += orderShipping;

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
            amount: netAmount, commission, commissionRate: COMMISSION_RATE, vatAmount, stripeFee: vendorStripeFee, stripeIsEstimated,
            shippingAmount: Number(orderShipping.toFixed(2)),
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
            amount: itemsTotal, commission, commissionRate: COMMISSION_RATE, vatAmount, stripeFee: vendorStripeFee, stripeIsEstimated,
            shippingAmount: Number(orderShipping.toFixed(2)),
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
    }

    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    const currentCommissionRate = await resolveCommissionRateForOrder(vendor, new Date());
    const net = Number((totalSales - totalRefunds).toFixed(2));
    const balance = await computeVendorBalance(vendor._id);
    res.json({
      vendor: {
        _id:          vendor._id,
        storeName:    vendor.storeName || '—',
        storeSlug:    vendor.storeSlug || '',
        email:        vendor.userId?.email || '—',
        status:       vendor.status,
        type:         vendor.type || 'casual',
        vatRegistered: isVatRegistered,
        vatNumber:    vendor.vatNumber || '',
      },
      transactions,
      summary: {
        totalSales:      Number(totalSales.toFixed(2)),
        totalShipping:   Number(totalShipping.toFixed(2)),
        totalRefunds:    Number(totalRefunds.toFixed(2)),
        totalCommission: Number(totalCommission.toFixed(2)),
        totalVat:        Number(totalVat.toFixed(2)),
        totalStripeFees: Number(totalStripeFees.toFixed(2)),
        net,
        netAfterFees:    Number((net - totalCommission).toFixed(2)),
        commissionRate:    currentCommissionRate,
        commissionOverride: vendor.commissionOverride,
        vatRegistered:     isVatRegistered,
      },
      period:      period || 'all',
      truncated,
      showing:     ordersRaw.length,
      totalOrders: totalMatchingOrders,
      balance,
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

    const [orders, feeConfig, allVendorDocs] = await Promise.all([
      Order.find({ paymentStatus: { $in: PAID }, ...dateFilter })
        .select('items vendorOrders paymentStatus stripeFeeAmount createdAt'),
      getFeeConfig(),
      Vendor.find({}).select('type commissionOverride commissionOverrideSetAt').lean(),
    ]);

    // Build vendor lookup (date-aware commission resolution happens per item)
    const vendorDataMap = {};
    for (const v of allVendorDocs) {
      vendorDataMap[String(v._id)] = {
        type: v.type,
        override: v.commissionOverride,
        overrideSetAt: v.commissionOverrideSetAt,
      };
    }

    function getItemCommissionRate(vid, orderCreatedAt) {
      const v = vendorDataMap[vid];
      const type = v?.type;
      const { override, overrideSetAt } = v || {};

      if (override != null) {
        if (!overrideSetAt) return Number(override);
        if (new Date(orderCreatedAt) >= new Date(overrideSetAt)) return Number(override);
        // order predates this override — fall through
      }

      const tierRate  = feeConfig.commissionByTier?.[type];
      const tierSetAt = feeConfig.commissionByTierSetAt?.[type];
      if (tierRate != null) {
        if (!tierSetAt || !orderCreatedAt || new Date(orderCreatedAt) >= new Date(tierSetAt)) {
          return Number(tierRate);
        }
        // order predates this tier rate — fall through to default
      }

      const defaultSetAt = feeConfig.commissionDefaultSetAt;
      if (!defaultSetAt || !orderCreatedAt || new Date(orderCreatedAt) >= new Date(defaultSetAt)) {
        return Number(feeConfig.commissionDefault ?? 0.08);
      }
      return 0.08; // order predates any configured default — use hardcoded baseline
    }

    // One-pass aggregation across all orders
    let totalGross = 0;
    let totalRefunds = 0;
    let totalCommission = 0;
    let totalStripe = 0;
    let totalShipping = 0;
    const vendorMap = {}; // vendorId → { gross, refunds, commission, orderIds }

    for (const order of orders) {
      const orderShipping = (order.items || []).reduce(
        (s, i) => s + Number(i.shippingCost || 0), 0
      );
      totalShipping += orderShipping;

      // Stripe fee is once per order (platform cost) — charged on full amount incl. shipping
      const orderGross = (order.items || []).reduce(
        (s, i) => s + Number(i.price || 0) * Number(i.quantity || 0), 0
      );
      const stripeFee = Number(order.stripeFeeAmount) ||
        Math.round(((orderGross + orderShipping) * 0.014 + 0.20) * 100) / 100;
      totalStripe += stripeFee;

      // Use commission stored at purchase time — immune to rate changes
      // Each entry is consumed on first use so multi-item vendors aren't double-counted
      const storedCommission = {};
      for (const vo of order.vendorOrders || []) {
        if (vo.commissionAmount != null) {
          storedCommission[String(vo.vendorId)] = Number(vo.commissionAmount);
        }
      }

      for (const item of order.items || []) {
        const gross = Number(item.price || 0) * Number(item.quantity || 0);
        const vid = String(item.vendorId || '');

        // Prefer stored commission; fall back to rate calculation for legacy orders
        let commission;
        if (storedCommission[vid] != null) {
          commission = storedCommission[vid];
          delete storedCommission[vid]; // consume — only count once per vendor per order
        } else {
          const rate = getItemCommissionRate(vid, order.createdAt);
          commission = Math.round(gross * rate * 100) / 100;
        }

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
      .select('storeName storeSlug status vatRegistered type');

    const vendorRowsBase = vendors.map(v => {
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
        type: v.type || 'casual',
        vatRegistered: v.vatRegistered || false,
        orderCount: m.orderIds ? m.orderIds.size : 0,
        gross: Math.round(gross * 100) / 100,
        refunds: Math.round(refunds * 100) / 100,
        commission,
        netToVendor: Math.round((gross - refunds - commission) * 100) / 100,
      };
    }).sort((a, b) => b.gross - a.gross);

    // Compute per-vendor balance (reserve + available) in parallel
    const balances = await Promise.all(
      vendorRowsBase.map(v => computeVendorBalance(v._id).catch(() => null))
    );
    const vendorRows = vendorRowsBase.map((v, i) => ({
      ...v,
      reservedBalance: Math.round((balances[i]?.reservedBalance || 0) * 100) / 100,
      pendingBalance:  Math.round((balances[i]?.pendingBalance  || 0) * 100) / 100,
    }));
    const totalReserved = vendorRows.reduce((s, v) => s + v.reservedBalance, 0);

    res.json({
      summary: {
        totalGross:        Math.round(totalGross * 100) / 100,
        totalShipping:     Math.round(totalShipping * 100) / 100,
        totalRefunds:      Math.round(totalRefunds * 100) / 100,
        totalCommission:   Math.round(totalCommission * 100) / 100,
        totalStripe:       Math.round(totalStripe * 100) / 100,
        netProfit:         Math.round((totalCommission - totalStripe) * 100) / 100,
        pendingPayouts:    Math.round(pendingPayouts * 100) / 100,
        paidPayouts:       Math.round(paidPayouts * 100) / 100,
        pendingCount,
        orderCount:        orders.length,
        vendorCount:       vendorIds.length,
        totalReserved:     Math.round(totalReserved * 100) / 100,
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

    const payout = await Payout.findByIdAndUpdate(id, update, { new: true }).populate({
      path: 'vendorId',
      select: 'storeName userId',
      populate: { path: 'userId', select: 'email' },
    });
    if (!payout) return res.status(404).json({ error: 'Payout not found' });

    if (status === 'paid') {
      const vendorEmail = payout.vendorId?.userId?.email;
      const storeName   = payout.vendorId?.storeName || 'Your Store';
      if (vendorEmail) {
        mailPayoutProcessed({ to: vendorEmail, storeName, amount: payout.amount, reference: payout.reference }).catch(() => {});
      }
    }

    res.json({ success: true, payout });
  } catch (err) {
    console.error('Admin payout update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   LIST DISPUTES  (across all orders)
====================================================== */
router.get('/disputes', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const orders = await Order.find(
      { 'disputes.0': { $exists: true } },
      { shortId: 1, _id: 1, disputes: 1, vendorOrders: 1, user: 1 }
    )
      .populate('user', 'email')
      .lean();

    const disputes = [];
    for (const order of orders) {
      for (const d of order.disputes) {
        disputes.push({
          ...d,
          orderId: order._id,
          orderRef: order.shortId || String(order._id).slice(-8).toUpperCase(),
          buyerEmail: order.user?.email || '—',
        });
      }
    }

    // Sort newest first
    disputes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ disputes });
  } catch (err) {
    console.error('Admin disputes list error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   SUBMIT EVIDENCE to Stripe
====================================================== */
router.post('/disputes/:disputeId/respond', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { disputeId } = req.params;
    const {
      product_description,
      customer_communication,
      uncategorized_text,
      customer_name,
      submit,
    } = req.body;

    if (!disputeId || !disputeId.startsWith('dp_')) {
      return res.status(400).json({ error: 'Invalid dispute ID' });
    }

    const evidence = {};
    if (product_description)    evidence.product_description    = String(product_description).slice(0, 20000);
    if (customer_communication) evidence.customer_communication = String(customer_communication).slice(0, 20000);
    if (uncategorized_text)     evidence.uncategorized_text     = String(uncategorized_text).slice(0, 20000);
    if (customer_name)          evidence.customer_name          = String(customer_name).slice(0, 200);

    const updated = await stripe.disputes.update(disputeId, {
      evidence,
      submit: submit === true,
    });

    res.json({ success: true, dispute: { id: updated.id, status: updated.status } });
  } catch (err) {
    console.error('Dispute respond error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

/* ======================================================
   UPGRADE REQUESTS
====================================================== */

router.get('/upgrade-requests', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const vendors = await Vendor.find({ 'upgradeRequest.status': 'pending' })
      .populate('userId', 'email')
      .select('_id storeName type upgradeRequest');
    console.log(`[upgrade-requests] found ${vendors.length} pending`);

    const requests = vendors.map(v => ({
      _id: v._id,
      vendorId: v._id,
      storeName: v.storeName,
      email: v.userId?.email,
      currentTier: v.type,
      requestedTier: v.upgradeRequest?.requestedTier,
      message: v.upgradeRequest?.message,
      requestedAt: v.upgradeRequest?.requestedAt,
    }));

    res.json({ requests });
  } catch (err) {
    console.error('Admin upgrade requests error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id/upgrade', async (req, res) => {
  try {
    const { action } = req.body;
    const vendorId = req.params.id;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
      return res.status(400).json({ error: 'Invalid vendor ID' });
    }

    const vendor = await Vendor.findById(vendorId).populate('userId', 'email');
    if (!vendor) {
      return res.status(404).json({ error: 'Vendor not found' });
    }

    if (!vendor.upgradeRequest || vendor.upgradeRequest.status !== 'pending') {
      return res.status(400).json({ error: 'No pending upgrade request' });
    }

    const requestedTier = vendor.upgradeRequest.requestedTier;
    const currentTier = vendor.type;

    if (action === 'approve') {
      await Vendor.findByIdAndUpdate(vendorId, {
        type: requestedTier,
        'upgradeRequest.status': 'approved',
      });
    } else {
      await Vendor.findByIdAndUpdate(vendorId, {
        'upgradeRequest.status': 'rejected',
      });
    }

    // Send notification email (non-blocking)
    (async () => {
      try {
        const nodemailer = (await import('nodemailer')).default;
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_PASSWORD,
          },
        });

        const status = action === 'approve' ? 'Approved' : 'Rejected';
        await transporter.sendMail({
          to: vendor.userId.email,
          subject: `Tier Upgrade Request ${status}`,
          html: `
            <p>Your tier upgrade request has been <strong>${status.toLowerCase()}</strong>.</p>
            <p><strong>Current Tier:</strong> ${currentTier}</p>
            <p><strong>Requested Tier:</strong> ${requestedTier}</p>
            ${action === 'approve' ? '<p>Your account has been upgraded and all new features are now available.</p>' : ''}
            <p>You can manage your account at: <a href="https://${process.env.FRONTEND_URL || 'sell4life.com'}/account/vendor/settings.html">Store Settings</a></p>
          `,
        });
      } catch (e) {
        console.error('Upgrade notification email error:', e.message);
      }
    })();

    res.json({ success: true, message: `Upgrade request ${action}ed` });
  } catch (err) {
    console.error('Admin upgrade action error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
