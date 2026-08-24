import { scheduleRefund, triggerItemRefund } from '../utils/refundLogic.js';
import { mailReturnStatusChange } from '../utils/email.js';
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
import Product from '../models/product.js';

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
    if (status === 'Refunded') {
      // Payment-level status, not the fulfillment-derived "status" field.
      // Includes scheduled refunds (money committed but not yet executed)
      // alongside fully/partially processed ones, including item-level
      // goodwill refunds still in their 24h window.
      orders = orders.filter((o) =>
        ['refunded', 'partially_refunded', 'refund_scheduled'].includes(o.paymentStatus)
        || (o.items || []).some((i) => i.goodwillRefund && i.refundStatus === 'scheduled')
      );
    } else if (status && status !== 'all') {
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
   DEBUG — WHY DIDN'T CJ AUTO-ORDER FIRE FOR THIS ORDER?
   Read-only diagnostic: reports, per item, whether it qualified
   for CJ auto-order and if not, exactly which condition failed.
====================================================== */
router.get('/:id/debug-cj-eligibility', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }

    const Product = (await import('../models/product.js')).default;
    const order = await Order.findById(req.params.id).lean();
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const hasShippingAddress = !!order.shippingAddress?.address1;

    const results = [];
    for (const item of order.items) {
      const vendor = await Vendor.findById(item.vendorId).select('type storeName supplierCredentials').lean();
      const product = await Product.findById(item.productId).select('variants').lean();
      const variants = product?.variants || [];
      const matched = variants.find(v => v.sku && item.variantSku && v.sku.trim() === item.variantSku.trim());
      const vid = matched?.cjVid || variants.find(v => v.cjVid)?.cjVid;

      results.push({
        itemId: item._id,
        name: item.name,
        vendorStoreName: vendor?.storeName || null,
        vendorType: vendor?.type || null,
        isProfessional: vendor?.type === 'professional',
        hasCjCredentials: !!vendor?.supplierCredentials?.cjdropshipping,
        variantSkuOnItem: item.variantSku || '(none)',
        variantCount: variants.length,
        variantsWithCjVid: variants.filter(v => v.cjVid).length,
        resolvedVid: vid || null,
        cjOrderId: item.cjOrderId || null,
        cjOrderStatus: item.cjOrderStatus || null,
        cjOrderError: item.cjOrderError || null,
        wouldQualify: !!(vendor?.type === 'professional' && vendor?.supplierCredentials?.cjdropshipping && vid),
      });
    }

    res.json({ hasShippingAddress, shippingAddress: order.shippingAddress || null, items: results });
  } catch (err) {
    console.error('CJ eligibility debug error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   TEMPORARY — MANUALLY TRIGGER THE CJ ORDER STATUS SYNC
   Runs the same sync the cjOrderStatusSyncWorker's 2h interval
   calls, on demand — for verifying a specific test order's
   status/tracking updates without waiting for the next tick.
   Remove once the worker has been confirmed working for a while.
====================================================== */
router.post('/cj-status-sync-run', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { processCjOrderStatusSync } = await import('../jobs/cjOrderStatusSyncWorker.js');
    const summary = await processCjOrderStatusSync();
    res.json(summary);
  } catch (err) {
    console.error('Manual CJ order status sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ======================================================
   TEMPORARY — TRACE WHY ONE ORDER DID/DIDN'T GET PICKED UP
   BY THE CJ ORDER STATUS SYNC
   Walks the exact same vendor-lookup / query / matching logic
   processCjOrderStatusSync() uses, scoped to a single order, so we
   can see which specific check silently excludes it instead of
   guessing from the worker's aggregate summary. Never exposes the
   decrypted credential itself. Remove once the worker is confirmed
   working for a while.
====================================================== */
router.get('/:id/debug-cj-sync-match', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid order id' });
    }
    const { decryptCredential } = await import('../utils/shippingProviders/registry.js');
    const { TOUCHABLE_STATUSES } = await import('../jobs/cjOrderStatusSyncWorker.js');

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const results = [];
    for (const item of order.items) {
      const trace = { itemId: item._id, name: item.name, cjOrderId: item.cjOrderId || null, status: item.status };

      const vendor = await Vendor.findById(item.vendorId);
      if (!vendor) { trace.result = 'no vendor found for item.vendorId'; results.push(trace); continue; }

      trace.vendorType = vendor.type;
      trace.hasCjCredentials = !!vendor?.supplierCredentials?.cjdropshipping;

      // Mirrors the worker's Vendor.find({ type: 'professional', 'supplierCredentials.cjdropshipping': { $exists: true, $ne: null } })
      trace.wouldBeInWorkerVendorList = vendor.type === 'professional' && !!vendor.supplierCredentials?.cjdropshipping;

      if (!trace.wouldBeInWorkerVendorList) { trace.result = 'excluded before credential decrypt — worker never even looks at this vendor'; results.push(trace); continue; }

      try {
        decryptCredential(vendor.supplierCredentials.cjdropshipping);
        trace.credentialDecrypts = true;
      } catch (err) {
        trace.credentialDecrypts = false;
        trace.decryptError = err.message;
        trace.result = 'credential fails to decrypt — worker would count this as an error and skip the vendor entirely';
        results.push(trace);
        continue;
      }

      trace.cjOrderIdNonEmpty = !!item.cjOrderId;
      trace.statusIsTouchable = TOUCHABLE_STATUSES.has(item.status);

      // Mirrors the worker's Order.find({ 'items.vendorId', 'items.cjOrderId': {$ne:''}, 'items.status': {$in: TOUCHABLE_STATUSES} })
      const matchingOrder = await Order.findOne({
        _id: order._id,
        'items.vendorId': vendor._id,
        'items.cjOrderId': { $ne: '' },
        'items.status': { $in: Array.from(TOUCHABLE_STATUSES) },
      }).select('_id');
      trace.orderLevelQueryMatches = !!matchingOrder;

      trace.wouldBeIncludedInByOrderId = trace.cjOrderIdNonEmpty && trace.statusIsTouchable && trace.orderLevelQueryMatches;
      trace.result = trace.wouldBeIncludedInByOrderId
        ? 'would reach getOrderStatusBatch — if the sync still reports 0 for this item, the CJ API call itself is the problem'
        : 'excluded before ever calling CJ — this is why itemsChecked stayed 0';

      results.push(trace);
    }

    res.json({ orderId: order._id, items: results });
  } catch (err) {
    console.error('CJ sync match trace error:', err);
    res.status(500).json({ error: err.message });
  }
});

/* ======================================================
   DEBUG — RAW CJ VARIANT DATA FOR A PRODUCT
   Temporary diagnostic: shows exactly what CJ's API returns for a
   product's variantList, side by side with our own stored variant
   SKUs — lets us see precisely why a SKU match is failing (case,
   whitespace, wrong CJ product matched, etc.) instead of guessing.
====================================================== */
router.get('/product/:id/debug-cj-raw', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid product id' });
    }
    const Product = (await import('../models/product.js')).default;
    const { decryptCredential } = await import('../utils/shippingProviders/registry.js');
    const { getProductImages } = await import('../utils/shippingProviders/cjdropshipping.js');

    const product = await Product.findById(req.params.id).lean();
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const vendor = await Vendor.findById(product.vendor).select('supplierCredentials').lean();
    const rawCred = vendor?.supplierCredentials?.cjdropshipping;
    if (!rawCred) return res.status(400).json({ error: 'Vendor has no CJ credentials' });

    const credential = decryptCredential(rawCred);
    const vid = (product.variants || []).map(v => v.supplierVariantRef || v.sku).find(Boolean);
    const urlMatch = product.supplierUrl && /cjdropshipping\.com/i.test(product.supplierUrl)
      ? (product.supplierUrl.match(/[?&]id=([\w-]+)/) || product.supplierUrl.match(/-p-(\w+)\.html/i))
      : null;
    const pidOverride = urlMatch ? urlMatch[1] : null;

    const result = await getProductImages(vid, product.name, credential, pidOverride);

    res.json({
      searchedWith: vid,
      pidOverride,
      supplierUrl: product.supplierUrl || null,
      ourVariantSkus: (product.variants || []).map(v => ({ sku: v.sku, cjVid: v.cjVid || null })),
      cjResult: result ? {
        error: result.error || null,
        supplier: result.supplier || null,
        supplierUrl: result.supplierUrl || null,
        cjVariants: result.cjVariants || [],
      } : null,
    });
  } catch (err) {
    console.error('CJ raw debug error:', err);
    res.status(500).json({ error: err.message || 'Server error' });
  }
});

