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

// Per-vendor access token cache, keyed by CJ account email (CJ tokens last
// ~15 days). MUST be keyed per-vendor — a single shared token would route
// every vendor's shipping quotes and CJ auto-orders through whichever
// vendor's credentials happened to authenticate first.
const _tokenCache = new Map(); // email -> { accessToken, expireAt }

async function getAccessToken(email, apiKey) {
  const cached = _tokenCache.get(email);
  if (cached && Date.now() < cached.expireAt) return cached.accessToken;

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
  const accessToken = data.data.accessToken;
  const expiry = data.data.accessTokenExpiryDate
    ? new Date(data.data.accessTokenExpiryDate).getTime()
    : Date.now() + 14 * 24 * 60 * 60 * 1000;
  const expireAt = expiry - 5 * 60 * 1000; // 5-min buffer before true expiry
  _tokenCache.set(email, { accessToken, expireAt });
  console.log('[cjdropshipping] access token obtained for %s, valid until ~%s', email, new Date(expireAt).toISOString());
  return accessToken;
}

// Clears a single vendor's cached token (e.g. after a 401) without
// affecting any other vendor's cache entry.
function invalidateToken(credential) {
  try {
    const creds = JSON.parse(credential);
    if (creds?.email) _tokenCache.delete(creds.email);
  } catch (_) { /* raw legacy token — nothing cached under an email to clear */ }
}

async function throttledPost(url, token, body, extraHeaders = {}) {
  const gap = _lastCall + RATE_LIMIT_MS - Date.now();
  if (gap > 0) await new Promise(r => setTimeout(r, gap));
  _lastCall = Date.now();

  return fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'CJ-Access-Token': token, ...extraHeaders },
    body:    JSON.stringify(body),
  });
}

