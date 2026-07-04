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

// ── Parse a CJ field that might be a JSON-serialised array or plain string ──
function parseCjField(val) {
  if (!val) return null;
  if (Array.isArray(val)) return val; // already parsed by JSON.parse upstream
  if (typeof val === 'string') {
    const t = val.trim();
    if (t.startsWith('[') || t.startsWith('{')) {
      try { return JSON.parse(t); } catch (_) {}
    }
    if (t.startsWith('http')) return [t];
  }
  return null;
}

// ── Extract image URLs from a CJ product object ───────
function extractImages(productData) {
  if (!productData) return null;

  // Primary: productImageSet — may be an array of objects OR a JSON-serialised array string
  const rawSet = productData.productImageSet;
  const set = parseCjField(rawSet);
  if (Array.isArray(set) && set.length) {
    const imgs = set.map(img =>
      typeof img === 'string' ? img : (img.imageUrl || img.imageThumbnail || img.url)
    ).filter(Boolean);
    if (imgs.length) return imgs;
  }

  // Other possible array field names (same parse treatment)
  for (const key of ['imageList', 'images', 'gallery', 'productImages', 'imageUrlList']) {
    const parsed = parseCjField(productData[key]);
    if (Array.isArray(parsed) && parsed.length) {
      const imgs = parsed.map(img => typeof img === 'string' ? img : (img.imageUrl || img.url || img.src)).filter(Boolean);
      if (imgs.length) return imgs;
    }
  }

  // productImage may itself be a JSON-serialised array — parse it first
  const mainImgs = parseCjField(productData.productImage);

  // Variant images first, then productImage(s) at the end
  const variants = productData.variantList ?? productData.variants;
  if (Array.isArray(variants) && variants.length) {
    const varImgs = variants.map(v => v.variantImage || v.image || v.imageUrl).filter(Boolean);
    const extra   = Array.isArray(mainImgs) ? mainImgs : (mainImgs ?? []);
    const all     = [...new Set([...varImgs, ...extra].filter(Boolean))];
    if (all.length) return all;
  }

  // Fallback: parsed productImage URLs
  if (Array.isArray(mainImgs) && mainImgs.length) return mainImgs;
  return null;
}

// ── Fetch full product image set from CJ ─────────────
// Strategy: productSku list search → product/detail for gallery → variantList fallback
// Retries automatically on 429 (rate limit) and 5xx transient errors.
export async function getProductImages(vid, productName, credential) {
  const token = await resolveToken(credential);
  if (!token) return { error: 'Could not obtain CJ access token — check credentials in Store Settings' };

  const delay = ms => new Promise(r => setTimeout(r, ms));

  // Fetch with retry on 429 / 5xx (exponential back-off)
  async function cjFetch(url, opts = {}, maxRetries = 2) {
    const headers = { 'CJ-Access-Token': token, ...opts.headers };
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) await delay(1200 * attempt); // 1.2 s, 2.4 s
      try {
        const resp = await fetch(url, { ...opts, headers });
        if ((resp.status === 429 || resp.status >= 500) && attempt < maxRetries) continue;
        return resp;
      } catch (err) {
        if (attempt === maxRetries) throw err;
      }
    }
  }

  async function listSearch(params) {
    const resp = await cjFetch(`${CJ_BASE}/product/list?${new URLSearchParams({ pageNum: 1, pageSize: 5, ...params })}`);
    const data = resp?.ok ? await resp.json() : null;
    return { code: data?.code, total: data?.data?.total, first: data?.data?.list?.[0] };
  }

  // Fetch full gallery from the product detail endpoint.
  // Falls back to /product/query if /product/detail fails.
  async function detailImages(pid) {
    for (const url of [
      `${CJ_BASE}/product/detail?pid=${encodeURIComponent(pid)}`,
      `${CJ_BASE}/product/query?pid=${encodeURIComponent(pid)}`,
    ]) {
      await delay(200);
      const resp = await cjFetch(url);
      const data = resp?.ok ? await resp.json() : null;
      const imgs = data?.code === 200 ? extractImages(data?.data) : null;
      if (imgs?.length) return imgs;
    }
    return null;
  }

  // Try list search with the given params; if found, attempt detail then fall back
  // to whatever images the list result already carries (variantList etc.)
  async function searchAndExtract(params) {
    const r = await listSearch(params);
    if (!r.first) return null;
    if (r.first.pid) {
      const imgs = await detailImages(r.first.pid);
      if (imgs?.length) return imgs;
    }
    return extractImages(r.first); // variantList + productImage fallback
  }

  try {
    // Primary: search by productSku (most precise — exact CJ SKU match)
    const imgs = await searchAndExtract({ productSku: vid });
    if (imgs?.length) return { images: imgs };

    // Secondary: try the base product ID extracted from the VID (handles "CJXXX-color-size" format)
    const basePid = vid.includes('-') ? vid.split('-')[0] : null;
    if (basePid) {
      await delay(200);
      const imgs2 = await searchAndExtract({ productSku: basePid });
      if (imgs2?.length) return { images: imgs2 };
    }

    // Last resort: name search, accepted only if result name substantially overlaps ours
    if (productName) {
      await delay(400);
      const r = await listSearch({ productNameEn: productName });
      if (r.first) {
        const foundName = r.first.productNameEn ?? '';
        const ourWords  = productName.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const overlap   = ourWords.filter(w => foundName.toLowerCase().includes(w)).length;
        const confident = ourWords.length > 0 && overlap >= Math.max(1, Math.round(ourWords.length * 0.4));
        if (confident) {
          const imgs3 = r.first.pid ? await detailImages(r.first.pid) : null;
          const result = imgs3?.length ? imgs3 : extractImages(r.first);
          if (result?.length) return { images: result };
        }
      }
    }

    return { error: 'No images found via CJ API — product may not be in the CJ catalog or credentials need updating' };
  } catch (err) {
    console.error('[cjdropshipping] getProductImages error:', err.message);
    return { error: `CJ API error: ${err.message}` };
  }
}
