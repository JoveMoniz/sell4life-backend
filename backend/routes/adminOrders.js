import { scheduleRefund, triggerItemRefund } from '../utils/refundLogic.js';
import {
  canUpdateItemStatus,
  getDerivedOrderStatus,
  getDerivedVendorStatus,
  getAllowedAdminActions,
  getAdminActionLabel,
  isFinalOrder,
} from '../utils/orderLogic.js';
import { canRefund } from '../utils/refundGuard.js';

import {
  findOrderItem,
  validateItemRefund,
  calculateItemRefundAmount,
  validateReturnApproval,
  applyReturnApproval,
  validateReturnRejection,
  applyReturnRejection,
  validateMarkItemReturned,
  applyMarkItemReturned,
} from '../utils/returnLogic.js';
import { pushItemHistory, pushUniqueHistory } from '../utils/historyLogic.js';

import express from 'express';
import mongoose from 'mongoose';

import stripe from '../config/stripe.js';

import Order from '../models/order.js';
import User from '../models/user.js';
import Vendor from '../models/vendor.js';

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

        allowedActions: getAllowedAdminActions(o),
        isFinal: isFinalOrder(o),
        canRefund: canRefund(o).ok,
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

    const orderObj = order.toObject();

    orderObj.statusHistory = (orderObj.statusHistory || []).sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    // Enrich vendorOrders with live account status + email
    const vendorIds = (orderObj.vendorOrders || []).map(vo => vo.vendorId).filter(Boolean);
    const vendors = vendorIds.length
      ? await Vendor.find({ _id: { $in: vendorIds } })
          .populate('userId', 'email')
          .select('_id storeName storeSlug status type verified userId')
      : [];

    const vendorMap = {};
    vendors.forEach(v => { vendorMap[String(v._id)] = v; });

    const vendorOrdersEnriched = (orderObj.vendorOrders || []).map(vo => {
      const v = vendorMap[String(vo.vendorId)];
      return {
        ...vo,
        status:        getDerivedVendorStatus(vo, orderObj.items || []),
        accountStatus: v?.status || null,
        accountType:   v?.type   || null,
        verified:      v?.verified || false,
        email:         v?.userId?.email || null,
      };
    });

    res.json({
      ...orderObj,
      vendorOrders: vendorOrdersEnriched,

      status: getDerivedOrderStatus(order),

      allowedActions: getAllowedAdminActions(order),

      isFinal: isFinalOrder(order),

      canRefund: canRefund(order).ok,

      canCancelRefund: order.paymentStatus === 'refund_scheduled',
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   UPDATE ORDER STATUS (ADMIN)
====================================================== */
router.patch('/:id/status', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const { status } = req.body;

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // =====================================================
    // FINANCIAL FINAL STATE PROTECTION
    // =====================================================

    if (order.paymentStatus === 'refunded') {
      return res.status(400).json({
        error: 'Cannot modify a fully refunded order',
      });
    }

    const now = new Date();

    // =====================================================
    // CANCELLED
    // =====================================================

    if (status === 'Cancelled') {
      order.vendorOrders.forEach((vo) => {
        vo.status = 'Cancelled';
        vo.cancelledAt = now;
      });

      order.items.forEach((item) => {
        if (['Pending', 'Processing', 'Cancel Requested'].includes(item.status)) {
          item.status = 'Cancelled';
          item.cancelledAt = now;
        }
      });
    }

    // =====================================================
    // RETURNED
    // =====================================================

    if (status === 'Returned') {
      order.vendorOrders.forEach((vo) => {
        vo.status = 'Returned';
        vo.returnedAt = now;
      });

      order.items.forEach((item) => {
        if (
          item.status === 'Delivered' ||
          item.returnStatus === 'approved' ||
          item.returnStatus === 'requested'
        ) {
          item.status = 'Returned';

          // FORCE FINAL RETURN STATE
          item.returnStatus = 'returned';

          item.returnQuantity = item.quantity;

          item.returnedAt = now;
        }
      });
    }

    // =====================================================
    // RETURN REJECTED
    // =====================================================

    if (status === 'Return Rejected') {
      order.vendorOrders.forEach((vo) => {
        if (vo.status === 'Return Requested') {
          vo.status = 'Delivered';
        }
      });

      order.items.forEach((item) => {
        if (item.returnStatus === 'requested') {
          item.returnStatus = 'rejected';
        }
      });
    }

    // =====================================================
    // ORDER HISTORY
    // =====================================================

    pushUniqueHistory(order, status);

    // =====================================================
    // AUTO REFUND SCHEDULING
    // =====================================================

    const alreadyScheduled =
      order.refundStatus === 'scheduled' ||
      order.paymentStatus === 'refund_scheduled' ||
      !!order.refundScheduledAt;

    const alreadyRefunded =
      order.paymentStatus === 'refunded' || order.refundStatus === 'processed';

    const shouldScheduleRefund = status === 'Cancelled' || status === 'Returned';

    if (
      shouldScheduleRefund &&
      order.paymentStatus === 'paid' &&
      !alreadyScheduled &&
      !alreadyRefunded
    ) {
      scheduleRefund(order);

      order.vendorOrders.forEach((vo) => {
        if (vo.status === 'Cancelled' || vo.status === 'Returned') {
          vo.refundStatus = 'scheduled';
          vo.refundScheduledAt = order.refundScheduledAt;
          vo.status = 'Refund Scheduled';
        }
      });

      order.items.forEach((item) => {
        if (item.status === 'Cancelled' || item.returnStatus === 'returned') {
          item.refundStatus = 'scheduled';
          item.refundScheduledAt = order.refundScheduledAt;
        }
      });

      pushUniqueHistory(order, 'Refund Scheduled', 'Automatic refund scheduled');
    }

    // AUTO REFUND SCHEDULING

    // DERIVED STATUS
    order.status = getDerivedOrderStatus(order);

    await order.save();

    res.json({
      success: true,
      status: order.status,
      paymentStatus: order.paymentStatus,
    });
  } catch (err) {
    console.error('ADMIN STATUS UPDATE ERROR:', err);

    res.status(500).json({
      error: 'Status update failed',
    });
  }
});
/* ======================================================
   CANCEL SCHEDULED REFUND (ADMIN)
====================================================== */
router.patch('/:id/cancel-refund', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    const hasScheduledRefund =
      order.paymentStatus === 'refund_scheduled' ||
      order.refundStatus === 'scheduled' ||
      !!order.refundScheduledAt ||
      order.vendorOrders?.some((vo) => !!vo.refundScheduledAt);

    if (!hasScheduledRefund) {
      return res.status(400).json({
        error: 'No scheduled refund to cancel',
      });
    }

    if (order.paymentStatus === 'refunded') {
      return res.status(400).json({
        error: 'Refund already processed',
      });
    }

    // clear order-level refund schedule
    order.refundScheduledAt = null;
    order.refundStatus = 'cancelled';

    // restore payment state
    if (order.paymentStatus === 'refund_scheduled') {
      order.paymentStatus = 'paid';
    }

    // clear vendor-level refund schedules
    if (Array.isArray(order.vendorOrders)) {
      order.vendorOrders.forEach((vo) => {
        vo.refundScheduledAt = null;

        if (vo.status === 'Refund Scheduled') {
          vo.status = 'Returned';
        }
      });
    }

    order.items.forEach((item) => {
      item.refundScheduledAt = null;

      if (item.refundStatus === 'scheduled') {
        item.refundStatus = 'none';
      }
    });

    pushUniqueHistory(order, 'Refund Schedule Cancelled', 'Scheduled refund cancelled by admin');

    // keep parent fulfillment status derived from vendor orders
    order.status = getDerivedOrderStatus(order);

    await order.save();

    res.json({
      success: true,
      message: 'Scheduled refund cancelled',
      status: order.status,
      paymentStatus: order.paymentStatus,
      refundStatus: order.refundStatus,
    });
  } catch (err) {
    console.error('Cancel scheduled refund error:', err);
    res.status(500).json({ error: 'Failed to cancel scheduled refund' });
  }
});

