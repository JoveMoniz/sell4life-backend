// ======================================================
// PUBLIC CURRENCY — no auth required. One lightweight call per page load
// tells the frontend which currency to display prices in and what rate
// to convert GBP amounts by.
// ======================================================

import express from 'express';
import { lookupGeo } from '../utils/geoip.js';
import { getDisplayCurrencyInfo } from '../utils/currency.js';

const router = express.Router();

router.get('/me', async (req, res) => {
  try {
    const { country } = lookupGeo(req.ip);
    const info = await getDisplayCurrencyInfo(country);
    res.json({ country, ...info });
  } catch (err) {
    console.error('[currency] /me error:', err);
    res.json({ country: '', currency: 'GBP', rate: 1, symbol: '£' });
  }
});

export default router;
