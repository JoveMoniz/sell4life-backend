// ======================================================
// VENDOR ROUTES (UNIFIED + ITEM-LEVEL RETURNS)
// ======================================================

import mongoose from 'mongoose';
import express from 'express';

import { requireApprovedVendor } from '../middleware/vendorMiddleware.js';

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
} from '../utils/returnLogic.js';

import { pushUniqueHistory } from '../utils/historyLogic.js';
import { scheduleRefund } from '../utils/refundLogic.js';

import User from '../models/user.js';
import Product from '../models/product.js';
import Order from '../models/order.js';
import Vendor from '../models/vendor.js';

import authMiddleware from '../middleware/authMiddleware.js';

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

    const vendor = await Vendor.create({
      userId: req.user._id,
      storeName,
      storeSlug: slug,
      status: 'pending',
    });

    res.json({
      success: true,
      vendor,
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

function requireVendor(req, res, next) {
  if (!req.user) {
    return res.status(401).json({
      error: 'Authentication required',
    });
  }

  if (req.user.role !== 'vendor' && req.user.role !== 'admin') {
    return res.status(403).json({
      error: 'Vendor access required',
    });
  }

  next();
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
   DASHBOARD
====================================================== */

router.get('/dashboard', authMiddleware, requireVendor, async (req, res) => {
  try {
    const vendor = await getVendor(req);

    if (!vendor) {
      return res.status(403).json({
        error: 'Vendor profile not found',
      });
    }

    const vendorId = vendor._id;

    const products = await Product.countDocuments({
      vendor: vendorId,
      archived: false,
    });

    const ordersRaw = await Order.find({
      'vendorOrders.vendorId': vendorId,
    });

    let totalOrders = 0;
    let completedOrders = 0;
    let refundedOrders = 0;
    let activeOrders = 0;

    let grossRevenue = 0;
    let revenueLoss = 0;

    ordersRaw.forEach((order) => {
      const vendorOrder = order.vendorOrders.find((vo) => String(vo.vendorId) === String(vendorId));

      if (!vendorOrder) return;

      totalOrders++;

      const status = getDerivedVendorStatus(vendorOrder, order.items || []);
      const paymentStatus = (order.paymentStatus || '').toLowerCase();

      const subtotal = Number(vendorOrder.subtotal || 0);

      // metrics

      if (status === 'Delivered') {
        completedOrders++;
      }

      if (['Pending', 'Processing', 'Shipped'].includes(status)) {
        activeOrders++;
      }

      const isPaid =
        paymentStatus === 'paid' ||
        paymentStatus === 'refunded' ||
        paymentStatus === 'refund_scheduled' ||
        paymentStatus === 'partially_refunded';

      const isRefunded =
        paymentStatus === 'refunded' ||
        paymentStatus === 'refund_scheduled' ||
        paymentStatus === 'partially_refunded';

      if (isRefunded) {
        refundedOrders++;
      }

      if (isPaid) {
        grossRevenue += subtotal;
      }

      if (isRefunded) {
        revenueLoss += subtotal;
      }
    });

    const netRevenue = grossRevenue - revenueLoss;

    res.json({
      products,

      totalOrders,
      completedOrders,
      refundedOrders,
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
   PRODUCTS
====================================================== */

router.get('/products', authMiddleware, requireApprovedVendor, async (req, res) => {
  try {
    const vendor = req.vendor;

    const products = await Product.find({
      vendor: vendor._id,
      archived: false,
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
          ['Pending', 'Processing', 'Shipped'].includes(o.status)
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

router.get('/me', authMiddleware, async (req, res) => {
  try {
    const vendor = await Vendor.findOne({
      userId: req.user._id,
    }).sort({
      createdAt: -1,
    });

    res.json({
      isVendor: !!vendor,
      vendor: vendor || null,
    });
  } catch (err) {
    console.error('Vendor /me error:', err);

    res.status(500).json({
      error: 'Server error',
    });
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
      if (['Pending', 'Processing', 'Shipped'].includes(item.status)) {
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

      applyMarkItemReturned(order, item, quantity, condition, req.user._id);

      const vendorOrder = order.vendorOrders.find(
        (vo) => String(vo.vendorId) === String(vendor._id)
      );

      // Do NOT scheduleRefund here — per-item returns are refunded via the
      // admin per-item refund button, not the whole-order worker.

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

      order.markModified('items');
      order.markModified('vendorOrders');
      await order.save();

      res.json({ success: true, status: item.status });
    } catch (err) {
      console.error('Vendor approve cancel error:', err);
      res.status(500).json({ error: err.message || 'Approve cancel failed' });
    }
  }
);

export default router;
