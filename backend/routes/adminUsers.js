import express from 'express';
import mongoose from 'mongoose';

import Vendor from '../models/vendor.js';
import User from '../models/user.js';
import Order from '../models/order.js';

import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';
import { mailWelcome, mailSellerInvite } from '../utils/email.js';
import { getPlatformConfig } from '../models/platformConfig.js';
import EmailLog from '../models/emailLog.js';
import { prefixRegex, wordPrefixRegex } from '../utils/searchRegex.js';

const router = express.Router();

const ALLOWED_ROLES = ['user', 'admin'];

/* ======================================================
   GET USERS (ADMIN)
====================================================== */

router.get('/', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { q } = req.query;

    const page = Number(req.query.page) || 1;
    // A search query needs a wider net than plain browsing — otherwise a
    // match can be pushed past the page cutoff by newer non-matching
    // accounts (results are sorted by createdAt, not by search relevance),
    // making it look like search only "kicks in" once enough characters
    // are typed to shrink the match count back under the limit.
    const limit = q ? 100 : 20;
    const skip = (page - 1) * limit;

    const filter = {};

    if (q) {
      filter.$or = [
        { email:    prefixRegex(q) },
        { name:     wordPrefixRegex(q) },
        { username: prefixRegex(q) },
      ];
    }

    // Searching sorts alphabetically (by name) so results are predictable
    // regardless of account age; plain browsing (no query) stays newest-first.
    const usersQuery = User.find(filter)
      .select('email name username role active banned emailVerified phone country defaultShippingAddress lastLogin ordersCount totalSpent createdAt')
      .skip(skip)
      .limit(limit);
    if (q) {
      usersQuery.collation({ locale: 'en', strength: 2 }).sort({ name: 1, email: 1 });
    } else {
      usersQuery.sort({ createdAt: -1 });
    }
    const usersRaw = await usersQuery;

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

/* ======================================================
   BUYER ORDER HISTORY (admin view)
====================================================== */

router.get('/:id/orders', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }

    const user = await User.findById(id).select('email name username banned active role createdAt lastLogin');
    if (!user) return res.status(404).json({ error: 'User not found' });

    const orders = await Order.find({ user: id })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    let totalSpent = 0;
    let totalRefunds = 0;

    const rows = orders.map(order => {
      const ps = (order.paymentStatus || '').toLowerCase();
      const isPaid = ['paid', 'refunded', 'partially_refunded', 'refund_scheduled'].includes(ps);

      const gross = Number(order.total || 0);
      if (isPaid) totalSpent += gross;

      // Per-order refund total
      let refundTotal = 0;
      (order.items || []).forEach(item => {
        const price = Number(item.price || 0);
        if (item.status === 'Cancelled') {
          refundTotal += price * Number(item.quantity || 0);
        } else if (Number(item.refundedQuantity) > 0) {
          refundTotal += Number(item.refundedAmount) || price * Number(item.refundedQuantity);
        } else if (Number(item.returnQuantity) > 0) {
          refundTotal += price * Number(item.returnQuantity);
        }
      });
      if (isPaid) totalRefunds += refundTotal;

      const baseId = order.shortId || String(order._id).slice(0, 10).toUpperCase();
      const displayId = baseId.startsWith('S4L-') ? baseId : `S4L-${baseId}`;

      return {
        _id:           order._id,
        displayId,
        createdAt:     order.createdAt,
        status:        order.status,
        paymentStatus: order.paymentStatus,
        total:         gross,
        refundTotal:   Math.round(refundTotal * 100) / 100,
        itemCount:     (order.items || []).reduce((s, i) => s + Number(i.quantity || 0), 0),
        items: (order.items || []).map(item => ({
          name:       item.name || 'Unknown',
          price:      Number(item.price || 0),
          quantity:   Number(item.quantity || 0),
          status:     item.status || '—',
          vendorId:   item.vendorId,
          vendorName: item.vendorName || '—',
        })),
        shippingAddress: order.shippingAddress || null,
      };
    });

    res.json({
      user: {
        _id:       user._id,
        email:     user.email,
        name:      user.name || '',
        username:  user.username || '',
        banned:    user.banned,
        active:    user.active,
        role:      user.role,
        createdAt: user.createdAt,
        lastLogin: user.lastLogin,
      },
      orders: rows,
      summary: {
        orderCount:   orders.length,
        totalSpent:   Math.round(totalSpent * 100) / 100,
        totalRefunds: Math.round(totalRefunds * 100) / 100,
        netSpent:     Math.round((totalSpent - totalRefunds) * 100) / 100,
      },
    });
  } catch (err) {
    console.error('Admin buyer orders error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   BACKFILL WELCOME + SELLER-INVITE EMAILS (ADMIN, ONE-OFF)
   For users who registered before mailWelcome()/the seller-invite
   worker existed. Sends the welcome email plus an immediate seller
   invite (skipping the normal 2-day delay, since these users are
   already well past it) to every non-vendor, non-admin user who
   hasn't been sent the invite yet — safe to run more than once.
====================================================== */
router.post('/backfill-welcome', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const cfg = await getPlatformConfig();
    const { sellerInviteCountry } = cfg.marketingEmails;

    const users = await User.find({
      role: 'user',
      sellerInviteEmailSentAt: null,
      active: true,
      banned: { $ne: true },
      // Not gated on emailVerified — see sellerInviteWorker.js.
      ...(sellerInviteCountry ? { country: sellerInviteCountry } : {}),
    }).select('email name').lean();

    let welcomed = 0;
    let invited = 0;
    let skippedAlreadyVendor = 0;
    const results = [];

    for (const user of users) {
      const isVendor = await Vendor.exists({ userId: user._id });
      if (isVendor) {
        await User.updateOne({ _id: user._id }, { sellerInviteEmailSentAt: new Date() });
        skippedAlreadyVendor++;
        results.push({ email: user.email, action: 'skipped-already-vendor' });
        continue;
      }

      try {
        await mailWelcome({ to: user.email, name: user.name });
        await EmailLog.create({ type: 'welcome', to: user.email, userId: user._id, userName: user.name });
        welcomed++;
        await mailSellerInvite({ to: user.email, name: user.name });
        await EmailLog.create({ type: 'seller_invite', to: user.email, userId: user._id, userName: user.name });
        invited++;
        await User.updateOne({ _id: user._id }, { sellerInviteEmailSentAt: new Date() });
        results.push({ email: user.email, action: 'sent' });
      } catch (err) {
        results.push({ email: user.email, action: 'failed', error: err.message });
      }
    }

    res.json({ ok: true, totalCandidates: users.length, welcomed, invited, skippedAlreadyVendor, results });
  } catch (err) {
    console.error('Backfill welcome error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   BACKFILL EMAIL LOG (ADMIN, ONE-OFF)
   Users who were already emailed via /backfill-welcome before EmailLog
   existed have no log entries — they only have sellerInviteEmailSentAt.
   Creates synthetic welcome + seller_invite log rows (dated at that
   timestamp) for every user who was actually emailed, so the Marketing
   Emails log shows the complete picture. Skips anyone who already has a
   log entry (so re-running this is harmless) and anyone who's currently
   a vendor (they were "skipped-already-vendor" — never actually emailed).
====================================================== */
router.post('/backfill-email-log', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const candidates = await User.find({
      sellerInviteEmailSentAt: { $ne: null },
    }).select('email name sellerInviteEmailSentAt').lean();

    let created = 0;
    let skippedAlreadyLogged = 0;
    let skippedVendor = 0;

    for (const user of candidates) {
      const alreadyLogged = await EmailLog.exists({ userId: user._id, type: 'welcome' });
      if (alreadyLogged) { skippedAlreadyLogged++; continue; }

      const isVendor = await Vendor.exists({ userId: user._id });
      if (isVendor) { skippedVendor++; continue; }

      const at = user.sellerInviteEmailSentAt;
      // createdAt passed explicitly — Mongoose's timestamps plugin only
      // auto-sets it when absent, so this backdates the log entry to when
      // the email actually went out instead of "now".
      await EmailLog.create([
        { type: 'welcome', to: user.email, userId: user._id, userName: user.name, createdAt: at },
        { type: 'seller_invite', to: user.email, userId: user._id, userName: user.name, createdAt: at },
      ]);
      created += 2;
    }

    res.json({ ok: true, totalCandidates: candidates.length, logEntriesCreated: created, skippedAlreadyLogged, skippedVendor });
  } catch (err) {
    console.error('Backfill email log error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   SEND CUSTOM EMAIL — TARGETED (ADMIN)
   Sends one of the two marketing templates (current saved content) to a
   chosen audience, bypassing the normal automated eligibility checks
   (country, "not already a vendor", delay) — this is a deliberate manual
   send, not the automated welcome/invite flow.
   Body: { template: 'welcome'|'seller_invite', mode: 'individual'|'tier',
           email? (mode=individual), tier? (mode=tier) }
====================================================== */
router.post('/send-custom-email', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { template, mode } = req.body;
    if (!['welcome', 'seller_invite'].includes(template)) {
      return res.status(400).json({ error: 'Invalid template' });
    }
    const mailFn = template === 'welcome' ? mailWelcome : mailSellerInvite;

    let recipients = [];

    if (mode === 'individual') {
      const email = String(req.body.email || '').toLowerCase().trim();
      if (!email) return res.status(400).json({ error: 'Email is required' });
      const user = await User.findOne({ email }).select('email name').lean();
      if (!user) return res.status(404).json({ error: 'No user found with that email' });
      recipients = [user];
    } else if (mode === 'tier') {
      const VALID_TIERS = ['casual', 'refurbished', 'professional', 'enterprise'];
      const tier = req.body.tier;
      if (!VALID_TIERS.includes(tier)) return res.status(400).json({ error: 'Invalid tier' });
      const vendors = await Vendor.find({ type: tier }).select('userId').lean();
      const userIds = vendors.map(v => v.userId).filter(Boolean);
      recipients = await User.find({ _id: { $in: userIds } }).select('email name').lean();
    } else {
      return res.status(400).json({ error: 'Invalid mode' });
    }

    let sent = 0;
    const results = [];
    for (const user of recipients) {
      try {
        await mailFn({ to: user.email, name: user.name });
        await EmailLog.create({ type: template, to: user.email, userId: user._id, userName: user.name });
        sent++;
        results.push({ email: user.email, action: 'sent' });
      } catch (err) {
        results.push({ email: user.email, action: 'failed', error: err.message });
      }
    }

    res.json({ ok: true, totalRecipients: recipients.length, sent, results });
  } catch (err) {
    console.error('Send custom email error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