/* ======================================================
   REFUND ORDER (MANUAL)
====================================================== */
router.post('/:id/items/:itemId/refund', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { quantity } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    if (!mongoose.Types.ObjectId.isValid(itemId)) {
      return res.status(400).json({ error: 'Invalid item id' });
    }

    const order = await Order.findById(id);

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // canRefund() is for whole-order refunds and blocks once any item is refunded.
    // Per-item validation is handled by validateItemRefund() below.
    const item = findOrderItem(order, itemId);

    if (!item) {
      return res.status(404).json({ error: 'Item not found' });
    }

    const check = validateItemRefund(order, item, quantity);

    if (!check.ok) {
      return res.status(400).json({ error: check.error });
    }

    const refundQty = Number(quantity);

    const alreadyRefundedQty = Number(item.refundedQuantity || 0);

    if (alreadyRefundedQty >= item.quantity) {
      return res.status(400).json({
        error: 'Item already fully refunded',
      });
    }

    if (refundQty + alreadyRefundedQty > item.quantity) {
      return res.status(400).json({
        error: 'Refund quantity exceeds remaining refundable quantity',
      });
    }

    const refund = calculateItemRefundAmount(item, refundQty);

    let stripeRefundId = null;

    if (order.stripeRefundId) {
      // The automated worker already issued a full Stripe refund for this order.
      // Money is already back with the customer — just record the item in the DB.
      console.log('⚠ Order already refunded by worker, recording item refund without new Stripe call');
      stripeRefundId = order.stripeRefundId;
    } else {
      console.log('🚨 STRIPE REFUND EXECUTING');
      const stripeRefund = await stripe.refunds.create({
        payment_intent: order.paymentIntentId,
        amount: Math.round(refund.total * 100),
        metadata: {
          orderId: String(order._id),
          itemId: String(item._id),
          productId: String(item.productId),
          vendorId: String(item.vendorId),
          quantity: String(refundQty),
        },
      });
      stripeRefundId = stripeRefund.id;
    }

    item.refundedQuantity = Number(item.refundedQuantity || 0) + refundQty;
    item.refundedAmount   = Number(item.refundedAmount || 0) + refund.total;
    item.refundedAt       = new Date();

    item.refundStatus = item.refundedQuantity >= item.quantity ? 'processed' : 'partially_refunded';

    order.paymentStatus = order.items.every((i) => i.refundStatus === 'processed')
      ? 'refunded'
      : 'partially_refunded';

    order.refundStatus = order.paymentStatus === 'refunded' ? 'processed' : 'partially_refunded';

    pushUniqueHistory(
      order,
      item.refundStatus === 'processed' ? 'Refunded' : 'Partially Refunded',
      `Refunded ${item.name} x${refundQty}`
    );

    pushItemHistory(item, {
      type:          item.refundStatus === 'processed' ? 'refund_processed' : 'partial_refund',
      stripeRefundId,
      status:        item.refundStatus,
      quantity:      refundQty,
      amount:        refund.total,
      note:          `Refund processed for ${item.name}`,
      by:            req.user._id,
    });

    await order.save();

    res.json({
      success:        true,
      refundId:       stripeRefundId,
      refundedAmount: refund.total,
      paymentStatus:  order.paymentStatus,
      refundStatus:   item.refundStatus,
    });
  } catch (err) {
    console.error('ITEM REFUND ERROR:', err);
    res.status(500).json({ error: err.message || 'Item refund failed' });
  }
});

