// ======================================================
// CJDROPSHIPPING SHIPPING COST PROVIDER
// First concrete implementation of ShippingCostProvider.
// All CJ-specific logic stays in this file — the shared
// markup engine and registry never import CJ internals.
// ======================================================

import { registerProvider, getCached, setCached, cacheKey } from './registry.js';

const CJ_FREIGHT_URL = 'https://developers.cjdropshipping.com/api2.0/v1/logistic/freightCalculate';

// CJ-specific rate limit: delay between consecutive API calls
const RATE_LIMIT_MS = Number(process.env.CJ_RATE_LIMIT_MS) || 250;
let _lastCall = 0;

async function throttledFetch(token, body) {
  const gap = _lastCall + RATE_LIMIT_MS - Date.now();
  if (gap > 0) await new Promise(r => setTimeout(r, gap));
  _lastCall = Date.now();

  return fetch(CJ_FREIGHT_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'CJ-Access-Token': token },
    body:    JSON.stringify(body),
  });
}

const cjProvider = {
  providerName: 'cjdropshipping',
  displayName:  'CJdropshipping',

  isConfigured(vendor) {
    return !!(vendor.supplierCredentials?.cjdropshipping);
  },

  // input: { supplierVariantRef, destinationCountry, quantity }
  // token: decrypted API token string (passed by the route, never stored here)
  // Returns: { cost, currency, etaDays, raw } | null
  async getShippingCost(input, token) {
    const { supplierVariantRef, destinationCountry = 'GB', quantity = 1 } = input;
    if (!supplierVariantRef || !token) return null;

    const key    = cacheKey('cjdropshipping', supplierVariantRef, destinationCountry);
    const cached = getCached(key);
    if (cached !== undefined) return cached; // null = already tried + failed

    try {
      const resp = await throttledFetch(token, {
        startCountryCode: 'CN',
        endCountryCode:   destinationCountry,
        products:         [{ vid: supplierVariantRef, quantity }],
      });

      if (!resp.ok) {
        // Don't cache HTTP errors (could be transient)
        return null;
      }

      const data    = await resp.json();
      const options = data?.data;

      if (!Array.isArray(options) || !options.length) {
        setCached(key, null); // valid response, just no options — cache as miss
        return null;
      }

      // Default: cheapest available option
      const cheapest = options.reduce((a, b) =>
        (a.logisticPrice ?? Infinity) <= (b.logisticPrice ?? Infinity) ? a : b
      );

      const result = {
        cost:     cheapest.logisticPrice,
        currency: 'USD', // CJ always returns USD
        etaDays:  cheapest.logisticAging ?? null,
        raw:      cheapest,
      };

      setCached(key, result);
      return result;
    } catch (err) {
      // Network / parse error — don't cache, allow retry on next request
      console.error('[cjdropshipping] freight lookup failed:', err.message);
      return null;
    }
  },
};

registerProvider(cjProvider);
export default cjProvider;
