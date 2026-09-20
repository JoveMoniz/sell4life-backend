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

// ======================================================
// US ZIP -> CITY/STATE — proxied server-side rather than called directly
// from the buyer's browser (checkout.js), since a browser ad-blocker/
// privacy extension silently blocking an unfamiliar third-party API domain
// is common and was confirmed to break the direct-call version in real
// testing. A server-side fetch has no such risk. Best-effort only — never
// throws, an unmatched/unreachable ZIP just means no autofill.
// ======================================================
router.get('/us-zip-lookup/:zip', async (req, res) => {
  const zip = String(req.params.zip || '').trim();
  if (!/^\d{5}$/.test(zip)) {
    return res.status(400).json({ error: 'Invalid ZIP' });
  }
  try {
    const upstream = await fetch(`https://api.zippopotam.us/us/${zip}`);
    if (!upstream.ok) return res.json({ found: false });
    const data = await upstream.json();
    const place = data?.places?.[0];
    if (!place) return res.json({ found: false });
    res.json({
      found: true,
      city: place['place name'] || '',
      stateCode: place['state abbreviation'] || '',
      stateName: place['state'] || '',
    });
  } catch (err) {
    console.warn('[currency] us-zip-lookup error:', err.message);
    res.json({ found: false });
  }
});

export default router;
