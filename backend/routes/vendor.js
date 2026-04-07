// ======================================================
// VENDOR ROUTES (FINAL MERGED VERSION)
// ======================================================

import mongoose from 'mongoose';
import { canUpdateStatus } from '../utils/orderLogic.js';
import express from 'express';

import User from '../models/user.js';
import Product from '../models/product.js';
import Order from '../models/order.js';
import Vendor from '../models/vendor.js';

import authMiddleware from '../middleware/authMiddleware.js';

const router = express.Router();

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
   CREATE VENDOR
====================================================== */
router.post('/create', authMiddleware, async (req, res) => {
  try {
    const { storeName, storeSlug } = req.body;

    if (!storeName || !storeSlug) {
      return res.status(400).json({ error: 'storeName and storeSlug required' });
    }

    const existing = await Vendor.findOne({ userId: req.user._id });
    if (existing) {
      return res.status(400).json({ error: 'Vendor already exists' });
    }

    const vendor = await Vendor.create({
      userId: req.user._id,
      storeName,
      storeSlug,
    });

    const user = await User.findById(req.user._id);
    if (user) {
      user.role = 'vendor';
      await user.save();
    }

    res.status(201).json(vendor);
  } catch (err) {
    console.error('CREATE VENDOR ERROR:', err);

    if (err.code === 11000) {
      return res.status(400).json({ error: 'Store slug already taken' });
    }

    res.status(500).json({ error: 'Failed to create vendor' });
  }
});

/* ======================================================
   GET VENDOR STATUS
====================================================== */
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const vendor = await Vendor.findOne({ userId: req.user._id });

    res.json({
      isVendor: !!vendor,
      vendor: vendor || null,
    });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

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

    const orders = await Order.countDocuments({
      'items.vendorId': vendorId,
      paymentStatus: 'paid',
    });

    const revenueAgg = await Order.aggregate([
      { $match: { paymentStatus: 'paid' } },
      { $unwind: '$items' },
      { $match: { 'items.vendorId': vendorId } },
      {
        $group: {
          _id: null,
          total: { $sum: '$items.subtotal' },
        },
      },
    ]);

    const revenue = revenueAgg[0]?.total || 0;

    res.json({ products, orders, revenue });
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   PRODUCTS
====================================================== */
router.get('/products', authMiddleware, requireVendor, async (req, res) => {
  try {
    const vendor = await getVendor(req);

    if (!vendor) {
      return res.status(403).json({ error: 'Vendor profile not found' });
    }

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
   DELETE PRODUCT
====================================================== */
router.delete('/products/:id', authMiddleware, requireVendor, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid product id' });
  }

  try {
    const product = await Product.findById(req.params.id);
    const vendor = await getVendor(req);

    if (!product || !vendor || product.vendor.toString() !== vendor._id.toString()) {
      return res.status(403).json({ error: 'Not allowed' });
    }

    product.archived = true;
    await product.save();

    res.json({ success: true });
  } catch {
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

    if (!vendor) {
      return res.status(403).json({ error: 'Vendor profile not found' });
    }

    const order = await Order.findOne({
      _id: req.params.id,
      'items.vendorId': vendor._id,
    });

    if (!order) return res.status(404).json({ error: 'Order not found' });

    res.json(order);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET VENDOR ORDERS (WITH FILTER)
====================================================== */
router.get('/orders', authMiddleware, requireVendor, async (req, res) => {
  try {
    const vendor = await getVendor(req);

    if (!vendor) {
      return res.status(403).json({ error: 'Vendor profile not found' });
    }

    const { status } = req.query;

    const filter = {
      'items.vendorId': vendor._id,
    };

    if (status && status !== 'all') {
      filter.status = status;
    }

    const orders = await Order.find(filter)
      .populate('user', 'email')
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(orders);
  } catch {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   UPDATE ORDER STATUS (VENDOR)
====================================================== */
router.patch('/orders/:id/status', authMiddleware, requireVendor, async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ error: 'Invalid order id' });
  }

  try {
    const { status } = req.body;
    const order = await Order.findById(req.params.id);
    const vendor = await getVendor(req);

    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!vendor) return res.status(403).json({ error: 'Vendor profile not found' });

    const isVendor = order.items.some((item) => String(item.vendorId) === String(vendor._id));

    if (!isVendor) {
      return res.status(403).json({ error: 'Not your order' });
    }

    if (order.status === 'Refund Scheduled') {
      return res.status(400).json({
        error: 'Refund already scheduled. Cannot modify.',
      });
    }

    const check = canUpdateStatus(order, status, 'vendor');
    if (!check.ok) return res.status(400).json({ error: check.error });

    /* ======================================================
       SPECIAL RETURN → REFUND FLOW
    ====================================================== */

    if (status === 'Returned') {
      // Step 1: mark returned
      order.status = 'Returned';

      order.statusHistory.push({
        status: 'Returned',
        note: 'Item received back (vendor)',
        date: new Date(),
      });

      // Step 2: schedule refund
      order.status = 'Refund Scheduled';
      order.refundScheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      order.statusHistory.push({
        status: 'Refund Scheduled',
        note: 'Auto refund scheduled in 24h',
        date: new Date(),
      });
    } else {
      order.status = status;

      order.statusHistory.push({
        status,
        note: 'Updated by vendor',
        date: new Date(),
      });
    }

    await order.save();

    res.json({ success: true });
  } catch (err) {
    console.error('Vendor status update error:', err);
    res.status(500).json({ error: 'Update failed' });
  }
});

export default router;
