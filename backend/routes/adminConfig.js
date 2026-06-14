import express from 'express';
import { getPlatformConfig } from '../models/platformConfig.js';
import PlatformConfig from '../models/platformConfig.js';
import Vendor from '../models/vendor.js';
import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';

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
      Vendor.find({}).select('storeName storeSlug type status commissionOverride').lean(),
      getPlatformConfig(),
    ]);

    const rows = vendors.map(v => {
      const tierRate = cfg.commissionByTier?.[v.type];
      const effective = v.commissionOverride != null
        ? v.commissionOverride
        : tierRate != null
          ? tierRate
          : cfg.commissionDefault;
      return {
        _id:                v._id,
        storeName:          v.storeName,
        storeSlug:          v.storeSlug,
        type:               v.type || 'casual',
        status:             v.status,
        commissionOverride: v.commissionOverride,
        effectiveRate:      effective,
      };
    });

    res.json({ vendors: rows });
  } catch (err) {
    console.error('Config vendors GET error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