/* ======================================================
   CORRECT STALE ITEM SHIPPING COST (ADMIN)
   One-off data-correction tool for orders placed before the
   shipIncluded webhook fix, where item.shippingCost was
   incorrectly stamped non-zero even though nothing was actually
   charged for shipping. Logged for audit purposes.
====================================================== */
router.patch('/:id/items/:itemId/correct-shipping-cost', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id) || !mongoose.Types.ObjectId.isValid(req.params.itemId)) {
      return res.status(400).json({ error: 'Invalid id' });
    }
    const { shippingCost } = req.body;
    if (!Number.isFinite(Number(shippingCost)) || Number(shippingCost) < 0) {
      return res.status(400).json({ error: 'Invalid shippingCost' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const item = order.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const before = item.shippingCost;
    item.shippingCost = Number(shippingCost);

    // vendorOrders[].shipping/.total are a separate snapshot taken at order
    // creation (subtotal + sum of that vendor's items' shippingCost, see
    // stripeWebhook.js) — correcting only item.shippingCost silently leaves
    // these stale, which is exactly what produced the "Items: £X + Shipping:
    // £Y = Total: £Z" summary still showing the old, wrong charge even after
    // the item-level fix. Recompute the affected vendor's entry to match.
    const vendorOrder = order.vendorOrders.find((vo) => String(vo.vendorId) === String(item.vendorId));
    if (vendorOrder) {
      const vendorItems = order.items.filter((i) => String(i.vendorId) === String(item.vendorId));
      const vendorSubtotal = vendorItems.reduce((s, i) => s + Number(i.subtotal || 0), 0);
      const vendorShipping = vendorItems.reduce((s, i) => s + Number(i.shippingCost || 0), 0);
      vendorOrder.shipping = vendorShipping;
      vendorOrder.total = vendorSubtotal + vendorShipping;
      order.markModified('vendorOrders');
    }

    order.markModified('items');
    await order.save();

    console.log(`[admin] Corrected shippingCost on order ${order._id} item ${item._id}: ${before} -> ${item.shippingCost} (by ${req.user._id})`);
    res.json({ success: true, itemId: item._id, before, after: item.shippingCost });
  } catch (err) {
    console.error('Correct shipping cost error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   BACKFILL MISSING refundedAmount (ADMIN)
   One-off data-correction tool for items refunded via the old
   full-order refund worker path, which flipped refundStatus to
   'processed' without ever recording refundedAmount/refundedQuantity
   (fixed going forward in jobs/refundWorker.js). Only touches items
   that are actually 'processed' but still show 0 refunded — recomputes
   using the same formula the code now applies automatically.
====================================================== */
router.patch('/:id/items/:itemId/backfill-refunded-amount', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id) || !mongoose.Types.ObjectId.isValid(req.params.itemId)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const item = order.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    if (item.refundStatus !== 'processed') {
      return res.status(400).json({ error: `Item refundStatus is "${item.refundStatus}", not "processed" — nothing to backfill` });
    }
    if (Number(item.refundedAmount || 0) > 0) {
      return res.status(400).json({ error: `refundedAmount is already £${Number(item.refundedAmount).toFixed(2)} — not zero, refusing to overwrite` });
    }

    const qty = Number(item.quantity || 0);
    const amount = calculateItemRefundAmount(item, qty).total;

    item.refundedQuantity = qty;
    item.refundedAmount = amount;
    item.refundedAt = item.refundedAt || new Date();
    order.markModified('items');
    await order.save();

    console.log(`[admin] Backfilled refundedAmount on order ${order._id} item ${item._id}: 0 -> ${amount} (by ${req.user._id})`);
    res.json({ success: true, itemId: item._id, refundedAmount: amount, refundedQuantity: qty });
  } catch (err) {
    console.error('Backfill refunded amount error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   PER-ITEM CANCEL (ADMIN — TOTAL OVERRIDE)
   Unlike the vendor's own cancel action (Pending/Processing only),
   admin can cancel an item from ANY non-cancelled state — full
   override power. Refunds whatever quantity is still unrefunded;
   triggerItemRefund's own safety cap protects against a stale
   shippingCost ever requesting more than Stripe actually holds.
====================================================== */
router.patch('/:id/items/:itemId/cancel', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id) || !mongoose.Types.ObjectId.isValid(req.params.itemId)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const item = order.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    if (item.status === 'Cancelled') {
      return res.status(400).json({ error: 'Item is already cancelled' });
    }

    item.statusBeforeCancel = item.status;
    item.status = 'Cancelled';
    item.cancelledAt = new Date();

    const isPaid = ['paid', 'partially_refunded'].includes((order.paymentStatus || '').toLowerCase());
    const outstandingQty = Math.max(0, Number(item.quantity || 0) - Number(item.refundedQuantity || 0));

    let refundResult = null;
    if (isPaid && order.paymentIntentId && outstandingQty > 0 && item.refundStatus !== 'processed') {
      refundResult = await triggerItemRefund(order, item, outstandingQty, req.user._id);
    }

    pushUniqueHistory(
      order,
      'Cancelled',
      `Admin cancelled item: "${item.name}"${refundResult && !refundResult.success ? ' (refund failed — see below)' : ''}`
    );

    order.markModified('items');
    await order.save();

    res.json({
      success: true,
      refunded: !!(refundResult && refundResult.success),
      refundedAmount: refundResult?.refundedAmount,
    });
  } catch (err) {
    console.error('Admin item cancel error:', err);
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
          item.statusBeforeCancel = item.status;
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

    // Reverse the fulfillment cancellation itself, not just the refund —
    // otherwise the order is left permanently dead-ended at Cancelled with
    // no way for the vendor to keep processing it, even though the money
    // never actually left.
    order.items.forEach((item) => {
      item.refundScheduledAt = null;

      if (item.refundStatus === 'scheduled') {
        item.refundStatus = 'none';
      }

      if (item.status === 'Cancelled' && item.statusBeforeCancel) {
        item.status = item.statusBeforeCancel;
        item.statusBeforeCancel = '';
        item.cancelledAt = undefined;
      }
    });

    // clear vendor-level refund schedules and re-derive status from the
    // now-reverted items instead of assuming a fixed end state
    if (Array.isArray(order.vendorOrders)) {
      order.vendorOrders.forEach((vo) => {
        vo.refundScheduledAt = null;
        if (vo.refundStatus === 'scheduled') vo.refundStatus = 'none';
        vo.status = getDerivedVendorStatus(vo, order.items);
      });
    }

    pushUniqueHistory(order, 'Refund Schedule Cancelled', 'Scheduled refund cancelled by admin — order reactivated');

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
   GOODWILL REFUND (ADMIN) — no physical return required.
   Defaults to platform-paid (doesn't hit vendor payout) but admin can
   choose to charge it to the vendor instead. Scheduled 24h out, same
   as the vendor-initiated version, processed by the same refundWorker.
====================================================== */

router.post('/:id/items/:itemId/goodwill-refund', authMiddleware, adminMiddleware, async (req, res) => {
  const { id, itemId } = req.params;
  const { amount, reason, paidBy } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid order id' });
  }
  if (!mongoose.Types.ObjectId.isValid(itemId)) {
    return res.status(400).json({ error: 'Invalid item id' });
  }
  if (!String(reason || '').trim()) {
    return res.status(400).json({ error: 'Please explain why this goodwill refund is being issued' });
  }
  const payer = paidBy === 'vendor' ? 'vendor' : 'platform';

  try {
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const item = findOrderItem(order, itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    if (!['paid', 'partially_refunded', 'refunded'].includes(order.paymentStatus)) {
      return res.status(400).json({ error: 'Only paid orders can be refunded' });
    }
    if (['requested', 'processing', 'scheduled'].includes(item.refundStatus)) {
      return res.status(400).json({ error: 'A refund is already requested or scheduled for this item' });
    }

    // A previous refund being 'processed' doesn't mean nothing's left —
    // e.g. a return with shipping withheld leaves that shipping amount
    // still legitimately refundable via goodwill. Deliberately NOT using
    // calculateItemRefundAmount() here — it excludes withheld postage by
    // design for standard returns, but goodwill exists specifically to
    // allow releasing that withheld amount as an exception.
    const maxRefundable = Math.max(0,
      Number(item.price || 0) * Number(item.quantity || 0)
      + Number(item.shippingCost || 0)
      - Number(item.discountAmount || 0)
      - Number(item.refundedAmount || 0)
    );
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
    item.goodwillPaidBy = payer;
    item.refundReason = String(reason).trim();
    item.refundStatus = 'scheduled';
    item.refundRequestedAt = new Date();
    item.refundScheduledAt = scheduledAt;

    pushItemHistory(item, {
      type: 'goodwill_refund_scheduled',
      status: 'scheduled',
      amount: refundAmount,
      note: `Goodwill refund scheduled by admin, paid by ${payer} (executes in 24h unless cancelled): ${item.refundReason}`,
      by: req.user._id,
    });

    pushUniqueHistory(order, 'Goodwill Refund Scheduled', `Goodwill refund of £${refundAmount.toFixed(2)} scheduled for ${item.name} (paid by ${payer})`);

    order.markModified('items');
    await order.save();

    res.json({ success: true, scheduledAt, amount: refundAmount, paidBy: payer });
  } catch (err) {
    console.error('Admin goodwill refund schedule error:', err);
    res.status(500).json({ error: 'Failed to schedule goodwill refund' });
  }
});

router.patch('/:id/items/:itemId/goodwill-refund/cancel', authMiddleware, adminMiddleware, async (req, res) => {
  const { id, itemId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid order id' });
  }
  if (!mongoose.Types.ObjectId.isValid(itemId)) {
    return res.status(400).json({ error: 'Invalid item id' });
  }

  try {
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const item = findOrderItem(order, itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

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
      note: 'Goodwill refund cancelled by admin before it was processed',
      by: req.user._id,
    });

    pushUniqueHistory(order, 'Goodwill Refund Cancelled', `Goodwill refund cancelled for ${item.name}`);

    order.markModified('items');
    await order.save();

    res.json({ success: true });
  } catch (err) {
    console.error('Admin goodwill refund cancel error:', err);
    res.status(500).json({ error: 'Failed to cancel goodwill refund' });
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

    // Email buyer
    const buyer = await order.populate('user', 'email').then(o => o.user).catch(() => null);
    if (buyer?.email) {
      mailReturnStatusChange({ to: buyer.email, orderRef: order.shortId || order._id, itemName: item.name, approved: true }).catch(() => {});
    }

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

    // Email buyer
    const buyer = await order.populate('user', 'email').then(o => o.user).catch(() => null);
    if (buyer?.email) {
      mailReturnStatusChange({ to: buyer.email, orderRef: order.shortId || order._id, itemName: item.name, approved: false, reason }).catch(() => {});
    }

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

// Temporary — one-off correction for order items snapshotted with the
// product's generic main image instead of the purchased variant's own
// image (bug fixed in orders.js/cart.js/stripeWebhook.js; this repairs
// items that were saved before that fix went live).
router.post('/:id/items/:itemId/fix-image', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id, itemId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid order id' });
    if (!mongoose.Types.ObjectId.isValid(itemId)) return res.status(400).json({ error: 'Invalid item id' });

    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const item = findOrderItem(order, itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const product = await Product.findById(item.productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const variantSku = item.variantSku || '';
    const matchedVariant = variantSku
      ? (product.variants || []).find(v => v.sku && v.sku.trim() === variantSku.trim())
      : null;

    const oldImage = item.image;
    item.image = matchedVariant?.image || product.images?.[0] || '/assets/images/products/sell4life-placeholder.png';

    order.markModified('items');
    await order.save();

    res.json({ orderId: order._id, itemId: item._id, oldImage, newImage: item.image });
  } catch (err) {
    console.error('Fix item image error:', err);
    res.status(500).json({ error: 'Server error', message: err.message });
  }
});

export default router;
