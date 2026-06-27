// ======================================================
// VENDOR ROUTES (UNIFIED + ITEM-LEVEL RETURNS)
// ======================================================

import mongoose from 'mongoose';
import express from 'express';

import { requireApprovedVendor, requireTier } from '../middleware/vendorMiddleware.js';

import {
  canUpdateItemStatus,
  getDerivedOrderStatus,
  getDerivedVendorStatus,
  getAllowedVendorActions,
  buildVendorAllowedActions,
} from '../utils/orderLogic.js';

import {
  findOrderItem,
  validateReturnApproval,
  applyReturnApproval,
  validateReturnRejection,
  applyReturnRejection,
  validateMarkItemReturned,
  applyMarkItemReturned,
  calculateItemRefundAmount,
} from '../utils/returnLogic.js';

import { pushUniqueHistory, pushItemHistory } from '../utils/historyLogic.js';
import { scheduleRefund, triggerItemRefund } from '../utils/refundLogic.js';

import User from '../models/user.js';
import Product from '../models/product.js';
import Order from '../models/order.js';
import Vendor from '../models/vendor.js';
import Payout from '../models/payout.js';

import authMiddleware from '../middleware/authMiddleware.js';
import { mailOrderShipped } from '../utils/email.js';
import { computeVendorBalance, MIN_PAYOUT, resolveReserveRate } from '../utils/vendorBalance.js';
import { resolveCommissionRateForOrder, resolveReserveRateAtTime, getFeeConfig } from '../utils/feeConfig.js';

const router = express.Router();

/* ======================================================
   CREATE / REGISTER VENDOR
====================================================== */

router.post('/create', authMiddleware, async (req, res) => {
  try {
    const { storeName, storeSlug } = req.body;

    if (!storeName || !storeSlug) {
      return res.status(400).json({
        error: 'Missing fields',
      });
    }

    // prevent duplicate vendor per user
    const existing = await Vendor.findOne({
      userId: req.user._id,
    });

    if (existing) {
      return res.status(400).json({
        error: 'Vendor already exists',
      });
    }

    // unique slug
    let slug = storeSlug.toLowerCase();
    let counter = 1;

    while (await Vendor.findOne({ storeSlug: slug })) {
      slug = `${storeSlug}-${counter++}`;
    }

    const type = req.body.type || 'casual';
    const VALID_TYPES = ['casual', 'refurbished', 'professional', 'enterprise'];
    const vendorType = VALID_TYPES.includes(type) ? type : 'casual';

    // Casual vendors are auto-approved — no admin review needed
    const autoApprove = vendorType === 'casual';

    const vendor = await Vendor.create({
      userId: req.user._id,
      storeName,
      storeSlug: slug,
      storeDescription: req.body.storeDescription || '',
      type: vendorType,
      status: autoApprove ? 'approved' : 'pending',
      ...(autoApprove && { approvedAt: new Date() }),
    });

    res.json({
      success: true,
      vendor,
      autoApproved: autoApprove,
    });
  } catch (err) {
    console.error('Vendor create error:', err);

    res.status(500).json({
      error: 'Failed to create vendor',
    });
  }
});

/* ======================================================
   REQUIRE VENDOR
====================================================== */

async function requireVendor(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const vendor = await Vendor.findOne({ userId: req.user._id });
    if (!vendor || vendor.status !== 'approved') {
      return res.status(403).json({ error: 'Vendor access required' });
    }
    req.vendor = vendor;
    next();
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
}

/* ======================================================
   HELPER: GET VENDOR
====================================================== */

async function getVendor(req) {
  return await Vendor.findOne({
    userId: req.user._id,
  });
}

/* ======================================================
   PERIOD FILTER HELPER
====================================================== */

function getPeriodStart(period) {
  const now = new Date();
  switch (period) {
    case 'today':    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
    case 'week':     { const d = new Date(now); d.setDate(d.getDate() - 7); return d; }
    case 'month':    return new Date(now.getFullYear(), now.getMonth(), 1);
    case 'quarter':  return new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    case 'rolling12':{ const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return d; }
    case 'year':     return new Date(now.getFullYear(), 0, 1);
    default:         return null;
  }
}

/* ======================================================
   DASHBOARD
====================================================== */

