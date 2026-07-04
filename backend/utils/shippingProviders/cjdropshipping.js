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

  // Extract video URLs from a CJ product object
  function extractVideos(productData) {
    if (!productData) return [];
    const raw = productData.productVideo ?? productData.video ?? productData.videoUrl;
    const parsed = parseCjField(raw);
    if (Array.isArray(parsed)) return parsed.filter(v => typeof v === 'string' && v.startsWith('http'));
    if (typeof raw === 'string' && raw.startsWith('http')) return [raw];
    return [];
  }

  // Extract CJ variant data for syncing stock/image back to our DB.
  // Store both vid (CJ internal ID) and variantSku (the human SKU like CJNS...)
  // so the route can match against whichever one our DB variant.sku holds.
  function extractCjVariants(productData) {
    if (!productData) return [];
    const list = productData.variantList ?? productData.variants ?? [];
    return list.map(v => ({
      vid:        String(v.vid        ?? ''),
      variantSku: String(v.variantSku ?? v.vid ?? ''),
      stock:      Number(v.inventoryNum ?? v.variantStock ?? v.variantStockNum ?? v.stock ?? 0),
      image:      v.variantImage ?? v.image ?? '',
      price:      v.variantPrice ?? v.price ?? null,
    })).filter(v => v.vid || v.variantSku);
  }

  // Fetch full product media (images + videos + variant data) from the detail endpoint.
  // Falls back to /product/query if /product/detail fails.
  async function detailMedia(pid) {
    for (const url of [
      `${CJ_BASE}/product/detail?pid=${encodeURIComponent(pid)}`,
      `${CJ_BASE}/product/query?pid=${encodeURIComponent(pid)}`,
    ]) {
      await delay(200);
      const resp = await cjFetch(url);
      const data = resp?.ok ? await resp.json() : null;
      if (data?.code !== 200 || !data?.data) continue;
      // Temporary debug: log video-related fields and first variant keys
      const d = data.data;
      const videoKeys = Object.keys(d).filter(k => /video/i.test(k));
      const firstVariant = (d.variantList ?? d.variants ?? [])[0];
      console.log('[cj-debug] pid=%s videoValue=%j firstVariantSku=%s inventoryNum=%s combineNum=%s inventories=%j',
        pid, d.productVideo,
        firstVariant?.variantSku ?? firstVariant?.vid ?? '?',
        firstVariant?.inventoryNum, firstVariant?.combineNum,
        firstVariant?.inventories?.[0]);
      const imgs = extractImages(data.data);
      if (imgs?.length) {
        const productUrl = data.data.productUrl
          || (pid ? `https://app.cjdropshipping.com/product-detail.html?id=${pid}` : '');
        return {
          images:      imgs,
          videos:      extractVideos(data.data),
          cjVariants:  extractCjVariants(data.data),
          supplier:    'CJdropshipping',
          supplierUrl: productUrl,
        };
      }
    }
    return null;
  }

  // Word-overlap confidence between two product names.
  // threshold: fraction of our significant words that must appear in foundName.
  // productSku validation uses 0.7 (strict); name-search fallback uses 0.4 (lenient).
  function nameConfident(foundName, ourName, threshold = 0.4) {
    if (!ourName || !foundName) return false;
    const ourWords = ourName.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    if (!ourWords.length) return false;
    const overlap  = ourWords.filter(w => foundName.toLowerCase().includes(w)).length;
    return overlap >= Math.max(1, Math.round(ourWords.length * threshold));
  }

  // Try list search with the given params; if found, attempt detail then fall back
  // to whatever images the list result already carries (variantList etc.)
  // For productSku searches, validates the result is the right product via:
  //   1. variant vid match (if variantList is present)
  //   2. product name overlap (fallback when variantList is empty)
  async function searchAndExtract(params) {
    const r = await listSearch(params);
    if (!r.first) return null;

    if (params.productSku) {
      const needle   = params.productSku.toLowerCase();
      const variants = r.first.variantList ?? [];
      let confirmed  = false;

      if (variants.length > 0) {
        confirmed = variants.some(v => {
          const vVid = (v.vid ?? v.variantSku ?? '').toLowerCase();
          return vVid && (vVid === needle || vVid.startsWith(needle) || needle.startsWith(vVid));
        });
      }

      // Variant list was empty or none matched — fall back to name similarity.
      // Use strict threshold (0.7) here: a productSku result with only generic
      // word overlap like "Fashion" + "Women" must not be treated as a match.
      if (!confirmed) {
        confirmed = nameConfident(r.first.productNameEn, productName, 0.7);
      }

      if (!confirmed) return null; // wrong product, reject
    }

    if (r.first.pid) {
      const media = await detailMedia(r.first.pid);
      if (media?.images?.length) return media;
    }
    // List-level fallback: extract images + variant data (no video available here)
    const imgs = extractImages(r.first);
    return imgs?.length ? { images: imgs, videos: [], cjVariants: extractCjVariants(r.first) } : null;
  }

  try {
    // Primary: search by productSku (most precise — exact CJ SKU match)
    const media = await searchAndExtract({ productSku: vid });
    if (media?.images?.length) return media;

    // Secondary: try the base product ID (handles "CJXXX-color-size" format)
    const basePid = vid.includes('-') ? vid.split('-')[0] : null;
    if (basePid) {
      await delay(200);
      const media2 = await searchAndExtract({ productSku: basePid });
      if (media2?.images?.length) return media2;
    }

    // Last resort: name search, accepted only if result name substantially overlaps ours
    if (productName) {
      await delay(400);
      const r = await listSearch({ productNameEn: productName });
      if (r.first) {
        if (nameConfident(r.first.productNameEn, productName, 0.4)) {
          const media3 = r.first.pid ? await detailMedia(r.first.pid) : null;
          if (media3?.images?.length) return media3;
          const imgs = extractImages(r.first);
          if (imgs?.length) return { images: imgs, videos: [], cjVariants: extractCjVariants(r.first) };
        }
      }
    }

    return { error: 'No images found via CJ API — product may not be in the CJ catalog or credentials need updating' };
  } catch (err) {
    console.error('[cjdropshipping] getProductImages error:', err.message);
    return { error: `CJ API error: ${err.message}` };
  }
}
