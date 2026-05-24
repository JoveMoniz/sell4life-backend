// ======================================================
// SELL4LIFE – ORDERS ROUTES
// CLEAN + CONSISTENT + ITEM-LEVEL RETURN FOUNDATION
// ======================================================

import express from 'express';
import mongoose from 'mongoose';

import {
  canRequestCancel,
  getDerivedOrderStatus,
  getDerivedVendorStatus,
  getDerivedPaymentStatus,
} from '../utils/orderLogic.js';

import { pushUniqueHistory } from '../utils/historyLogic.js';

import { findOrderItem, validateReturnRequest, applyReturnRequest } from '../utils/returnLogic.js';

import Vendor from '../models/vendor.js';
import Order from '../models/order.js';
import Product from '../models/product.js';

import stripe from '../config/stripe.js';

import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

/* ======================================================
   NORMALIZE ORDER
====================================================== */

function normalizeOrder(order) {
  return {
    id: order._id.toString(),
    shortId: order.shortId,

    user: order.user,
    email: order.email,

    items: order.items,
    vendorOrders: order.vendorOrders,

    subtotal: order.subtotal,
    shipping: order.shipping,
    tax: order.tax,
    discount: order.discount,
    platformFee: order.platformFee,
    total: order.total,

    currency: order.currency,

    status: getDerivedOrderStatus(order),

    paymentStatus: getDerivedPaymentStatus(order),

    refundStatus: order.refundStatus,
    paymentIntentId: order.paymentIntentId,

    statusHistory: order.statusHistory || [],

    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

/* ======================================================
   CREATE PAYMENT INTENT
====================================================== */

router.post('/create-payment-intent', authMiddleware, async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items) || !items.length) {
      return res.status(400).json({ error: 'Invalid cart data' });
    }

    const vendor = await Vendor.findOne({ userId: req.user._id });

    const normalizedItems = await Promise.all(
      items.map(async (item) => {
        if (!mongoose.Types.ObjectId.isValid(item.productId)) {
          throw new Error('Invalid productId');
        }

        const product = await Product.findById(item.productId);

        if (!product) throw new Error('Product not found');
        if (!product.vendor) throw new Error('Product has no vendor');
        if (!product.active || product.archived) {
          throw new Error('Product not available');
        }

        if (vendor && String(product.vendor) === String(vendor._id)) {
          throw new Error('You cannot buy your own product');
        }

        const quantity = Math.min(99, Math.max(1, parseInt(item.quantity, 10) || 1));
        if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 100) {
          throw new Error('Invalid quantity');
        }

        if (product.trackInventory && product.stock < quantity) {
          throw new Error(`${product.name} is out of stock`);
        }

        const price = Number(product.price);
        const shippingCost = Number(product.shippingCost || 0);
        const subtotal = Number((price * quantity).toFixed(2));
        return {
          productId: product._id,
          vendorId: product.vendor,

          variantSku: item.variantSku || '',
          sku: product.sku || '',

          name: product.name,
          price,
          quantity,
          subtotal,
          shippingCost,

          image: product.images?.[0] || '/assets/images/products/sell4life-placeholder.png',

          attributes: item.attributes || {},
        };
      })
    );

    const subtotal = Number(normalizedItems.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));
    const shippingAmount = Number(normalizedItems.reduce((sum, item) => sum + item.shippingCost, 0).toFixed(2));
    const total = Number((subtotal + shippingAmount).toFixed(2));

    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(total * 100),
      currency: 'gbp',
      automatic_payment_methods: { enabled: true },
      metadata: {
        userId: String(req.user._id),
        shipping: String(shippingAmount),
        items: JSON.stringify(
          normalizedItems.map((item) => ({
            productId: String(item.productId),
            vendorId: String(item.vendorId),
            quantity: item.quantity,
            price: item.price,
          }))
        ),
      },
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      shipping: shippingAmount,
    });
  } catch (err) {
    console.error('PAYMENT ERROR:', err);
    res.status(500).json({
      error: err.message || 'Payment error',
    });
  }
});

/* ======================================================
   GET MY ORDERS
====================================================== */