router.get('/dashboard', authMiddleware, requireVendor, async (req, res) => {
  try {
    const vendor = req.vendor; // set by requireVendor — no second DB lookup needed
    const vendorId = vendor._id;

    const VALID_PERIODS = ['today', 'week', 'month', 'quarter', 'rolling12', 'year'];
    const period = req.query.period;
    if (period && !VALID_PERIODS.includes(period)) {
      return res.status(400).json({ error: 'Invalid period' });
    }
    const periodStart = getPeriodStart(period);

    const products = await Product.countDocuments({
      vendor: vendorId,
      archived: false,
    });

    const orderFilter = { 'vendorOrders.vendorId': vendorId };
    if (periodStart) orderFilter.createdAt = { $gte: periodStart };

    const ordersRaw = await Order.find(orderFilter);

    let totalOrders = 0;
    let completedOrders = 0;
    let refundedItems = 0;
    let activeOrders = 0;

    let grossRevenue = 0;
    let revenueLoss = 0;

    ordersRaw.forEach((order) => {
      const vendorOrder = order.vendorOrders.find((vo) => String(vo.vendorId) === String(vendorId));

      if (!vendorOrder) return;

      totalOrders++;

      const paymentStatus = (order.paymentStatus || '').toLowerCase();

      // Sum only items that were actually cancelled or returned for this vendor
      const vendorItems = (order.items || []).filter(
        item => String(item.vendorId) === String(vendorId)
      );

      // Gross revenue = original full item prices × quantities (before any deductions)
      const itemsTotal = vendorItems.reduce(
        (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0
      );

      // Classify active vs completed by item states directly:
      // - active: any item still in a progressing state (or no status set yet)
      // - completed: all items finalized AND at least one was delivered
      // - cancelled: all items cancelled — counts in neither bucket
      const ACTIVE_ITEM_STATES = new Set(['Pending', 'Processing', 'Shipped', 'Cancel Requested']);
      const hasActiveItems = vendorItems.some(
        item => !item.status || ACTIVE_ITEM_STATES.has(item.status)
      );
      const hasDeliveredItems = vendorItems.some(item => item.status === 'Delivered');

      if (hasActiveItems) {
        activeOrders++;
      } else if (hasDeliveredItems) {
        completedOrders++;
      }

      const isPaid =
        paymentStatus === 'paid' ||
        paymentStatus === 'refunded' ||
        paymentStatus === 'refund_scheduled' ||
        paymentStatus === 'partially_refunded';

      if (isPaid) {
        grossRevenue += itemsTotal;
      }
      let actualRefunded = 0;
      vendorItems.forEach(item => {
        const price = Number(item.price || 0);
        let qty = 0;
        let amount = 0;

        if (item.status === 'Cancelled') {
          qty    = Number(item.quantity || 0);
          amount = price * qty;
        } else {
          if (Number(item.refundedQuantity) > 0) {
            qty    = Number(item.refundedQuantity);
            amount = Number(item.refundedAmount) || price * qty;
          } else if (Number(item.returnQuantity) > 0) {
            qty    = Number(item.returnQuantity);
            amount = price * qty;
          }
          // returnApprovedQuantity excluded — return approved but not yet
          // received, so no money has moved yet.
        }

        actualRefunded += amount;
        refundedItems  += qty;
      });
      revenueLoss += actualRefunded;
    });

    const netRevenue = grossRevenue - revenueLoss;

    res.json({
      products,

      totalOrders,
      completedOrders,
      refundedItems,
      refundedOrders: refundedItems,
      activeOrders,

      grossRevenue,
      revenueLoss,
      netRevenue,
    });
  } catch (err) {
    console.error('Vendor dashboard error:', err);

    res.status(500).json({
      error: 'Server error',
    });
  }
});

/* ======================================================
   TRANSACTIONS LEDGER
====================================================== */

router.get('/transactions', authMiddleware, requireApprovedVendor, requireTier('refurbished'), async (req, res) => {
  try {
    const vendor = req.vendor; // set by requireVendor — no second DB lookup needed
    const vendorId = vendor._id;

    const VALID_PERIODS = ['today', 'week', 'month', 'quarter', 'rolling12', 'year'];
    const VALID_TYPES   = ['all', 'sales', 'refunds'];
    const { period, type = 'all' } = req.query;

    if (period && !VALID_PERIODS.includes(period)) {
      return res.status(400).json({ error: 'Invalid period' });
    }
    if (!VALID_TYPES.includes(type)) {
      return res.status(400).json({ error: 'Invalid type' });
    }

    const periodStart = getPeriodStart(period);

    const orderFilter = { 'vendorOrders.vendorId': vendorId };
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
    let totalShipping = 0;
    let totalStripeFees = 0;

    const feeCfg = await getFeeConfig();

    for (const order of ordersRaw) {
      const COMMISSION_RATE = await resolveCommissionRateForOrder(vendor, order.createdAt);
      const RESERVE_RATE    = resolveReserveRateAtTime(vendor, feeCfg, order.createdAt);
      const vendorOrder = order.vendorOrders.find(
        (vo) => String(vo.vendorId) === String(vendorId)
      );
      if (!vendorOrder) return;

      const vendorItems = (order.items || []).filter(
        (item) => String(item.vendorId) === String(vendorId)
      );

      const paymentStatus = (order.paymentStatus || '').toLowerCase();
      const isPaid = ['paid', 'refunded', 'refund_scheduled', 'partially_refunded'].includes(paymentStatus);
      const baseId = order.shortId || String(order._id).slice(0, 10).toUpperCase();
      const displayId = baseId.startsWith('S4L-') ? baseId : `S4L-${baseId}`;

      // Gross sale amount = original full item prices × quantities
      const itemsTotal = vendorItems.reduce(
        (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0
      );

      // ── Compute per-order refund total (used for net sale calculation) ──
      let orderRefundTotal = 0;
      const refundEntries = [];

      vendorItems.forEach((item) => {
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

          // Shipping is non-refundable — vendor keeps it on full returns
          const isFullReturn = refundQty >= Number(item.quantity || 0);
          const shippingKept = (moneyMoved && isFullReturn)
            ? Number(item.shippingCost || 0) : 0;

          refundEntries.push({
            date:        refundDate,
            orderId:     order._id,
            displayId,
            type:        refundType,
            description: refundType === 'cancelled'     ? 'Item cancelled'
                       : refundType === 'returned'      ? 'Item returned'
                       : 'Return pending (awaiting item)',
            itemName:    item.name || 'Unknown item',
            qty:         refundQty,
            amount:      -refundAmount,
            shippingKept,
            pending:     !moneyMoved,
          });
        }
      });

      // Shipping collected for this vendor's items
      const orderShipping = vendorItems.reduce((s, i) => s + Number(i.shippingCost || 0), 0);

      // Vendor's proportional share of the Stripe fee, adjusted for any returns
      const orderTotal = Number(order.total || 0);
      const vendorShareFraction = (orderTotal > 0 && itemsTotal > 0) ? itemsTotal / orderTotal : 1;
      const rawStripeFee = Number(order.stripeFeeAmount || 0);
      const estimatedFee = Number((orderTotal * STRIPE_PCT + STRIPE_FIXED).toFixed(2));
      const orderStripeFee = rawStripeFee > 0 ? rawStripeFee : estimatedFee;
      const returnRatio = itemsTotal > 0 ? Math.max(0, (itemsTotal - orderRefundTotal) / itemsTotal) : 1;
      const vendorStripeFee = Number((orderStripeFee * vendorShareFraction * returnRatio).toFixed(2));
      const stripeIsEstimated = rawStripeFee === 0;

      // Item label for sale rows
      const activeItems = vendorItems.filter(i => i.status !== 'Cancelled');
      const saleItemName = activeItems.length === 1
        ? (activeItems[0].name || null)
        : activeItems.length > 1
          ? `${activeItems[0].name || 'Item'} (+${activeItems.length - 1} more)`
          : null;
      const saleQty = activeItems.length === 1
        ? Number(activeItems[0].quantity || 1)
        : activeItems.length > 1
          ? activeItems.reduce((s, i) => s + Number(i.quantity || 1), 0)
          : null;

      // Shipping is always kept by vendor — count it for all paid orders regardless of tab or returns
      if (isPaid) totalShipping += orderShipping;

      if (type === 'sales') {
        // Sales tab: one entry per order showing net cash retained
        const netAmount = itemsTotal - orderRefundTotal;
        if (isPaid && netAmount > 0) {
          const commission = Number((netAmount * COMMISSION_RATE).toFixed(2));
          const vatAmount  = isVatRegistered ? Number((netAmount * VAT_RATE).toFixed(2)) : 0;
          transactions.push({
            date:        order.createdAt,
            orderId:     order._id,
            displayId,
            type:        'sale',
            description: 'Order received',
            itemName:    saleItemName,
            qty:         saleQty,
            amount:      netAmount,
            commission,
            commissionRate: COMMISSION_RATE,
            reserveRate:    RESERVE_RATE,
            vatAmount,
            shippingAmount: Number(orderShipping.toFixed(2)),
            stripeFee:   vendorStripeFee,
            stripeIsEstimated,
          });
          totalSales      += netAmount;
          totalCommission += commission;
          totalVat        += vatAmount;
          totalStripeFees += vendorStripeFee;
        }
      } else if (type === 'refunds') {
        // Refunds tab: individual refund items only (no commission rows)
        refundEntries.forEach(e => {
          transactions.push(e);
          // Only count in totalRefunds when money has actually moved
          if (!e.pending) totalRefunds += Math.abs(e.amount);
        });
      } else {
        // All tab: only show "Order received" if not fully returned
        const netAmount = itemsTotal - orderRefundTotal;
        if (isPaid && netAmount > 0) {
          const commission = Number((netAmount * COMMISSION_RATE).toFixed(2));
          const vatAmount  = isVatRegistered ? Number((netAmount * VAT_RATE).toFixed(2)) : 0;
          transactions.push({
            date:        order.createdAt,
            orderId:     order._id,
            displayId,
            type:        'sale',
            description: 'Order received',
            itemName:    saleItemName,
            qty:         saleQty,
            amount:      netAmount,
            commission,
            commissionRate: COMMISSION_RATE,
            reserveRate:    RESERVE_RATE,
            vatAmount,
            shippingAmount: Number(orderShipping.toFixed(2)),
            stripeFee:   vendorStripeFee,
            stripeIsEstimated,
          });
          totalSales      += netAmount;
          totalCommission += commission;
          totalVat        += vatAmount;
          totalStripeFees += vendorStripeFee;
        }
        refundEntries.forEach(e => {
          transactions.push(e);
          if (!e.pending) totalRefunds += Math.abs(e.amount);
        });
      }

      // Chargeback entries (always shown except in Sales-only tab)
      if (type !== 'sales') {
        const orderTotal = Number(order.total || 0);
        const vendorShare = (orderTotal > 0 && itemsTotal > 0) ? itemsTotal / orderTotal : 0;

        (order.disputes || []).forEach(disp => {
          const ACTIVE_DISPUTE = ['needs_response', 'warning_needs_response', 'under_review', 'warning_under_review'];
          const isLost    = disp.status === 'lost';
          const isPending = ACTIVE_DISPUTE.includes(disp.status);
          if (!isLost && !isPending) return; // won disputes have no financial impact

          const disputeShare = Number((disp.amount * vendorShare).toFixed(2));
          if (disputeShare <= 0) return;

          const reasonLabel = (disp.reason || 'dispute').replace(/_/g, ' ');
          transactions.push({
            date:        disp.createdAt,
            orderId:     order._id,
            displayId,
            type:        'chargeback',
            description: isLost
              ? `Chargeback lost – ${reasonLabel}`
              : `Chargeback open – ${reasonLabel}`,
            itemName:    null,
            qty:         null,
            amount:      isLost ? -disputeShare : 0,
            pending:     isPending,
            chargebackStatus: disp.status,
            evidenceDueBy: disp.evidenceDueBy || null,
          });

          if (isLost) totalRefunds += disputeShare;
        });
      }
    }

    // Sort chronologically (newest first)
    transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    const currentCommissionRate = await resolveCommissionRateForOrder(vendor, new Date());
    const currentReserveRate    = resolveReserveRateAtTime(vendor, feeCfg, new Date());
    console.log('[rates] vendor=%s type=%s commission=%s reserve=%s cfg.reserveStandard=%s cfg.reserveSetAt=%s',
      vendor._id, vendor.type, currentCommissionRate, currentReserveRate,
      feeCfg?.reserveRateStandard, feeCfg?.reserveRateStandardSetAt);
    // totalSales is already net (returns deducted via netAmount) so don't subtract totalRefunds again
    const net = Number(totalSales.toFixed(2));
    res.json({
      transactions,
      summary: {
        totalSales:       Number(totalSales.toFixed(2)),
        totalRefunds:     Number(totalRefunds.toFixed(2)),
        totalCommission:  Number(totalCommission.toFixed(2)),
        totalVat:         Number(totalVat.toFixed(2)),
        totalStripeFees:  Number(totalStripeFees.toFixed(2)),
        totalShipping:    Number(totalShipping.toFixed(2)),
        net,
        netAfterFees:     Number((net - totalCommission).toFixed(2)),
        commissionRate:   currentCommissionRate,
        reserveRate:      currentReserveRate,
        vatRegistered:    isVatRegistered,
        vatNumber:        vendor.vatNumber || '',
      },
      period:     period || 'all',
      truncated,
      showing:    ordersRaw.length,
      totalOrders: totalMatchingOrders,
    });
  } catch (err) {
    console.error('Vendor transactions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   PAYOUTS
====================================================== */


router.get('/payouts', authMiddleware, requireApprovedVendor, async (req, res) => {
  try {
    const vendor = req.vendor;
    const vendorId = vendor._id;

    const VALID_PERIODS = ['today', 'week', 'month', 'quarter', 'rolling12', 'year'];
    const period = req.query.period;
    if (period && !VALID_PERIODS.includes(period)) {
      return res.status(400).json({ error: 'Invalid period' });
    }

    const [balance, payouts, pendingRequest] = await Promise.all([
      computeVendorBalance(vendorId),
      Payout.find({ vendorId }).sort({ createdAt: -1 }).limit(50),
      Payout.findOne({ vendorId, status: 'requested' }),
    ]);

    const commissionRate = await resolveCommissionRateForOrder(vendor, new Date());

    // Period-filtered summary stats
    let periodStats = null;
    if (period) {
      const periodStart = getPeriodStart(period);
      if (periodStart) {
        const RESERVE_RATE = balance.reserveRate || 0.10;
        const STRIPE_PCT   = 0.014;
        const STRIPE_FIXED = 0.20;

        const periodOrders = await Order.find({
          'vendorOrders.vendorId': vendorId,
          createdAt: { $gte: periodStart },
        });
        let gross = 0, commission = 0, stripeFees = 0, reserve = 0;
        for (const order of periodOrders) {
          const paymentStatus = (order.paymentStatus || '').toLowerCase();
          const isPaid = ['paid', 'refunded', 'refund_scheduled', 'partially_refunded'].includes(paymentStatus);
          if (!isPaid) continue;
          const COMMISSION_RATE = await resolveCommissionRateForOrder(vendor, order.createdAt);
          const vendorItems = (order.items || []).filter(i => String(i.vendorId) === String(vendorId));

          // Stripe fee: vendor's proportional share of the order's Stripe fee
          const allItemsGross = vendorItems.reduce((s, i) => s + Number(i.price || 0) * Number(i.quantity || 0), 0);
          if (allItemsGross > 0) {
            const orderTotal = Number(order.total || 0);
            const fraction   = orderTotal > 0 ? allItemsGross / orderTotal : 1;
            const rawFee     = Number(order.stripeFeeAmount || 0);
            const estFee     = orderTotal * STRIPE_PCT + STRIPE_FIXED;
            stripeFees += (rawFee > 0 ? rawFee : estFee) * fraction;
          }

          vendorItems.forEach(item => {
            if (item.status === 'Cancelled') return;
            const itemGross = Number(item.price || 0) * Number(item.quantity || 0);
            const refundAmt = Number(item.refundedQuantity) > 0
              ? (Number(item.refundedAmount) || Number(item.price || 0) * Number(item.refundedQuantity))
              : 0;
            const net = itemGross - refundAmt;
            gross     += net;
            commission += net * COMMISSION_RATE;
            reserve   += net * RESERVE_RATE;
          });
        }
        periodStats = {
          grossRevenue:   Number(gross.toFixed(2)),
          netAfterFees:   Number((gross - commission).toFixed(2)),
          commissionPaid: Number(commission.toFixed(2)),
          stripeFees:     Number(stripeFees.toFixed(2)),
          reserve:        Number(reserve.toFixed(2)),
        };
      }
    }

    res.json({
      ...balance,
      commissionRate,
      vendorType: vendor.type || 'casual',
      minimumPayout: MIN_PAYOUT,
      hasPendingRequest: !!pendingRequest,
      reportingStatus: vendor.reportingStatus || 'none',
      taxInfoCompletedAt: vendor.taxInfoCompletedAt || null,
      period: period || 'all',
      periodStats,
      payouts: payouts.map(p => ({
        _id: p._id,
        amount: p.amount,
        status: p.status,
        requestedAt: p.requestedAt,
        paidAt: p.paidAt,
        reference: p.reference,
        note: p.note,
      })),
    });
  } catch (err) {
    console.error('Vendor payouts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/payouts/request', authMiddleware, requireApprovedVendor, async (req, res) => {
  try {
    const vendor = req.vendor;
    const vendorId = vendor._id;

    // HMRC: block new payout requests if reporting is required but tax info not submitted
    if (vendor.reportingStatus === 'required' && !vendor.taxInfoCompletedAt) {
      return res.status(403).json({
        error: 'Payout requests are paused until you submit your tax information for HMRC reporting. Please complete the Tax Information section in Settings.',
        hmrcBlocked: true,
      });
    }

    const existing = await Payout.findOne({ vendorId, status: 'requested' });
    if (existing) {
      return res.status(400).json({ error: 'A payout request is already pending' });
    }

    const { pendingBalance } = await computeVendorBalance(vendorId);

    if (pendingBalance < MIN_PAYOUT) {
      return res.status(400).json({
        error: `Minimum payout is £${MIN_PAYOUT}. Your current balance is £${pendingBalance.toFixed(2)}.`,
      });
    }

    const payout = await Payout.create({ vendorId, amount: pendingBalance });
    res.json({ success: true, payout });
  } catch (err) {
    console.error('Payout request error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   PRODUCTS
====================================================== */

router.get('/products', authMiddleware, requireApprovedVendor, async (req, res) => {
  try {
    const vendor = req.vendor;
    const wantTrash = req.query.trashed === 'true';

    // Default: ALL non-trashed vendor products (active + draft + archived).
    // Frontend splits them into the correct tabs. ?trashed=true returns only Trash.
    const products = await Product.find({
      vendor: vendor._id,
      deletedAt: wantTrash ? { $ne: null } : null,
    }).sort({
      createdAt: -1,
    });

    res.json(products);
  } catch {
    res.status(500).json({
      error: 'Server error',
    });
  }
});

/* ======================================================
   GET SINGLE VENDOR PRODUCT (including drafts)
====================================================== */

router.get('/products/:id', authMiddleware, requireApprovedVendor, async (req, res) => {
  try {
    const vendor = req.vendor;

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    const product = await Product.findOne({
      _id: req.params.id,
      vendor: vendor._id,
    });

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ ...product.toObject(), vendorFreeReturns: !!vendor.freeReturns });
  } catch (err) {
    console.error('VENDOR GET PRODUCT ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   CSV PRODUCT IMPORT
====================================================== */

router.post('/products/import', authMiddleware, requireApprovedVendor, requireTier('professional'), express.text({ type: 'text/csv', limit: '2mb' }), async (req, res) => {
  try {
    const vendor = req.vendor;
    const raw = req.body;

    if (!raw || typeof raw !== 'string') {
      return res.status(400).json({ error: 'No CSV data received' });
    }

    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      return res.status(400).json({ error: 'CSV must have a header row and at least one product row' });
    }

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/\s+/g, ''));

    const REQUIRED = ['name', 'price'];
    for (const r of REQUIRED) {
      if (!headers.includes(r)) {
        return res.status(400).json({ error: `Missing required column: ${r}` });
      }
    }

    function parseRow(line) {
      const values = [];
      let cur = '';
      let inQuote = false;
      for (const ch of line) {
        if (ch === '"') { inQuote = !inQuote; continue; }
        if (ch === ',' && !inQuote) { values.push(cur.trim()); cur = ''; continue; }
        cur += ch;
      }
      values.push(cur.trim());
      return values;
    }

    function col(row, name) {
      const idx = headers.indexOf(name);
      return idx >= 0 ? (row[idx] || '').trim() : '';
    }

    const created = [];
    const skipped = [];

    // Parse all data rows, group by product name
    const groups = new Map();
    for (let i = 1; i < lines.length; i++) {
      const row = parseRow(lines[i]);
      const name = col(row, 'name');
      if (!name) { skipped.push({ row: i + 1, reason: 'Missing name' }); continue; }
      const key = name.toLowerCase().trim();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ row, lineNum: i + 1 });
    }

    for (const entries of groups.values()) {
      const firstRow = entries[0].row;
      const name     = col(firstRow, 'name');

      const price = parseFloat(col(firstRow, 'price'));
      if (!Number.isFinite(price) || price < 0) {
        entries.forEach(e => skipped.push({ row: e.lineNum, reason: 'Invalid price' }));
        continue;
      }

      // Collect unique images across all rows
      const addedImgs = new Set();
      const images = [];
      for (const e of entries) {
        ['image1', 'image2'].forEach(k => {
          const v = col(e.row, k);
          if (v && !addedImgs.has(v)) { addedImgs.add(v); images.push(v); }
        });
      }

      const baseSlug = name.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-');
      let slug = baseSlug;
      let slugCounter = 1;
      while (await Product.findOne({ slug })) { slug = `${baseSlug}-${slugCounter++}`; }

      // Build variants when multiple rows share the same product name
      const hasAttrValue = (r) =>
        col(r, 'variant') || col(r, 'attr1value') || col(r, 'attr2value');
      const makeVariants = entries.length > 1 || entries.some(e => hasAttrValue(e.row));
      const variants = makeVariants ? entries.map(e => {
        const r = e.row;
        const vPrice = parseFloat(col(r, 'price'));

        const attributes = {};
        const legacyVariant = col(r, 'variant');
        if (legacyVariant) attributes.Variant = legacyVariant;
        const attr1Name  = col(r, 'attr1name');
        const attr1Value = col(r, 'attr1value');
        if (attr1Name && attr1Value) attributes[attr1Name] = attr1Value;
        const attr2Name  = col(r, 'attr2name');
        const attr2Value = col(r, 'attr2value');
        if (attr2Name && attr2Value) attributes[attr2Name] = attr2Value;

        return {
          attributes,
          price:  Number.isFinite(vPrice) ? vPrice : price,
          stock:  parseInt(col(r, 'stock'), 10) || 0,
          sku:    col(r, 'sku'),
          image:  col(r, 'image1') || '',
          color:  '',
        };
      }) : [];

      const totalStock = variants.length
        ? variants.reduce((s, v) => s + v.stock, 0)
        : (parseInt(col(firstRow, 'stock'), 10) || 0);

      try {
        const product = new Product({
          vendor:       vendor._id,
          name,
          slug,
          description:  col(firstRow, 'description'),
          price,
          comparePrice: parseFloat(col(firstRow, 'compareprice')) || undefined,
          shippingCost: parseFloat(col(firstRow, 'shippingcost')) || 0,
          stock:        totalStock,
          trackInventory: totalStock > 0,
          category:     col(firstRow, 'category').toLowerCase(),
          subcategory:  col(firstRow, 'subcategory').toLowerCase(),
          sku:          col(firstRow, 'sku'),
          images,
          variants,
          active: false,
        });

        await product.save();
        created.push(product._id);
      } catch (rowErr) {
        entries.forEach(e => skipped.push({ row: e.lineNum, reason: rowErr.message || 'Save failed' }));
      }
    }

    res.json({
      created: created.length,
      skipped: skipped.length,
      skippedDetails: skipped,
    });
  } catch (err) {
    console.error('CSV IMPORT ERROR:', err);
    res.status(500).json({ error: 'Import failed' });
  }
});

/* ======================================================
   PENDING ORDER COUNT (for sidebar badge)
====================================================== */

router.get('/orders/pending-count', authMiddleware, requireVendor, async (req, res) => {
  try {
    const vendor = await getVendor(req);
    if (!vendor) return res.status(403).json({ error: 'Vendor not found' });

    const count = await Order.countDocuments({
      paymentStatus: 'paid',
      items: {
        $elemMatch: {
          vendorId: vendor._id,
          status: 'Pending',
        },
      },
    });

    res.json({ count });
  } catch (err) {
    console.error('Pending count error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET ORDERS
====================================================== */

router.get('/orders', authMiddleware, requireVendor, async (req, res) => {
  try {
    const vendor = await getVendor(req);

    if (!vendor) {
      return res.status(403).json({
        error: 'Vendor profile not found',
      });
    }

    const { status, q } = req.query;

    const filter = {
      vendorOrders: {
        $elemMatch: {
          vendorId: vendor._id,
        },
      },
    };

    if (q) {
      let search = q.trim();

      if (search.toUpperCase().startsWith('S4L-')) {
        search = search.slice(4);
      }

      const users = await User.find({
        email: {
          $regex: search,
          $options: 'i',
        },
      }).select('_id');

      const userIds = users.map((u) => u._id);

      filter.$or = [
        {
          shortId: {
            $regex: search,
            $options: 'i',
          },
        },

        ...(userIds.length ? [{ user: { $in: userIds } }] : []),
      ];
    }

    const ordersRaw = await Order.find(filter).populate('user', 'email').sort({
      createdAt: -1,
    });

    const orders = ordersRaw.map((order) => {
      const vendorOrder = order.vendorOrders.find(
        (vo) => String(vo.vendorId) === String(vendor._id)
      );

      const derivedVendorStatus = getDerivedVendorStatus(vendorOrder, order.items || []);

      return {
        ...order.toObject(),

        status: derivedVendorStatus,

        refundScheduledAt: vendorOrder?.refundScheduledAt || null,

        allowedActions: buildVendorAllowedActions(order, vendor._id),
      };
    });

    let filteredOrders = orders;

    if (status && status !== 'all') {
      if (status === 'active') {
        filteredOrders = orders.filter((o) =>
          ['Pending', 'Processing', 'Shipped', 'Partially Delivered'].includes(o.status)
        );
      } else if (status === 'issues') {
        filteredOrders = orders.filter((o) =>
          ['Cancel Requested', 'Return Requested', 'Return Approved'].includes(o.status)
        );
      } else if (status === 'completed') {
        filteredOrders = orders.filter((o) =>
          ['Delivered', 'Returned', 'Cancelled', 'Refund Scheduled', 'Refunded'].includes(o.status)
        );
      } else {
        filteredOrders = orders.filter((o) => o.status === status);
      }
    }

    res.json({ orders: filteredOrders });
  } catch (err) {
    console.error('Vendor orders fetch error:', err);

    res.status(500).json({
      error: 'Server error',
    });
  }
});

/* ======================================================
   GET SINGLE ORDER
====================================================== */

router.get('/orders/:id', authMiddleware, requireVendor, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({
      error: 'Invalid order id',
    });
  }

  try {
    const vendor = await getVendor(req);

    if (!vendor) {
      return res.status(403).json({
        error: 'Vendor profile not found',
      });
    }

    const order = await Order.findById(req.params.id).populate('user', 'email');

    if (!order) {
      return res.status(404).json({
        error: 'Order not found',
      });
    }

    const vendorOrder = order.vendorOrders.find((vo) => String(vo.vendorId) === String(vendor._id));

    if (!vendorOrder) {
      return res.status(403).json({
        error: 'Not your order',
      });
    }

    res.json({
      ...order.toObject(),

      status: getDerivedVendorStatus(vendorOrder, order.items),

      refundScheduledAt: vendorOrder.refundScheduledAt || null,

      allowedActions: buildVendorAllowedActions(order, vendor._id),
    });
  } catch (err) {
    console.error('Vendor order fetch error:', err);

    res.status(500).json({
      error: 'Server error',
    });
  }
});

/* ======================================================
   GET VENDOR STATUS
====================================================== */

// Enterprise vendors retrieve their API key
router.get('/api-key', authMiddleware, requireApprovedVendor, requireTier('enterprise'), async (req, res) => {
  res.json({ apiKey: req.vendor.apiKey || null });
});

// Generate or regenerate API key
router.post('/api-key/generate', authMiddleware, requireApprovedVendor, requireTier('enterprise'), async (req, res) => {
  try {
    const { randomBytes } = await import('crypto');
    const apiKey = 's4l_' + randomBytes(24).toString('hex');
    await req.vendor.updateOne({ apiKey });
    res.json({ apiKey });
  } catch (err) {
    console.error('API key generation error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ userId: req.user._id })
      .select('-taxInfo')
      .sort({ createdAt: -1 });

    res.json({
      isVendor: !!vendor,
      vendor: vendor || null,
    });
  } catch (err) {
    console.error('Vendor /me error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET TAX INFO (masked)
====================================================== */

router.get('/tax-info', authMiddleware, requireVendor, async (req, res) => {
  try {
    const vendor = await Vendor.findById(req.vendor._id);
    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    const taxInfoCompleted = !!vendor.taxInfoCompletedAt;
    let taxInfoSummary = null;

    if (taxInfoCompleted && vendor.taxInfo?.taxIdValue) {
      try {
        const { decrypt, maskTaxId } = await import('../utils/taxInfoCrypto.js');
        taxInfoSummary = {
          maskedTaxId:  maskTaxId(decrypt(vendor.taxInfo.taxIdValue)),
          taxIdType:    vendor.taxInfo.taxIdType || null,
          confirmedAt:  vendor.taxInfo.confirmedAt || null,
        };
      } catch (cryptoErr) {
        console.warn('[hmrc] tax-info decrypt failed:', cryptoErr.message);
      }
    }

    res.json({
      reportingStatus:  vendor.reportingStatus || 'none',
      hmrcReporting:    vendor.hmrcReporting || {},
      taxInfoCompleted,
      taxInfoCompletedAt: vendor.taxInfoCompletedAt || null,
      taxInfo: taxInfoSummary,
    });
  } catch (err) {
    console.error('Tax info GET error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   POST TAX INFO (encrypt and save)
====================================================== */

router.post('/tax-info', authMiddleware, requireVendor, async (req, res) => {
  try {
    const {
      legalName, dateOfBirth,
      addrLine1, addrLine2, addrCity, addrPostcode, addrCountry,
      taxIdType, taxIdValue,
    } = req.body;

    const REQUIRED = { legalName, addrLine1, addrCity, addrPostcode, addrCountry, taxIdType, taxIdValue };
    const missing = Object.entries(REQUIRED)
      .filter(([, v]) => !String(v || '').trim())
      .map(([k]) => k);
    if (missing.length) {
      return res.status(400).json({ error: `Missing required fields: ${missing.join(', ')}` });
    }

    const VALID_TYPES = ['ni', 'utr', 'other'];
    if (!VALID_TYPES.includes(String(taxIdType).trim().toLowerCase())) {
      return res.status(400).json({ error: 'taxIdType must be ni, utr, or other' });
    }

    const { encrypt } = await import('../utils/taxInfoCrypto.js');

    const now = new Date();
    await Vendor.findByIdAndUpdate(req.vendor._id, {
      taxInfo: {
        legalName:    encrypt(String(legalName).trim()),
        dateOfBirth:  dateOfBirth ? encrypt(String(dateOfBirth).trim()) : null,
        addrLine1:    encrypt(String(addrLine1).trim()),
        addrLine2:    addrLine2 ? encrypt(String(addrLine2).trim()) : null,
        addrCity:     encrypt(String(addrCity).trim()),
        addrPostcode: encrypt(String(addrPostcode).trim()),
        addrCountry:  encrypt(String(addrCountry).trim()),
        taxIdType:    String(taxIdType).trim().toLowerCase(),
        taxIdValue:   encrypt(String(taxIdValue).trim()),
        confirmedAt:  now,
      },
      taxInfoCompletedAt: now,
    });

    res.json({ success: true });
  } catch (err) {
    console.error('Tax info POST error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   UPDATE STORE SETTINGS
====================================================== */

router.patch('/settings', authMiddleware, requireVendor, async (req, res) => {
  try {
    const vendor = req.vendor;
    const { storeName, storeSlug, storeDescription, storeLogo, storeBanner, freeReturns } = req.body;

    const update = {};

    if (storeName !== undefined) {
      const name = String(storeName).trim();
      if (!name) return res.status(400).json({ error: 'Store name cannot be empty' });
      update.storeName = name;
    }

    if (storeSlug !== undefined) {
      const raw = String(storeSlug).trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      if (!raw) return res.status(400).json({ error: 'Invalid store slug' });
      const conflict = await Vendor.findOne({ storeSlug: raw, _id: { $ne: vendor._id } });
      if (conflict) return res.status(409).json({ error: 'That store URL is already taken' });
      update.storeSlug = raw;
    }

    if (storeDescription !== undefined) update.storeDescription = String(storeDescription).trim();
    if (storeLogo !== undefined)        update.storeLogo = String(storeLogo).trim();
    if (storeBanner !== undefined)      update.storeBanner = String(storeBanner).trim();
    // NOTE: vendor tier ("type") is intentionally NOT settable here. It must only
    // change via admin approval (PATCH /api/admin/vendors/:id/tier) or the
    // request-upgrade flow — never directly by the vendor, since it gates
    // tier-restricted features and determines the commission rate.
    if (freeReturns !== undefined) update.freeReturns = !!freeReturns;

    if (!Object.keys(update).length) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    const updated = await Vendor.findByIdAndUpdate(vendor._id, update, { new: true });
    res.json({ success: true, vendor: updated });
  } catch (err) {
    console.error('Vendor settings update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   UPDATE VAT STATUS
====================================================== */

router.patch('/vat', authMiddleware, requireVendor, async (req, res) => {
  try {
    const { vatRegistered, vatNumber } = req.body;

    if (typeof vatRegistered !== 'boolean') {
      return res.status(400).json({ error: 'vatRegistered must be a boolean' });
    }

    // Validate VAT number format if registering
    let cleanVatNumber = '';
    if (vatRegistered) {
      const raw = (vatNumber || '').trim().toUpperCase().replace(/\s/g, '');
      const numericPart = raw.startsWith('GB') ? raw.slice(2) : raw;
      if (numericPart && !/^\d{9}(\d{3})?$/.test(numericPart)) {
        return res.status(400).json({ error: 'Invalid UK VAT number. Format: GB123456789' });
      }
      cleanVatNumber = numericPart ? `GB${numericPart}` : '';
    }

    const vendor = await Vendor.findByIdAndUpdate(
      req.vendor._id,
      { vatRegistered, vatNumber: cleanVatNumber },
      { new: true }
    );

    res.json({ success: true, vatRegistered: vendor.vatRegistered, vatNumber: vendor.vatNumber });
  } catch (err) {
    console.error('VAT update error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   UPDATE FULFILLMENT STATUS
====================================================== */

router.patch('/orders/:id/status', authMiddleware, requireApprovedVendor, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({
      error: 'Invalid order id',
    });
  }

  try {
    const { status } = req.body;

    const order = await Order.findById(req.params.id);

    const vendor = req.vendor;

    if (!order) {
      return res.status(404).json({
        error: 'Order not found',
      });
    }

    if (!vendor) {
      return res.status(403).json({
        error: 'Vendor profile not found',
      });
    }

    const vendorOrder = order.vendorOrders.find((vo) => String(vo.vendorId) === String(vendor._id));

    if (!vendorOrder) {
      return res.status(403).json({
        error: 'Not your order',
      });
    }

    // block scheduled refund
    if (vendorOrder.refundScheduledAt && new Date(vendorOrder.refundScheduledAt) > new Date()) {
      return res.status(400).json({
        error: 'Refund already scheduled',
      });
    }

    const vendorItems = order.items.filter((item) => String(item.vendorId) === String(vendor._id));

    // Only validate items that would actually be updated — skip final-state items
    // (Cancelled, Delivered, Returned) since the update loop already skips them.
    const updatableItems = vendorItems.filter(
      (item) => !['Cancelled', 'Delivered', 'Returned'].includes(item.status)
    );

    if (!updatableItems.length) {
      return res.status(400).json({ error: 'No items available to update' });
    }

    const itemChecks = updatableItems.map((item) => canUpdateItemStatus(item, status, 'vendor'));

    const failedCheck = itemChecks.find((c) => !c.ok);

    if (failedCheck) {
      return res.status(400).json({
        error: failedCheck.error,
      });
    }

    const now = new Date();

    vendorItems.forEach((item) => {
      if (!item.status || ['Pending', 'Processing', 'Shipped'].includes(item.status)) {
        item.status = status;
      }

      if (status === 'Delivered') {
        item.deliveredAt = now;
      }

      if (status === 'Cancelled') {
        item.cancelledAt = now;

        item.refundStatus = 'scheduled';
      }
    });

    if (status === 'Cancelled') {
      scheduleRefund(order);
    }

    pushUniqueHistory(order, status, `${vendor.storeName} updated order`);

    await order.save();

    res.json({
      success: true,

      vendorStatus: vendorOrder.status,

      orderStatus: order.status,
    });
  } catch (err) {
    console.error('Vendor status update error:', err);

    res.status(500).json({
      error: err.message || 'Update failed',
    });
  }
});

/* ======================================================
   GOODWILL REFUND (VENDOR) — no physical return required.
   Scheduled 24h out so it can be reviewed/cancelled before it fires.
====================================================== */

router.post('/orders/:id/items/:itemId/goodwill-refund', authMiddleware, requireApprovedVendor, async (req, res) => {
  const { id, itemId } = req.params;
  const { amount, reason } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid order id' });
  }
  if (!mongoose.Types.ObjectId.isValid(itemId)) {
    return res.status(400).json({ error: 'Invalid item id' });
  }
  if (!String(reason || '').trim()) {
    return res.status(400).json({ error: 'Please explain why this goodwill refund is being issued' });
  }

  try {
    const vendor = req.vendor;
    const order = await Order.findById(id);

    if (!order) return res.status(404).json({ error: 'Order not found' });

    const item = findOrderItem(order, itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (String(item.vendorId) !== String(vendor._id)) {
      return res.status(403).json({ error: 'Not your item' });
    }

    if (!['paid', 'partially_refunded'].includes(order.paymentStatus)) {
      return res.status(400).json({ error: 'Only paid orders can be refunded' });
    }
    if (['requested', 'processing', 'processed', 'scheduled'].includes(item.refundStatus)) {
      return res.status(400).json({ error: 'A refund is already requested, scheduled, or processed for this item' });
    }

    const maxRefundable = calculateItemRefundAmount(item, item.quantity).total - Number(item.refundedAmount || 0);
    const refundAmount = Number(amount);

    if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
      return res.status(400).json({ error: 'Invalid refund amount' });
    }
    if (refundAmount > maxRefundable + 0.001) {
      return res.status(400).json({ error: `Refund amount cannot exceed £${maxRefundable.toFixed(2)}` });
    }

    const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    item.goodwillRefund = true;
    item.goodwillRefundAmount = refundAmount;
    item.goodwillPaidBy = 'vendor';
    item.refundReason = String(reason).trim();
    item.refundStatus = 'scheduled';
    item.refundRequestedAt = new Date();
    item.refundScheduledAt = scheduledAt;

    pushItemHistory(item, {
      type: 'goodwill_refund_scheduled',
      status: 'scheduled',
      amount: refundAmount,
      note: `Goodwill refund scheduled by ${vendor.storeName} (executes in 24h unless cancelled): ${item.refundReason}`,
      by: req.user._id,
    });

    pushUniqueHistory(order, 'Goodwill Refund Scheduled', `Goodwill refund of £${refundAmount.toFixed(2)} scheduled for ${item.name}`);

    order.markModified('items');
    await order.save();

    res.json({ success: true, scheduledAt, amount: refundAmount });
  } catch (err) {
    console.error('Goodwill refund schedule error:', err);
    res.status(500).json({ error: 'Failed to schedule goodwill refund' });
  }
});

router.patch('/orders/:id/items/:itemId/goodwill-refund/cancel', authMiddleware, requireApprovedVendor, async (req, res) => {
  const { id, itemId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid order id' });
  }
  if (!mongoose.Types.ObjectId.isValid(itemId)) {
    return res.status(400).json({ error: 'Invalid item id' });
  }

  try {
    const vendor = req.vendor;
    const order = await Order.findById(id);

    if (!order) return res.status(404).json({ error: 'Order not found' });

    const item = findOrderItem(order, itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });
    if (String(item.vendorId) !== String(vendor._id)) {
      return res.status(403).json({ error: 'Not your item' });
    }

    if (!item.goodwillRefund || item.refundStatus !== 'scheduled') {
      return res.status(400).json({ error: 'No scheduled goodwill refund to cancel' });
    }

    item.goodwillRefund = false;
    item.goodwillRefundAmount = 0;
    item.refundStatus = 'none';
    item.refundScheduledAt = null;

    pushItemHistory(item, {
      type: 'goodwill_refund_cancelled',
      status: 'none',
      amount: 0,
      note: 'Goodwill refund cancelled before it was processed',
      by: req.user._id,
    });

    pushUniqueHistory(order, 'Goodwill Refund Cancelled', `Goodwill refund cancelled for ${item.name}`);

    order.markModified('items');
    await order.save();

    res.json({ success: true });
  } catch (err) {
    console.error('Goodwill refund cancel error:', err);
    res.status(500).json({ error: 'Failed to cancel goodwill refund' });
  }
});

/* ======================================================
   PER-ITEM FULFILLMENT  (Processing → Shipped → Delivered)
====================================================== */

router.patch(
  '/orders/:orderId/items/:itemId/fulfillment',
  authMiddleware,
  requireApprovedVendor,
  async (req, res) => {
    const { orderId, itemId } = req.params;
    const { status } = req.body;

    const VALID = ['Processing', 'Shipped', 'Delivered'];
    if (!VALID.includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    try {
      const order = await Order.findById(orderId);
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const vendor = req.vendor;
const item = findOrderItem(order, itemId);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      if (String(item.vendorId) !== String(vendor._id)) {
        return res.status(403).json({ error: 'Not your item' });
      }

      const TRANSITIONS = { Pending: 'Processing', Processing: 'Shipped', Shipped: 'Delivered' };
      const current = item.status || 'Pending';
      if (TRANSITIONS[current] !== status) {
        return res.status(400).json({ error: `Cannot move from ${current} to ${status}` });
      }

      item.status = status;
      if (status === 'Delivered') item.deliveredAt = new Date();

      pushUniqueHistory(order, status, `${vendor.storeName} marked "${item.name}" as ${status}`);

      await order.save();
      res.json({ success: true });
    } catch (err) {
      console.error('Item fulfillment error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/* ======================================================
   VENDOR-INITIATED ITEM CANCEL
====================================================== */

router.patch(
  '/orders/:orderId/items/:itemId/vendor-cancel',
  authMiddleware,
  requireApprovedVendor,
  async (req, res) => {
    const { orderId, itemId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(orderId) || !mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    try {
      const order = await Order.findById(orderId);
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const vendor = req.vendor;
      const item = findOrderItem(order, itemId);
      if (!item) return res.status(404).json({ error: 'Item not found' });
      if (String(item.vendorId) !== String(vendor._id)) {
        return res.status(403).json({ error: 'Not your item' });
      }

      const current = item.status || 'Pending';
      if (!['Pending', 'Processing'].includes(current)) {
        return res.status(400).json({ error: `Cannot cancel item in ${current} state` });
      }

      item.status = 'Cancelled';
      item.cancelledAt = new Date();

      const isPaid = ['paid', 'partially_refunded'].includes(
        (order.paymentStatus || '').toLowerCase()
      );
      if (isPaid && order.paymentIntentId) {
        await triggerItemRefund(order, item, item.quantity, vendor._id);
      }

      pushUniqueHistory(
        order,
        'Cancelled',
        `${vendor.storeName} cancelled item: "${item.name}" (out of stock / issue)`
      );

      await order.save();
      res.json({ success: true });
    } catch (err) {
      console.error('Vendor item cancel error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  }
);

/* ======================================================
   APPROVE ITEM RETURN
====================================================== */

router.patch(
  '/orders/:orderId/items/:itemId/approve-return',
  authMiddleware,
  requireApprovedVendor,
  async (req, res) => {
    const { orderId, itemId } = req.params;
    const { quantity } = req.body;

    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      return res.status(400).json({
        error: 'Invalid order id',
      });
    }

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({
        error: 'Invalid item id',
      });
    }

    try {
      const order = await Order.findById(orderId);

      if (!order) {
        return res.status(404).json({
          error: 'Order not found',
        });
      }

      const vendor = req.vendor;

      const item = findOrderItem(order, itemId);

      if (!item) {
        return res.status(404).json({
          error: 'Item not found',
        });
      }

      if (String(item.vendorId) !== String(vendor._id)) {
        return res.status(403).json({
          error: 'Not your item',
        });
      }

      const check = validateReturnApproval(order, item, quantity);

      if (!check.ok) {
        return res.status(400).json({
          error: check.error,
        });
      }

      applyReturnApproval(order, item, quantity, req.user._id);

      const vendorOrder = order.vendorOrders.find(
        (vo) => String(vo.vendorId) === String(vendor._id)
      );

      await order.save();

      res.json({
        success: true,
        status: item.returnStatus,
      });
    } catch (err) {
      console.error('Approve return error:', err);

      res.status(500).json({
        error: 'Failed to approve return',
      });
    }
  }
);

/* ======================================================
   REJECT ITEM RETURN
====================================================== */

router.patch(
  '/orders/:orderId/items/:itemId/reject-return',
  authMiddleware,
  requireApprovedVendor,
  async (req, res) => {
    const { orderId, itemId } = req.params;
    const { reason } = req.body;

    try {
      const order = await Order.findById(orderId);

      if (!order) {
        return res.status(404).json({
          error: 'Order not found',
        });
      }

      const vendor = req.vendor;

      const item = findOrderItem(order, itemId);

      if (!item) {
        return res.status(404).json({
          error: 'Item not found',
        });
      }

      if (String(item.vendorId) !== String(vendor._id)) {
        return res.status(403).json({
          error: 'Not your item',
        });
      }

      const check = validateReturnRejection(order, item);

      if (!check.ok) {
        return res.status(400).json({
          error: check.error,
        });
      }

      applyReturnRejection(order, item, reason, req.user._id);

      const vendorOrder = order.vendorOrders.find(
        (vo) => String(vo.vendorId) === String(vendor._id)
      );

      await order.save();

      res.json({
        success: true,
        status: item.returnStatus,
      });
    } catch (err) {
      console.error('Reject return error:', err);

      res.status(500).json({
        error: 'Failed to reject return',
      });
    }
  }
);

/* ======================================================
   MARK ITEM RETURNED
====================================================== */

router.patch(
  '/orders/:orderId/items/:itemId/mark-returned',
  authMiddleware,
  requireApprovedVendor,
  async (req, res) => {
    const { orderId, itemId } = req.params;

    const { quantity, condition } = req.body;

    try {
      const order = await Order.findById(orderId);

      if (!order) {
        return res.status(404).json({
          error: 'Order not found',
        });
      }

      const vendor = req.vendor;

      const item = findOrderItem(order, itemId);

      if (!item) {
        return res.status(404).json({
          error: 'Item not found',
        });
      }

      if (String(item.vendorId) !== String(vendor._id)) {
        return res.status(403).json({
          error: 'Not your item',
        });
      }

      const check = validateMarkItemReturned(order, item, quantity);

      if (!check.ok) {
        return res.status(400).json({
          error: check.error,
        });
      }

      const returnedQty = Number(quantity || item.returnApprovedQuantity || 0);
      applyMarkItemReturned(order, item, quantity, condition, req.user._id);

      await triggerItemRefund(order, item, returnedQty, req.user._id);

      order.markModified('items');
      order.markModified('vendorOrders');

      await order.save();

      res.json({
        success: true,
        returnStatus: item.returnStatus,
        refundStatus: item.refundStatus,
        refundScheduledAt: item.refundScheduledAt,
      });
    } catch (err) {
      console.error('Mark returned error:', err);

      res.status(500).json({
        error: 'Failed to mark item returned',
      });
    }
  }
);

/* ======================================================
   APPROVE ITEM CANCEL (per-item — vendor approves customer cancel request)
====================================================== */

router.patch(
  '/orders/:orderId/items/:itemId/approve-cancel',
  authMiddleware,
  requireApprovedVendor,
  async (req, res) => {
    const { orderId, itemId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(orderId))
      return res.status(400).json({ error: 'Invalid order id' });
    if (!mongoose.Types.ObjectId.isValid(itemId))
      return res.status(400).json({ error: 'Invalid item id' });

    try {
      const order = await Order.findById(orderId);
      if (!order) return res.status(404).json({ error: 'Order not found' });

      const vendor = req.vendor;
      const item   = findOrderItem(order, itemId);

      if (!item) return res.status(404).json({ error: 'Item not found' });
      if (String(item.vendorId) !== String(vendor._id))
        return res.status(403).json({ error: 'Not your item' });
      if (item.status !== 'Cancel Requested')
        return res.status(400).json({ error: 'Item is not awaiting cancel approval' });

      item.status      = 'Cancelled';
      item.cancelledAt = new Date();

      const vendorOrder = order.vendorOrders.find(
        (vo) => String(vo.vendorId) === String(vendor._id)
      );
      if (vendorOrder) {
        vendorOrder.status = getDerivedVendorStatus(vendorOrder, order.items);
      }

      order.status = getDerivedOrderStatus(order);

      pushUniqueHistory(order, 'Cancelled', `${item.name} cancellation approved by vendor`);

      await triggerItemRefund(order, item, Number(item.quantity), req.user._id);

      order.markModified('items');
      order.markModified('vendorOrders');
      await order.save();

      res.json({ success: true, status: item.status, refundStatus: item.refundStatus });
    } catch (err) {
      console.error('Vendor approve cancel error:', err);
      res.status(500).json({ error: err.message || 'Approve cancel failed' });
    }
  }
);

/* ======================================================
   ADD / UPDATE TRACKING NUMBER
====================================================== */

router.patch('/orders/:id/tracking', authMiddleware, requireApprovedVendor, async (req, res) => {
  try {
    const vendor = req.vendor;
    const { trackingNumber, carrier } = req.body;

    if (!trackingNumber || !String(trackingNumber).trim()) {
      return res.status(400).json({ error: 'Tracking number is required' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const vendorOrder = order.vendorOrders.find(
      (vo) => String(vo.vendorId) === String(vendor._id)
    );
    if (!vendorOrder) return res.status(403).json({ error: 'Not allowed' });

    const trackNum   = String(trackingNumber).trim();
    const carrierStr = carrier ? String(carrier).trim() : '';
    vendorOrder.trackingNumber = trackNum;
    if (carrierStr) vendorOrder.carrier = carrierStr;
    await order.save();

    // Fire shipped email to buyer (non-blocking)
    (async () => {
      try {
        const buyer = await User.findById(order.user).lean();
        if (buyer?.email) {
          await mailOrderShipped({
            to: buyer.email,
            orderRef: order.shortId || String(order._id).slice(-8).toUpperCase(),
            trackingNumber: trackNum,
            carrier: carrierStr,
            storeName: vendor.storeName,
          });
        }
      } catch (e) {
        console.error('Shipped email error:', e.message);
      }
    })();

    res.json({ ok: true, trackingNumber: trackNum, carrier: carrierStr });
  } catch (err) {
    console.error('TRACKING ERROR:', err);
    res.status(500).json({ error: 'Failed to save tracking number' });
  }
});

/* ======================================================
   REQUEST TIER UPGRADE
====================================================== */

router.post('/request-upgrade', authMiddleware, requireApprovedVendor, async (req, res) => {
  try {
    const vendor = req.vendor;
    const { message } = req.body;

    if (!vendor || vendor.status !== 'approved') {
      return res.status(403).json({ error: 'Only approved vendors can request upgrades' });
    }

    const currentTier = vendor.type || 'casual';
    const tierRank = { casual: 1, refurbished: 2, professional: 3, enterprise: 4 };
    const currentRank = tierRank[currentTier] || 1;

    if (currentRank >= 4) {
      return res.status(400).json({ error: 'Already at highest tier' });
    }

    const nextTier = { casual: 'refurbished', refurbished: 'professional', professional: 'enterprise' }[currentTier];

    // Store upgrade request in database
    await Vendor.findByIdAndUpdate(vendor._id, {
      $set: {
        upgradeRequest: {
          requestedAt: new Date(),
          requestedTier: nextTier,
          message: message || '',
          status: 'pending',
        },
      },
    });
    console.log(`[request-upgrade] saved for vendor ${vendor._id} → ${nextTier}`);

    const adminEmail = process.env.ADMIN_EMAIL || 'admin@sell4life.com';
    const storeName = vendor.storeName || vendor.businessName || 'Unknown Store';
    const user = await User.findById(vendor.userId).lean();
    const vendorEmail = user?.email;

    // Send email to admin (non-blocking)
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

        await transporter.sendMail({
          to: adminEmail,
          subject: `[Upgrade Request] ${storeName} (${currentTier} → ${nextTier})`,
          html: `
            <p><strong>${storeName}</strong> has requested a tier upgrade:</p>
            <p><strong>Current Tier:</strong> ${currentTier}</p>
            <p><strong>Requested:</strong> ${nextTier}</p>
            <p><strong>Vendor Email:</strong> ${vendorEmail}</p>
            <p><strong>Message:</strong></p>
            <p>${(message || '').replace(/\n/g, '<br>')}</p>
            <p><a href="https://${process.env.FRONTEND_URL || 'sell4life.com'}/account/admin/vendors.html?id=${vendor._id}">View Vendor</a></p>
          `,
        });
      } catch (e) {
        console.error('Upgrade request email error:', e.message);
      }
    })();

    res.json({ ok: true, message: `Your upgrade request to ${nextTier} has been sent to admins. We'll review and contact you soon.` });
  } catch (err) {
    console.error('UPGRADE REQUEST ERROR:', err);
    res.status(500).json({ error: 'Failed to send upgrade request' });
  }
});

export default router;
