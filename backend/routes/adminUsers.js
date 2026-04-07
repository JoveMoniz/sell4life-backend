import express from 'express';
import mongoose from 'mongoose';

import User from '../models/user.js';

import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';

const router = express.Router();

/* ======================================================
   ROLE CONSTANTS
====================================================== */

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

    /* ========================================
       SEARCH BY EMAIL
    ======================================== */

    if (q) {
      filter.email = {
        $regex: q,
        $options: 'i',
      };
    }

    /* ========================================
       FETCH USERS
    ======================================== */

    const users = await User.find(filter)
      .select('email role createdAt')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

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

    res.status(500).json({
      error: 'Server error',
    });
  }
});

/* ======================================================
   UPDATE USER ROLE (ADMIN)
====================================================== */

router.patch('/:id/role', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { role } = req.body;

    if (!ALLOWED_ROLES.includes(role)) {
      return res.status(400).json({
        error: 'Invalid role',
      });
    }

    /* ========================================
         VALIDATE USER ID
      ======================================== */

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        error: 'Invalid user id',
      });
    }

    const targetUser = await User.findById(req.params.id);

    if (!targetUser) {
      return res.status(404).json({
        error: 'User not found',
      });
    }

    /* ========================================
         OWNER PROTECTION
      ======================================== */

    const ownerId = process.env.OWNER_USER_ID;

    if (ownerId && String(targetUser._id) === String(ownerId) && role !== 'admin') {
      return res.status(403).json({
        error: 'Owner role cannot be changed',
      });
    }

    /* ========================================
         ADMIN PROMOTION RULE
      ======================================== */

    if (role === 'admin' && !req.isOwner) {
      return res.status(403).json({
        error: 'Only the site owner can assign admin role',
      });
    }

    /* ========================================
         PREVENT SELF LOCKOUT
      ======================================== */

    if (String(targetUser._id) === String(req.user._id) && role !== 'admin') {
      return res.status(400).json({
        error: 'You cannot remove your own admin role',
      });
    }

    /* ========================================
         UPDATE ROLE
      ======================================== */

    targetUser.role = role;

    await targetUser.save();

    res.json({
      success: true,
      userId: targetUser._id,
      role: targetUser.role,
    });
  } catch (err) {
    console.error('ADMIN ROLE UPDATE ERROR:', err);

    res.status(500).json({
      error: 'Server error',
    });
  }
});

export default router;
