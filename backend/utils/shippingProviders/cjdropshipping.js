// ======================================================
// CJDROPSHIPPING SHIPPING COST PROVIDER
// First concrete implementation of ShippingCostProvider.
// All CJ-specific logic stays in this file — the shared
// markup engine and registry never import CJ internals.
// ======================================================

import { registerProvider, getCached, setCached, cacheKey } from './registry.js';

const CJ_BASE        = 'https://developers.cjdropshipping.com/api2.0/v1';
const CJ_AUTH_URL    = `${CJ_BASE}/authentication/getAccessToken`;
const CJ_FREIGHT_URL = `${CJ_BASE}/logistic/freightCalculate`;

// CJ rate limit: 1 request/second max. Default 1100ms gives a small buffer.
const RATE_LIMIT_MS = Number(process.env.CJ_RATE_LIMIT_MS) || 1100;
let _lastCall = 0;

// In-process access token cache (CJ tokens last ~15 days)
let _accessToken   = null;
let _tokenExpireAt = 0;

async function getAccessToken(email, apiKey) {
  if (_accessToken && Date.now() < _tokenExpireAt) return _accessToken;

  const resp = await fetch(CJ_AUTH_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ email, password: apiKey }),
  });
  if (!resp.ok) {
    console.warn('[cjdropshipping] auth HTTP %s', resp.status);
    return null;
  }
  const data = await resp.json();
  if (data?.code !== 200 || !data?.data?.accessToken) {
    console.warn('[cjdropshipping] auth failed: code=%s msg=%s', data?.code, data?.message);
    return null;
  }
  _accessToken = data.data.accessToken;
  const expiry = data.data.accessTokenExpiryDate
    ? new Date(data.data.accessTokenExpiryDate).getTime()
    : Date.now() + 14 * 24 * 60 * 60 * 1000;
  _tokenExpireAt = expiry - 5 * 60 * 1000; // 5-min buffer before true expiry
  console.log('[cjdropshipping] access token obtained, valid until ~%s', new Date(_tokenExpireAt).toISOString());
  return _accessToken;
}

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

  // Fields shown in Store Settings → Connect Supplier
  credentialSchema: [
    { key: 'email',  label: 'CJ Account Email', type: 'email',    placeholder: 'your-cj-account@email.com' },
    { key: 'apiKey', label: 'CJ API Key',        type: 'password', placeholder: 'API key from CJ Developer Center' },
  ],

  isConfigured(vendor) {
    return !!(vendor.supplierCredentials?.cjdropshipping);
  },

  // credential: decrypted string — either JSON { email, apiKey } or raw access token (legacy)
  // Returns: { cost, currency, etaDays, raw } | null
  async getShippingCost(input, credential) {
    const { supplierVariantRef, destinationCountry = 'GB', quantity = 1 } = input;
    if (!supplierVariantRef || !credential) {
      console.warn('[cjdropshipping] skipped — supplierVariantRef=%s hasCredential=%s', supplierVariantRef, !!credential);
      return null;
    }

    // Resolve access token — support both { email, apiKey } JSON and raw token string
    let accessToken = credential;
    try {
      const creds = JSON.parse(credential);
      if (creds?.email && creds?.apiKey) {
        accessToken = await getAccessToken(creds.email, creds.apiKey);
        if (!accessToken) {
          console.warn('[cjdropshipping] could not obtain access token from credentials');
          return null;
        }
      }
    } catch (_) {
      // Not JSON — use as raw access token (legacy single-token format)
    }

    const key    = cacheKey('cjdropshipping', supplierVariantRef, destinationCountry);
    const cached = getCached(key);
    if (cached !== undefined) return cached; // null = already tried + failed

    try {
      const resp = await throttledFetch(accessToken, {
        startCountryCode: 'CN',
        endCountryCode:   destinationCountry,
        products:         [{ vid: supplierVariantRef, quantity }],
      });

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        console.warn('[cjdropshipping] HTTP %s for vid=%s: code=%s msg=%s',
          resp.status, supplierVariantRef, errBody?.code, errBody?.message);
        // 401 = token expired — clear cache so next call re-fetches
        if (resp.status === 401) { _accessToken = null; _tokenExpireAt = 0; }
        return null;
      }

      const data    = await resp.json();
      const options = data?.data;

      if (!Array.isArray(options) || !options.length) {
        console.warn('[cjdropshipping] no freight options for vid=%s dest=%s code=%s msg=%s',
          supplierVariantRef, destinationCountry, data?.code, data?.message);
        setCached(key, null);
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

// ── Resolve credential string → access token ──────────
async function resolveToken(credential) {
  try {
    const creds = JSON.parse(credential);
    if (creds?.email && creds?.apiKey) return getAccessToken(creds.email, creds.apiKey);
  } catch (_) {}
  return credential; // raw token (legacy)
}

// ── Fetch full product image set by variant ID ─────────
export async function getProductImages(vid, credential) {
  const token = await resolveToken(credential);
  if (!token) return null;

  try {
    // Step 1: variant ID → product ID
    const varResp = await fetch(
      `${CJ_BASE}/product/variant/query?vid=${encodeURIComponent(vid)}`,
      { headers: { 'CJ-Access-Token': token } }
    );
    if (!varResp.ok) return null;
    const varData = await varResp.json();
    if (varData?.code !== 200) {
      console.warn('[cjdropshipping] variant query failed: code=%s msg=%s', varData?.code, varData?.message);
      return null;
    }
    const pid = varData?.data?.productId;
    if (!pid) return null;

    // Step 2: product ID → full image set
    const prodResp = await fetch(
      `${CJ_BASE}/product/query?pid=${encodeURIComponent(pid)}`,
      { headers: { 'CJ-Access-Token': token } }
    );
    if (!prodResp.ok) return null;
    const prodData = await prodResp.json();
    if (prodData?.code !== 200) {
      console.warn('[cjdropshipping] product query failed: code=%s msg=%s', prodData?.code, prodData?.message);
      return null;
    }

    const imageSet = prodData?.data?.productImageSet;
    if (Array.isArray(imageSet) && imageSet.length) {
      return imageSet.map(img => img.imageUrl || img.imageThumbnail).filter(Boolean);
    }
    return null;
  } catch (err) {
    console.error('[cjdropshipping] getProductImages error:', err.message);
    return null;
  }
}