router.get('/', authMiddleware, async (req, res) => {
  try {
    const orders = await Order.find({ user: req.user.id }).sort({
      createdAt: -1,
    });

    res.json({
      orders: orders.map(normalizeOrder),
    });
  } catch (err) {
    console.error('GET ORDERS ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET ORDER BY PAYMENT INTENT
====================================================== */

router.get('/by-payment/:paymentIntentId', authMiddleware, async (req, res) => {
  try {
    const order = await Order.findOne({
      paymentIntentId: req.params.paymentIntentId,
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (String(order.user) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    res.json(normalizeOrder(order));
  } catch (err) {
    console.error('GET ORDER BY PAYMENT ERROR:', err);
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

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json(normalizeOrder(order));
  } catch (err) {
    console.error('GET ORDER ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   CUSTOMER REQUEST CANCEL
   ORDER-LEVEL FOR NOW
====================================================== */

router.patch('/:id/request-cancel', authMiddleware, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid order id' });
  }

  try {
    const order = await Order.findById(req.params.id);

    if (!order || String(order.user) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const check = canRequestCancel(order);

    if (!check.ok) {
      return res.status(400).json({ error: check.error });
    }

    order.cancelRequestedAt = new Date();

    if (order.paymentStatus === 'refunded') {
      return res.status(400).json({
        error: 'Refunded orders cannot be cancelled',
      });
    }

    order.vendorOrders.forEach((vendorOrder) => {
      vendorOrder.status = 'Cancel Requested';
    });

    order.items.forEach((item) => {
      if (['Pending', 'Processing'].includes(item.status)) {
        item.status = 'Cancel Requested';
      }
    });

    pushUniqueHistory(order, 'Cancel Requested', 'Requested by customer');
    order.status = getDerivedOrderStatus(order);

    await order.save();

    res.json(normalizeOrder(order));
  } catch (err) {
    console.error('REQUEST CANCEL ERROR:', err);
    res.status(500).json({ error: 'Cancel request failed' });
  }
});

/* ======================================================
   CUSTOMER REQUEST ITEM CANCEL (PER-ITEM)
====================================================== */

router.patch('/:id/items/:itemId/cancel-request', authMiddleware, async (req, res) => {
  const { id, itemId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id))
    return res.status(400).json({ error: 'Invalid order id' });
  if (!mongoose.Types.ObjectId.isValid(itemId))
    return res.status(400).json({ error: 'Invalid item id' });

  try {
    const order = await Order.findById(id);

    if (!order || String(order.user) !== String(req.user.id))
      return res.status(403).json({ error: 'Not allowed' });

    const item = findOrderItem(order, itemId);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    if (item.refundStatus === 'processed')
      return res.status(400).json({ error: 'Item already refunded, cannot cancel' });

    if (!['Pending', 'Processing'].includes(item.status))
      return res.status(400).json({ error: `Cannot cancel item with status: ${item.status}` });

    item.status = 'Cancel Requested';

    const vendorOrder = order.vendorOrders.find(
      vo => String(vo.vendorId) === String(item.vendorId)
    );
    if (vendorOrder) {
      const vendorItems = order.items.filter(
        i => String(i.vendorId) === String(item.vendorId)
      );
      vendorOrder.status = getDerivedVendorStatus(vendorOrder, vendorItems);
    }

    pushUniqueHistory(order, 'Cancel Requested', `Cancel requested for ${item.name}`);
    order.status = getDerivedOrderStatus(order);

    await order.save();
    res.json(normalizeOrder(order));
  } catch (err) {
    console.error('ITEM CANCEL REQUEST ERROR:', err);
    res.status(500).json({ error: 'Cancel request failed' });
  }
});

/* ======================================================
   CUSTOMER REQUEST ITEM RETURN
   NEW ITEM-LEVEL PARTIAL RETURN ROUTE
====================================================== */

router.post('/:id/items/:itemId/return-request', authMiddleware, async (req, res) => {
  const { id, itemId } = req.params;
  const { quantity, reason } = req.body;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: 'Invalid order id' });
  }

  if (!mongoose.Types.ObjectId.isValid(itemId)) {
    return res.status(400).json({ error: 'Invalid item id' });
  }

  try {
    const order = await Order.findById(id);

    if (!order || String(order.user) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const item = findOrderItem(order, itemId);

    if (!item) {
      return res.status(404).json({
        error: 'Item not found',
      });
    }

    if (item.refundStatus === 'processed') {
      return res.status(400).json({
        error: 'Item already refunded',
      });
    }

    const check = validateReturnRequest(order, item, quantity);

    if (!check.ok) {
      return res.status(400).json({ error: check.error });
    }

    applyReturnRequest(order, item, quantity, reason, req.user._id);

    // =====================================================
    // RECALCULATE VENDOR STATUS
    // =====================================================

    order.vendorOrders.forEach((vendorOrder) => {
      vendorOrder.status = getDerivedVendorStatus(vendorOrder, order.items);
    });

    // =====================================================
    // RECALCULATE GLOBAL ORDER STATUS
    // =====================================================

    order.status = getDerivedOrderStatus(order);

    await order.save();

    res.json(normalizeOrder(order));
  } catch (err) {
    console.error('ITEM RETURN REQUEST ERROR:', err);
    res.status(500).json({ error: 'Return request failed' });
  }
});

/* ======================================================
   LEGACY CUSTOMER REQUEST WHOLE ORDER RETURN
   TEMPORARY SUPPORT
====================================================== */

router.patch('/:id/request-return', authMiddleware, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid order id' });
  }

  try {
    const order = await Order.findById(req.params.id);

    if (!order || String(order.user) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    const deliveredItems = order.items.filter((item) => item.status === 'Delivered');

    if (!deliveredItems.length) {
      return res.status(400).json({
        error: 'No delivered items available for return',
      });
    }

    for (const item of deliveredItems) {
      const availableQty =
        Number(item.quantity || 0) -
        Number(item.returnQuantity || 0) -
        Number(item.returnRequestedQuantity || 0);

      if (availableQty <= 0) continue;

      const check = validateReturnRequest(order, item, availableQty);

      if (check.ok) {
        applyReturnRequest(order, item, availableQty, 'Whole order return requested', req.user._id);
      }
    }

    order.status = getDerivedOrderStatus(order);

    await order.save();

    res.json(normalizeOrder(order));
  } catch (err) {
    console.error('WHOLE ORDER RETURN REQUEST ERROR:', err);
    res.status(500).json({ error: 'Return request failed' });
  }
});

export default router;
