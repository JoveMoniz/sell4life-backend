// ======================================================
// PUBLIC STATUS ENDPOINTS — no auth required
// ======================================================

import express from 'express';
import { getPlatformConfig } from '../models/platformConfig.js';

const router = express.Router();

/* ======================================================
   GET /api/founding-seller-status
   Public "spots remaining" counter for the Founding Seller program —
   shown on the Sell page and at registration.
====================================================== */
router.get('/founding-seller-status', async (req, res) => {
  try {
    const cfg = await getPlatformConfig();
    const cap = cfg.foundingSeller?.cap ?? 0;
    const claimed = cfg.foundingSeller?.claimed ?? 0;
    res.json({ cap, claimed, remaining: Math.max(0, cap - claimed) });
  } catch (err) {
    console.error('founding-seller-status error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