async function throttledFetch(token, body) {
  return throttledPost(CJ_FREIGHT_URL, token, body);
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
        // 401 = token expired — clear this vendor's cached token so the next call re-fetches
        if (resp.status === 401) invalidateToken(credential);
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

  // Auto-creates the matching order on CJ's side when a buyer pays — unpaid
  // (payType "3"), so the vendor just has to go pay for it in the CJ
  // dashboard instead of re-entering it by hand.
  // input: { orderNumber, vid, quantity, destinationCountry, address: { name, phone, address1, address2, city, county, postcode } }
  // Returns: { orderId, orderNumber, status } | { error }
  async createOrder(input, credential) {
    const { orderNumber, vid, quantity = 1, destinationCountry = 'GB', address } = input;
    if (!orderNumber || !vid || !address) return { error: 'Missing orderNumber, vid, or address' };

    const accessToken = await resolveToken(credential);
    if (!accessToken) return { error: 'Could not obtain CJ access token' };

    // Need a valid logisticName for this destination — reuse the same
    // cheapest-option lookup used for the shipping quote.
    let logisticName;
    try {
      const freightResp = await throttledFetch(accessToken, {
        startCountryCode: 'CN',
        endCountryCode:   destinationCountry,
        products:         [{ vid, quantity }],
      });
      const freightData = await freightResp.json().catch(() => ({}));
      const options = freightData?.data;
      if (Array.isArray(options) && options.length) {
        const cheapest = options.reduce((a, b) =>
          (a.logisticPrice ?? Infinity) <= (b.logisticPrice ?? Infinity) ? a : b
        );
        logisticName = cheapest.logisticName;
      }
    } catch (err) {
      console.warn('[cjdropshipping] logistics lookup for order failed:', err.message);
    }
    if (!logisticName) return { error: 'No shipping option available for this destination' };

    const body = {
      orderNumber,
      payType: '3', // create only — no payment initiated, paid manually in CJ dashboard
      platform: 'Api',
      fromCountryCode: 'CN',
      logisticName,
      shippingCountryCode: destinationCountry,
      shippingCountry:     address.country || 'United Kingdom',
      shippingProvince:    address.county || address.city || '',
      shippingCity:        address.city || '',
      shippingCustomerName: address.name || '',
      shippingAddress:      address.address1 || '',
      shippingAddress2:     address.address2 || '',
      shippingPhone:        address.phone || '',
      shippingZip:          address.postcode || '',
      products: [{ vid, quantity }],
    };

    try {
      const resp = await throttledPost(
        `${CJ_BASE}/shopping/order/createOrderV2`,
        accessToken,
        body,
        { platformToken: accessToken }
      );
      const data = await resp.json().catch(() => ({}));

      if (!resp.ok || data?.code !== 200 || !data?.data) {
        if (resp.status === 401) invalidateToken(credential);
        return { error: data?.message || `CJ order creation failed (HTTP ${resp.status})` };
      }

      return {
        orderId:     data.data.orderId,
        orderNumber: data.data.orderNumber,
        status:      data.data.orderStatus || 'CREATED',
      };
    } catch (err) {
      console.error('[cjdropshipping] createOrder failed:', err.message);
      return { error: err.message };
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
    const imgs = [...new Set(set.map(img =>
      typeof img === 'string' ? img : (img.imageUrl || img.imageThumbnail || img.url)
    ).filter(Boolean))];
    if (imgs.length) return imgs;
  }

  // Other possible array field names (same parse treatment)
  for (const key of ['imageList', 'images', 'gallery', 'productImages', 'imageUrlList']) {
    const parsed = parseCjField(productData[key]);
    if (Array.isArray(parsed) && parsed.length) {
      const imgs = [...new Set(parsed.map(img => typeof img === 'string' ? img : (img.imageUrl || img.url || img.src)).filter(Boolean))];
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
// Strategy: pidOverride (vendor-pasted CJ URL — exact, no search) →
// productSku list search → product/detail for gallery → variantList fallback.
// Retries automatically on 429 (rate limit) and 5xx transient errors.
export async function getProductImages(vid, productName, credential, pidOverride = null) {
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

  // Extract CJ variant data for syncing stock/image/price back to our DB.
  // Store both vid (CJ internal ID) and variantSku (the human SKU like CJNS...)
  // so the route can match against whichever one our DB variant.sku holds.
  // sellPriceUsd is CJ's price to us (our cost) — always USD, per CJ's docs.
  function extractCjVariants(productData) {
    if (!productData) return [];
    const list = productData.variantList ?? productData.variants ?? [];
    return list.map(v => ({
      vid:         String(v.vid        ?? ''),
      variantSku:  String(v.variantSku ?? v.vid ?? ''),
      image:       v.variantImage ?? v.image ?? '',
      sellPriceUsd: Number.isFinite(Number(v.variantSellPrice)) ? Number(v.variantSellPrice) : null,
    })).filter(v => v.vid || v.variantSku);
  }

  // Videos live behind a dedicated endpoint (POST /product/queryVideosByProductId) —
  // the productVideo field on /product/detail is empty unless requested separately.
  // Response uses code:0 + success:true (unlike the other endpoints' code:200).
  async function fetchVideosByPid(pid) {
    try {
      await delay(200);
      const resp = await cjFetch(`${CJ_BASE}/product/queryVideosByProductId`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', 'Referer': 'https://developers.cjdropshipping.com' },
        body:    JSON.stringify({ productId: pid }),
      });
      const data = resp?.ok ? await resp.json() : null;
      if (!data || (data.code !== 0 && data.code !== 200) || !Array.isArray(data.data)) return [];
      return data.data
        .map(v => v.videoUrl)
        .filter(u => typeof u === 'string' && u.startsWith('http'));
    } catch (_) {
      return [];
    }
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
      const imgs = extractImages(data.data);
      if (imgs?.length) {
        const productUrl = data.data.productUrl
          || (pid ? `https://app.cjdropshipping.com/product-detail.html?id=${pid}` : '');
        const apiVideos = await fetchVideosByPid(pid);
        return {
          images:      imgs,
          videos:      [...new Set([...apiVideos, ...extractVideos(data.data)])],
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
      let earlyMedia = null;

      if (variants.length > 0) {
        confirmed = variants.some(v => {
          const vVid = (v.vid ?? v.variantSku ?? '').toLowerCase();
          return vVid && (vVid === needle || vVid.startsWith(needle) || needle.startsWith(vVid));
        });
      } else if (r.first.pid) {
        // List search returned no variants — CJ often omits them in list mode.
        // Fetch the detail endpoint which includes the full variantList for validation.
        await delay(200);
        const dm = await detailMedia(r.first.pid);
        if (dm?.cjVariants?.length) {
          confirmed = dm.cjVariants.some(cv => {
            const vVid = (cv.variantSku ?? cv.vid ?? '').toLowerCase();
            return vVid && (vVid === needle || vVid.startsWith(needle) || needle.startsWith(vVid));
          });
          if (confirmed) earlyMedia = dm;
        }
      }

      // Still unconfirmed — fall back to name similarity at 0.5
      if (!confirmed) {
        confirmed = nameConfident(r.first.productNameEn, productName, 0.5);
      }

      if (!confirmed) return null;
      if (earlyMedia) return earlyMedia;
    }

    if (r.first.pid) {
      const media = await detailMedia(r.first.pid);
      if (media?.images?.length) return media;
    }
    const imgs = extractImages(r.first);
    return imgs?.length ? { images: imgs, videos: [], cjVariants: extractCjVariants(r.first) } : null;
  }

  try {
    // Vendor-pinned product: supplierUrl carried an explicit CJ pid — fetch it
    // directly, no fuzzy search. This is the manual fix for wrong matches.
    if (pidOverride) {
      const pinned = await detailMedia(pidOverride);
      if (pinned?.images?.length) return pinned;
      return { error: 'Could not fetch the CJ product from the Supplier Product URL — check the link' };
    }

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