/* ======================================================
   APPROVE ITEM RETURN (ADMIN)
====================================================== */
router.patch('/:id/items/:itemId/approve-return', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { quantity } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid order id' });
    if (!mongoose.Types.ObjectId.isValid(itemId)) return res.status(400).json({ error: 'Invalid item id' });

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const item = findOrderItem(order, itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const check = validateReturnApproval(order, item, quantity);
    if (!check.ok) return res.status(400).json({ error: check.error });

    applyReturnApproval(order, item, quantity, req.user._id);
    await order.save();

    res.json({ success: true, returnStatus: item.returnStatus });
  } catch (err) {
    console.error('Admin approve return error:', err);
    res.status(500).json({ error: 'Failed to approve return' });
  }
});

/* ======================================================
   REJECT ITEM RETURN (ADMIN)
====================================================== */
router.patch('/:id/items/:itemId/reject-return', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { reason } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid order id' });
    if (!mongoose.Types.ObjectId.isValid(itemId)) return res.status(400).json({ error: 'Invalid item id' });

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const item = findOrderItem(order, itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const check = validateReturnRejection(order, item);
    if (!check.ok) return res.status(400).json({ error: check.error });

    applyReturnRejection(order, item, reason, req.user._id);
    await order.save();

    res.json({ success: true, returnStatus: item.returnStatus });
  } catch (err) {
    console.error('Admin reject return error:', err);
    res.status(500).json({ error: 'Failed to reject return' });
  }
});

/* ======================================================
   MARK ITEM RETURNED (ADMIN)
====================================================== */
router.patch('/:id/items/:itemId/mark-returned', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id, itemId } = req.params;
    const { quantity, condition } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid order id' });
    if (!mongoose.Types.ObjectId.isValid(itemId)) return res.status(400).json({ error: 'Invalid item id' });

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const item = findOrderItem(order, itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const check = validateMarkItemReturned(order, item, quantity);
    if (!check.ok) return res.status(400).json({ error: check.error });

    const returnedQty = Number(quantity || item.returnApprovedQuantity || 0);
    applyMarkItemReturned(order, item, quantity, condition, req.user._id);

    await triggerItemRefund(order, item, returnedQty, req.user._id);

    order.markModified('items');
    await order.save();

    res.json({ success: true, returnStatus: item.returnStatus, refundStatus: item.refundStatus });
  } catch (err) {
    console.error('Admin mark returned error:', err);
    res.status(500).json({ error: 'Failed to mark item returned' });
  }
});

export default router;
