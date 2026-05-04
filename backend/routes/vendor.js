// ======================================================
// VENDOR ROUTES (UNIFIED + FIXED)
// ======================================================

import mongoose from 'mongoose';
import express from 'express';

import { requireApprovedVendor } from '../middleware/vendorMiddleware.js';
import { canUpdateStatus } from '../utils/orderLogic.js';
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
      return res.status(400).json({ error: 'Missing fields' });
    }

    // prevent duplicate vendor per user
    const existing = await Vendor.findOne({ userId: req.user._id });
    if (existing) {
      return res.status(400).json({ error: 'Vendor already exists' });
    }

    // ensure slug is unique
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

    res.json({ success: true, vendor });
  } catch (err) {
    console.error('Vendor create error:', err);
    res.status(500).json({ error: 'Failed to create vendor' });
  }
});

/* ======================================================
   VENDOR ROLE CHECK
====================================================== */
function requireVendor(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.role !== 'vendor' && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Vendor access required' });
  }

  next();
}

/* ======================================================
   HELPER: GET VENDOR PROFILE
====================================================== */
async function getVendor(req) {
  return await Vendor.findOne({ userId: req.user._id });
}

/* ======================================================
   DASHBOARD
====================================================== */
router.get('/dashboard', authMiddleware, requireVendor, async (req, res) => {
  try {
    const vendor = await getVendor(req);
    if (!vendor) {
      return res.status(403).json({ error: 'Vendor profile not found' });
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

    let grossRevenue = 0; // 💰 all money that ever came in
    let revenueLoss = 0; // 💸 all refunded / scheduled refunds

    ordersRaw.forEach((order) => {
      const vendorOrder = order.vendorOrders.find((vo) => String(vo.vendorId) === String(vendorId));

      if (!vendorOrder) return;

      totalOrders++;

      const status = vendorOrder.status;
      const paymentStatus = (order.paymentStatus || '').toLowerCase();
      const subtotal = Number(vendorOrder.subtotal || 0);

      // 📊 STATUS METRICS (pure logic, no finance mixing)

      if (status === 'Delivered') {
        completedOrders++;
      }

      if (['Pending', 'Processing', 'Shipped'].includes(status)) {
        activeOrders++;
      }

      // 💰 FINANCIAL STATES

      const isPaid =
        paymentStatus === 'paid' ||
        paymentStatus === 'refunded' ||
        paymentStatus === 'refund_scheduled';

      const isRefunded = paymentStatus === 'refunded' || paymentStatus === 'refund_scheduled';

      // 📊 Refund count (order-level metric)

      if (isRefunded) {
        refundedOrders++;
      }

      // 💰 Gross = everything that was ever paid

      if (isPaid) {
        grossRevenue += subtotal;
      }

      // 💸 Loss = everything refunded or scheduled

      if (isRefunded) {
        revenueLoss += subtotal;
      }
    });

    // 🧠 REAL MONEY LEFT

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
    res.status(500).json({ error: 'Server error' });
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
    }).sort({ createdAt: -1 });

    res.json(products);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET ORDERS (🔥 RESTORED)
====================================================== */
router.get('/orders', authMiddleware, requireVendor, async (req, res) => {
  try {
    const vendor = await getVendor(req);
    if (!vendor) return res.status(403).json({ error: 'Vendor profile not found' });

    const { status, q } = req.query;

    const filter = {
      vendorOrders: {
        $elemMatch: { vendorId: vendor._id },
      },
    };

    if (status && status !== 'all') {
      if (status === 'active') {
        filter['vendorOrders.status'] = { $in: ['Pending', 'Processing', 'Shipped'] };
      } else if (status === 'issues') {
        filter['vendorOrders.status'] = { $in: ['Cancel Requested', 'Return Requested'] };
      } else if (status === 'completed') {
        filter['vendorOrders.status'] = { $in: ['Delivered', 'Returned', 'Cancelled'] };
      } else {
        filter['vendorOrders.status'] = status;
      }
    }

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

    const ordersRaw = await Order.find(filter).populate('user', 'email').sort({ createdAt: -1 });

    const orders = ordersRaw.map((order) => {
      const vendorOrder = order.vendorOrders.find(
        (vo) => String(vo.vendorId) === String(vendor._id)
      );

      return {
        ...order.toObject(),
        status: vendorOrder?.status || order.status,
        refundScheduledAt: vendorOrder?.refundScheduledAt || null,
      };
    });

    res.json({ orders });
  } catch (err) {
    console.error('Vendor orders fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET SINGLE ORDER
====================================================== */
router.get('/orders/:id', authMiddleware, requireVendor, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid order id' });
  }

  try {
    const vendor = await getVendor(req);
    if (!vendor) return res.status(403).json({ error: 'Vendor profile not found' });

    const order = await Order.findById(req.params.id).populate('user', 'email');

    if (!order) return res.status(404).json({ error: 'Order not found' });

    const vendorOrder = order.vendorOrders.find((vo) => String(vo.vendorId) === String(vendor._id));

    if (!vendorOrder) {
      return res.status(403).json({ error: 'Not your order' });
    }

    res.json({
      ...order.toObject(),
      status: vendorOrder.status,
      refundScheduledAt: vendorOrder.refundScheduledAt || null,
    });
  } catch (err) {
    console.error('Vendor order fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET VENDOR STATUS (🔥 REQUIRED)
====================================================== */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ userId: req.user._id }).sort({ createdAt: -1 });
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
   UPDATE STATUS (UNIFIED)
====================================================== */
router.patch('/orders/:id/status', authMiddleware, requireApprovedVendor, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid order id' });
  }

  try {
    const { status } = req.body;

    const order = await Order.findById(req.params.id);
    const vendor = req.vendor;

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!vendor) return res.status(403).json({ error: 'Vendor profile not found' });

    const vendorOrder = order.vendorOrders.find((vo) => String(vo.vendorId) === String(vendor._id));

    if (!vendorOrder) {
      return res.status(403).json({ error: 'Not your order' });
    }

    // 🚫 BLOCK if refund scheduled
    if (vendorOrder.refundScheduledAt && new Date(vendorOrder.refundScheduledAt) > new Date()) {
      return res.status(400).json({ error: 'Refund already scheduled' });
    }

    const check = canUpdateStatus(
      { ...order.toObject(), status: vendorOrder.status },
      status,
      'vendor'
    );

    if (!check.ok) {
      return res.status(400).json({ error: check.error });
    }

    const now = new Date();

    // 🔥 SMART STATUS HANDLING
    if (status === 'Return Rejected') {
      vendorOrder.status = 'Delivered';
    } else {
      vendorOrder.status = status;
    }

    // timestamps
    if (status === 'Delivered') vendorOrder.deliveredAt = now;
    if (status === 'Cancelled') vendorOrder.cancelledAt = now;
    if (status === 'Returned') vendorOrder.returnedAt = now;

    // 1️⃣ FIRST → write business event
    order.statusHistory.push({
      status,
      note: `Vendor ${vendor._id} updated`,
      date: now,
    });

    // 2️⃣ THEN → trigger refund logic
    if ((status === 'Returned' || status === 'Cancelled') && !order.refundScheduledAt) {
      scheduleRefund(order);
    }

    await order.save();

    res.json({
      success: true,
      vendorStatus: vendorOrder.status,
      refundScheduledAt: order.refundScheduledAt || null,
    });
  } catch (err) {
    console.error('Vendor status update error:', err);
    res.status(500).json({ error: err.message || 'Update failed' });
  }
});

export default router;
