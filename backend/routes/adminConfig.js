import express from 'express';
import { getPlatformConfig } from '../models/platformConfig.js';
import PlatformConfig from '../models/platformConfig.js';
import Vendor from '../models/vendor.js';
import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';
import { getFoundingSellerStatus } from '../utils/vendorBalance.js';
import User from '../models/user.js';
import EmailLog from '../models/emailLog.js';

const router = express.Router();
router.use(authMiddleware);
router.use(adminMiddleware);

const TIERS = ['casual', 'refurbished', 'professional', 'enterprise'];

/* ======================================================
   GET /api/admin/config/fees  — read current fee config
====================================================== */
router.get('/fees', async (req, res) => {
  try {
    const cfg = await getPlatformConfig();
    res.json({ config: cfg });
  } catch (err) {
    console.error('Config GET error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   PUT /api/admin/config/fees  — update platform fee config
   Body: { commissionDefault, commissionByTier, reserveRateStandard,
           reserveRateTrusted, reserveTrustedMonths }
====================================================== */
router.put('/fees', async (req, res) => {
  try {
    const {
      commissionDefault,
      commissionByTier = {},
      reserveRateStandard,
      reserveRateTrusted,
      reserveTrustedMonths,
    } = req.body;

    const current = await getPlatformConfig();
    const now = new Date();
    const update = {};

    if (commissionDefault != null) {
      const v = Number(commissionDefault);
      if (isNaN(v) || v < 0 || v > 1) return res.status(400).json({ error: 'Invalid commissionDefault' });
      update.commissionDefault = v;
      if (v !== Number(current.commissionDefault)) update.commissionDefaultSetAt = now;
    }

    for (const tier of TIERS) {
      if (commissionByTier[tier] !== undefined) {
        const raw = commissionByTier[tier];
        let v;
        if (raw === null || raw === '') {
          v = null;
        } else {
          v = Number(raw);
          if (isNaN(v) || v < 0 || v > 1) return res.status(400).json({ error: `Invalid rate for ${tier}` });
        }
        update[`commissionByTier.${tier}`] = v;
        const currentTierRate = current.commissionByTier?.[tier] ?? null;
        if (v !== currentTierRate) update[`commissionByTierSetAt.${tier}`] = now;
      }
    }

    if (reserveRateStandard != null) {
      const v = Number(reserveRateStandard);
      if (isNaN(v) || v < 0 || v > 1) return res.status(400).json({ error: 'Invalid reserveRateStandard' });
      update.reserveRateStandard = v;
      if (v !== Number(current.reserveRateStandard)) update.reserveRateStandardSetAt = now;
    }
    if (reserveRateTrusted != null) {
      const v = Number(reserveRateTrusted);
      if (isNaN(v) || v < 0 || v > 1) return res.status(400).json({ error: 'Invalid reserveRateTrusted' });
      update.reserveRateTrusted = v;
      if (v !== Number(current.reserveRateTrusted)) update.reserveRateTrustedSetAt = now;
    }
    if (reserveTrustedMonths != null) {
      const v = Number(reserveTrustedMonths);
      if (isNaN(v) || v < 0) return res.status(400).json({ error: 'Invalid reserveTrustedMonths' });
      update.reserveTrustedMonths = v;
    }

    const cfg = await PlatformConfig.findOneAndUpdate(
      { _key: 'global' },
      { $set: update },
      { upsert: true, new: true }
    );

    res.json({ ok: true, config: cfg });
  } catch (err) {
    console.error('Config PUT error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   PUT /api/admin/config/vendor/:id/commission
   Body: { commissionOverride }  (null to remove override)
====================================================== */
router.put('/vendor/:id/commission', async (req, res) => {
  try {
    const { id } = req.params;
    const { commissionOverride } = req.body;

    let override = null;
    if (commissionOverride !== null && commissionOverride !== '' && commissionOverride !== undefined) {
      override = Number(commissionOverride);
      if (isNaN(override) || override < 0 || override > 1) {
        return res.status(400).json({ error: 'Invalid commissionOverride (must be 0–1)' });
      }
    }

    const vendor = await Vendor.findByIdAndUpdate(
      id,
      { $set: {
        commissionOverride: override,
        commissionOverrideSetAt: override != null ? new Date() : null,
      }},
      { new: true }
    ).select('storeName storeSlug type commissionOverride commissionOverrideSetAt');

    if (!vendor) return res.status(404).json({ error: 'Vendor not found' });

    res.json({ ok: true, vendor });
  } catch (err) {
    console.error('Vendor commission PUT error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET /api/admin/config/vendors  — list all vendors with their rates
====================================================== */
router.get('/vendors', async (req, res) => {
  try {
    const [vendors, cfg] = await Promise.all([
      Vendor.find({}).select('storeName storeSlug type status commissionOverride foundingSeller').lean(),
      getPlatformConfig(),
    ]);

    // Only enrolled Founding Sellers need their real status — cheap in
    // practice since there are at most `foundingSeller.cap` of them.
    const foundingVendors = vendors.filter(v => v.foundingSeller?.enrolled);
    const statuses = await Promise.all(
      foundingVendors.map(v => getFoundingSellerStatus(v))
    );
    const statusById = {};
    foundingVendors.forEach((v, i) => { statusById[String(v._id)] = statuses[i]; });

    const rows = vendors.map(v => {
      const tierRate = cfg.commissionByTier?.[v.type];
      const normalEffective = v.commissionOverride != null
        ? v.commissionOverride
        : tierRate != null
          ? tierRate
          : cfg.commissionDefault;
      const founding = statusById[String(v._id)] || null;
      // While a Founding Seller's free window is still active, what they're
      // actually being charged right now is their own snapshotted founding
      // rate — showing the normal tier rate here would misrepresent it.
      const effective = founding?.active ? founding.rate : normalEffective;
      return {
        _id:                v._id,
        storeName:          v.storeName,
        storeSlug:          v.storeSlug,
        type:               v.type || 'casual',
        status:             v.status,
        commissionOverride: v.commissionOverride,
        effectiveRate:      effective,
        normalEffectiveRate: normalEffective,
        foundingSeller: founding
          ? {
              enrolled:       true,
              active:         founding.active,
              joinedAt:       v.foundingSeller.joinedAt,
              freeSalesLimit: founding.limit,
              freeSalesUsed:  founding.used,
              freeSalesRemaining: founding.remaining,
              rate:           founding.rate,
            }
          : null,
      };
    });

    res.json({ vendors: rows });
  } catch (err) {
    console.error('Config vendors GET error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET /api/admin/config/founding-seller
====================================================== */
router.get('/founding-seller', async (_req, res) => {
  try {
    const cfg = await getPlatformConfig();
    res.json({ foundingSeller: cfg.foundingSeller || {} });
  } catch (err) {
    console.error('Founding seller config GET error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   PUT /api/admin/config/founding-seller
   Body: { cap, rate, freeSalesByTier: { casual, refurbished, professional, enterprise } }
   Note: `claimed` is never settable here — it's an atomic counter only
   ever incremented at vendor signup. `cap` and `rate` are snapshotted onto
   each vendor at signup, so changing either here (e.g. raising the cap or
   lowering the discount for a "wave 2") only affects new signups from that
   point on — already-enrolled sellers keep whatever they joined under.
====================================================== */
router.put('/founding-seller', async (req, res) => {
  try {
    const { cap, rate, freeSalesByTier = {} } = req.body;
    const update = {};

    if (cap != null) {
      const v = Number(cap);
      if (isNaN(v) || v < 0) return res.status(400).json({ error: 'Invalid cap' });
      update['foundingSeller.cap'] = v;
    }

    if (rate != null) {
      const v = Number(rate);
      if (isNaN(v) || v < 0 || v > 1) return res.status(400).json({ error: 'Invalid rate' });
      update['foundingSeller.rate'] = v;
    }

    for (const tier of TIERS) {
      if (freeSalesByTier[tier] !== undefined) {
        const v = Number(freeSalesByTier[tier]);
        if (isNaN(v) || v < 0) return res.status(400).json({ error: `Invalid free-sales limit for ${tier}` });
        update[`foundingSeller.freeSalesByTier.${tier}`] = v;
      }
    }

    const cfg = await PlatformConfig.findOneAndUpdate(
      { _key: 'global' },
      { $set: update },
      { upsert: true, new: true }
    );

    res.json({ ok: true, foundingSeller: cfg.foundingSeller });
  } catch (err) {
    console.error('Founding seller config PUT error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET /api/admin/config/marketing-emails
====================================================== */
router.get('/marketing-emails', async (_req, res) => {
  try {
    const cfg = await getPlatformConfig();
    res.json({ marketingEmails: cfg.marketingEmails });
  } catch (err) {
    console.error('Marketing emails config GET error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   PUT /api/admin/config/marketing-emails
   Body: { sellerInviteEnabled, sellerInviteDelayDays, sellerInviteCountry }
   sellerInviteCountry: '' clears the restriction (all countries).
====================================================== */
router.put('/marketing-emails', async (req, res) => {
  try {
    const { sellerInviteEnabled, sellerInviteDelayDays, sellerInviteCountry } = req.body;
    const update = {};

    if (sellerInviteEnabled !== undefined) {
      update['marketingEmails.sellerInviteEnabled'] = !!sellerInviteEnabled;
    }
    if (sellerInviteDelayDays !== undefined) {
      const v = Number(sellerInviteDelayDays);
      if (isNaN(v) || v < 0) return res.status(400).json({ error: 'Invalid sellerInviteDelayDays' });
      update['marketingEmails.sellerInviteDelayDays'] = v;
    }
    if (sellerInviteCountry !== undefined) {
      update['marketingEmails.sellerInviteCountry'] = String(sellerInviteCountry).trim().toUpperCase();
    }

    const cfg = await PlatformConfig.findOneAndUpdate(
      { _key: 'global' },
      { $set: update },
      { upsert: true, new: true }
    );

    res.json({ ok: true, marketingEmails: cfg.marketingEmails });
  } catch (err) {
    console.error('Marketing emails config PUT error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET /api/admin/config/marketing-emails/stats
====================================================== */
router.get('/marketing-emails/stats', async (_req, res) => {
  try {
    const cfg = await getPlatformConfig();
    const { sellerInviteDelayDays, sellerInviteCountry } = cfg.marketingEmails;
    const cutoff = new Date(Date.now() - sellerInviteDelayDays * 24 * 60 * 60 * 1000);
    const countryFilter = sellerInviteCountry ? { country: sellerInviteCountry } : {};

    const [totalUsers, eligibleCountryUsers, invited, pending, totalWelcomeSent, totalInviteSent] = await Promise.all([
      User.countDocuments({ role: 'user' }),
      User.countDocuments({ role: 'user', ...countryFilter }),
      User.countDocuments({ role: 'user', sellerInviteEmailSentAt: { $ne: null }, ...countryFilter }),
      User.countDocuments({ role: 'user', sellerInviteEmailSentAt: null, active: true, banned: { $ne: true }, createdAt: { $lte: cutoff }, ...countryFilter }),
      EmailLog.countDocuments({ type: 'welcome' }),
      EmailLog.countDocuments({ type: 'seller_invite' }),
    ]);

    res.json({ totalUsers, eligibleCountryUsers, invited, pending, totalWelcomeSent, totalInviteSent });
  } catch (err) {
    console.error('Marketing emails stats error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET /api/admin/config/marketing-emails/log
   Recent sends, newest first. ?limit= (default 100, max 500)
====================================================== */
router.get('/marketing-emails/log', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);
    const logs = await EmailLog.find({})
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('type to userName createdAt')
      .lean();
    res.json({ logs });
  } catch (err) {
    console.error('Marketing emails log error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET /api/admin/config/reviews
====================================================== */
router.get('/reviews', async (_req, res) => {
  try {
    const cfg = await getPlatformConfig();
    res.json({
      reviewsEnabled:  cfg.reviewsEnabled ?? false,
      reviewsMinCount: cfg.reviewsMinCount ?? 3,
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   PUT /api/admin/config/reviews
   Body: { reviewsEnabled, reviewsMinCount }
====================================================== */
router.put('/reviews', async (req, res) => {
  try {
    const { reviewsEnabled, reviewsMinCount } = req.body;
    const update = {};

    if (reviewsEnabled !== undefined) update.reviewsEnabled = Boolean(reviewsEnabled);

    if (reviewsMinCount !== undefined) {
      const v = Number(reviewsMinCount);
      if (isNaN(v) || v < 1) return res.status(400).json({ error: 'reviewsMinCount must be >= 1' });
      update.reviewsMinCount = v;
    }

    const cfg = await PlatformConfig.findOneAndUpdate(
      { _key: 'global' },
      { $set: update },
      { upsert: true, new: true }
    );

    res.json({ ok: true, reviewsEnabled: cfg.reviewsEnabled, reviewsMinCount: cfg.reviewsMinCount });
  } catch (err) {
    console.error('Reviews config PUT error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET /api/admin/config/eu-selling
====================================================== */
router.get('/eu-selling', async (_req, res) => {
  try {
    const cfg = await getPlatformConfig();
    res.json({ euSellingEnabled: cfg.euSellingEnabled ?? false });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   PUT /api/admin/config/eu-selling
   Body: { euSellingEnabled }
====================================================== */
router.put('/eu-selling', async (req, res) => {
  try {
    const { euSellingEnabled } = req.body;
    if (euSellingEnabled === undefined) {
      return res.status(400).json({ error: 'euSellingEnabled is required' });
    }
    const cfg = await PlatformConfig.findOneAndUpdate(
      { _key: 'global' },
      { $set: { euSellingEnabled: Boolean(euSellingEnabled) } },
      { upsert: true, new: true }
    );
    res.json({ ok: true, euSellingEnabled: cfg.euSellingEnabled });
  } catch (err) {
    console.error('EU selling config PUT error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
