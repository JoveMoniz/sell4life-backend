import express from 'express';
import mongoose from 'mongoose';

import Vendor from '../models/vendor.js';
import User from '../models/user.js';
import Order from '../models/order.js';

import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';

const router = express.Router();

const ALLOWED_ROLES = ['user', 'admin'];

/* ======================================================
   GET USERS (ADMIN)
====================================================== */

router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { q } = req.query;

    const page = Number(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    const filter = {};

    if (q) {
      filter.email = { $regex: q, $options: 'i' };
    }

    const usersRaw = await User.find(filter)
      .select('email name username role active banned emailVerified phone country defaultShippingAddress lastLogin ordersCount totalSpent createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const userIds = usersRaw.map(u => u._id);

    // Live order stats — one aggregation for all users
    const orderStats = await Order.aggregate([
      { $match: { user: { $in: userIds } } },
      { $group: { _id: '$user', orderCount: { $sum: 1 }, totalSpent: { $sum: '$total' } } },
    ]);
    const statsMap = {};
    orderStats.forEach(s => { statsMap[String(s._id)] = s; });

    // Vendor info for vendor users
    const vendors = await Vendor.find({ userId: { $in: userIds } })
      .select('userId storeName storeSlug status type verified featured')
      .lean();
    const vendorMap = {};
    vendors.forEach(v => { vendorMap[String(v.userId)] = v; });

    const users = usersRaw.map(user => {
      const vendor = vendorMap[String(user._id)];
      const stats  = statsMap[String(user._id)];
      const isVendor = !!vendor;

      let accountType = 'User';
      if (user.role === 'admin') accountType = 'Admin';
      else if (isVendor) accountType = 'Vendor';

      return {
        _id: user._id,
        email: user.email,
        name: user.name,
        username: user.username,
        role: user.role,
        accountType,
        active: user.active,
        banned: user.banned,
        emailVerified: user.emailVerified,
        phone: user.phone || null,
        country: user.country || null,
        defaultShippingAddress: user.defaultShippingAddress || null,
        lastLogin: user.lastLogin || null,
        orderCount: stats?.orderCount || 0,
        totalSpent: Number((stats?.totalSpent || 0).toFixed(2)),
        createdAt: user.createdAt,
        vendor: vendor ? {
          storeName: vendor.storeName,
          storeSlug: vendor.storeSlug,
          status:    vendor.status,
          type:      vendor.type,
          verified:  vendor.verified,
          featured:  vendor.featured,
        } : null,
      };
    });

    const total = await User.countDocuments(filter);

    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('ADMIN USERS ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   UPDATE USER ROLE (ADMIN)
====================================================== */

router.patch('/:id/role', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { role } = req.body;

    const normalizedRole = String(role || '').trim().toLowerCase();

    if (!ALLOWED_ROLES.includes(normalizedRole)) {
      return res.status(400).json({ error: 'Invalid role' });
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const targetUser = await User.findById(req.params.id);

    if (!targetUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (targetUser.role === 'vendor' && normalizedRole === 'admin') {
      return res.status(403).json({ error: 'Vendor accounts cannot become admin' });
    }

    if (targetUser.role === 'admin' && normalizedRole === 'vendor') {
      return res.status(403).json({ error: 'Admin accounts cannot become vendor' });
    }

    const ownerId = process.env.OWNER_USER_ID;

    if (ownerId && String(targetUser._id) === String(ownerId) && normalizedRole !== 'admin') {
      return res.status(403).json({ error: 'Owner role cannot be changed' });
    }

    if (normalizedRole === 'admin' && !req.isOwner) {
      return res.status(403).json({ error: 'Only the site owner can assign admin role' });
    }

    if (String(targetUser._id) === String(req.user._id) && normalizedRole !== 'admin') {
      return res.status(400).json({ error: 'You cannot remove your own admin role' });
    }

    if (targetUser.role === 'admin' && normalizedRole !== 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot remove the last admin account' });
      }
    }

    targetUser.role = normalizedRole;
    await targetUser.save();

    res.json({
      success: true,
      userId: targetUser._id,
      role: targetUser.role,
      requiresReauth: String(targetUser._id) === String(req.user._id),
    });
  } catch (err) {
    console.error('ADMIN ROLE UPDATE ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   BAN USER
====================================================== */

router.patch('/:id/ban', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    if (String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({ error: 'You cannot ban yourself' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.role === 'admin') {
      return res.status(403).json({ error: 'Cannot ban admin accounts' });
    }

    user.banned = true;
    user.active = false;
    await user.save();

    res.json({ success: true, userId: user._id, banned: true });
  } catch (err) {
    console.error('ADMIN BAN ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   UNBAN USER
====================================================== */

router.patch('/:id/unban', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({ error: 'Invalid user id' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    user.banned = false;
    user.active = true;
    await user.save();

    res.json({ success: true, userId: user._id, banned: false });
  } catch (err) {
    console.error('ADMIN UNBAN ERROR:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
