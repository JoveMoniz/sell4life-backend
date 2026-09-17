// ======================================================
// CJ PRODUCT SYNC — shared by the manual vendor routes,
// the auto-sync-on-save hook, and the periodic sweep worker
// ======================================================
import Product from '../models/product.js';
import Vendor from '../models/vendor.js';
import cjProvider, { getProductImages as cjGetProductImages, testCredentialAuth, getShippingCostDiagnostic, candidateOrigins } from './shippingProviders/cjdropshipping.js';
import { decryptCredential } from './shippingProviders/registry.js';
import { matchCjCategory, matchProductTitle } from './categoryMatch.js';
import { matchProductTitleAI } from './aiCategoryMatch.js';

// CJ video URLs come from a download-only domain that browsers can't stream.
// Re-host on Cloudinary (same cloud/preset the vendor upload UI uses) —
// Cloudinary fetches the remote URL server-side and returns a playable URL.
const CLD_CLOUD  = process.env.CLOUDINARY_CLOUD  || 'djpkj0s7w';
const CLD_PRESET = process.env.CLOUDINARY_PRESET || 'lhhkniqv';

async function rehostVideoOnCloudinary(url) {
  try {
    // CJ's download domain 403s without this Referer — must download ourselves
    // (Cloudinary's remote fetch can't send custom headers).
    const dl = await fetch(url, { headers: { Referer: 'https://developers.cjdropshipping.com' } });
    if (!dl.ok) return null;
    const buf = await dl.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > 90 * 1024 * 1024) return null; // Cloudinary limit safety

    const fd = new FormData();
    fd.append('file', new Blob([buf], { type: 'video/mp4' }), 'cj-video.mp4');
    fd.append('upload_preset', CLD_PRESET);
    const resp = await fetch(`https://api.cloudinary.com/v1_1/${CLD_CLOUD}/video/upload`, {
      method: 'POST',
      body:   fd,
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return data.secure_url || null;
  } catch (_) {
    return null;
  }
}

// Extract a CJ product id from a pasted CJ product URL — supports
// app.cjdropshipping.com/product-detail.html?id=<pid> and
// cjdropshipping.com/product/...-p-<pid>.html formats.
export function cjPidFromUrl(url) {
  if (!url || !/cjdropshipping\.com/i.test(String(url))) return null;
  const m = String(url).match(/[?&]id=([\w-]+)/) || String(url).match(/-p-(\w+)\.html/i);
  return m ? m[1] : null;
}

// True if this product looks CJ-sourced. Used to decide whether auto-sync
// (on save, or the periodic sweep) should bother attempting a CJ lookup at
// all — must be a real signal, not "has any SKU," which used to match every
// product on the platform (CJ-sourced or not) and wasted rate-limit budget
// on irrelevant products every time any vendor edited any variant.
export function looksCjSourced(product) {
  if (cjPidFromUrl(product.supplierUrl)) return true;
  if (product.supplier === 'CJdropshipping') return true;
  // A cjVid already resolved, or a SKU following CJ's own naming convention
  // (e.g. CJYD..., CJJS..., CJNS...) — not just any SKU at all.
  return (product.variants || []).some(v => v.cjVid || (v.sku && /^CJ/i.test(v.sku.trim())));
}

// The base "from £X" price should always be the cheapest variant, never an
// independently-maintained number that can silently drift away from what
// the variants actually cost (that drift is what caused a real mispricing
// bug — see cjProductSync commit history). Returns null if there's nothing
// valid to derive from, so callers can leave the existing price untouched.
export function deriveBasePriceFromVariants(variants) {
  const prices = (variants || [])
    .map(v => Number(v.price))
    .filter(p => Number.isFinite(p) && p > 0);
  return prices.length ? Math.min(...prices) : null;
}

// Scales each variant's price by the ratio between a new target base price
// and the variants' own current minimum — preserves relative differences
// between variants (a genuinely pricier size/colour stays pricier) instead
// of flattening every variant to the same number. Single source of truth
// for this on the backend — used by both the single-product edit route and
// the bulk price-edit route, which previously duplicated this same scaling
// logic inline (and mirrors markup-calc.js's client-side preview version).
// Mutates each variant's .price in place (works on plain objects and
// Mongoose subdocuments alike) and returns the resulting base price.
export function scaleVariantPricesToTarget(variants, targetPrice) {
  if (!Array.isArray(variants) || !variants.length) return targetPrice;
  const oldBase = deriveBasePriceFromVariants(variants);
  const scale = oldBase > 0 ? targetPrice / oldBase : null;
  variants.forEach((v) => {
    const oldVariantPrice = Number(v.price) || 0;
    v.price = (scale != null && oldVariantPrice > 0)
      ? Math.round(oldVariantPrice * scale * 100) / 100
      : targetPrice;
  });
  return deriveBasePriceFromVariants(variants);
}

// Full CJ sync for one product: images (replaced), videos (re-hosted on
// Cloudinary), per-variant images + cjVid, supplier name + URL. Shared by
// the manual bulk/single-product routes, the auto-sync-on-save hook, and
// the periodic sweep worker, so all four behave identically.
// When the vendor has saved a CJ link in supplierUrl, that product is fetched
// directly (no fuzzy search) — the manual override for wrong matches.
// Returns { status: 'skipped'|'updated'|'failed', count?, videos?, variantsSynced?, note?, error? }
export async function syncProductFromCj(product, credential, { forceCategory = false } = {}) {
  const pidOverride = cjPidFromUrl(product.supplierUrl);
  // Falls back to the top-level fields for a single-SKU import, which has
  // an empty variants[] (no per-row attributes → no variant built at all)
  // and would otherwise have no way to be found on CJ despite a vendor
  // having supplied a Supplier Variant ID/SKU during CSV import.
  const vid = (product.variants || []).map(v => v.supplierVariantRef || v.sku).find(Boolean)
    || product.supplierVariantRef || product.sku;
  if (!vid && !pidOverride) return { status: 'skipped' };

  const result = await cjGetProductImages(vid, product.name, credential, pidOverride);

  if (!result?.images?.length) {
    // CJ search failed or returned wrong product — fall back to per-variant images already stored
    const variantImgs = [...new Set((product.variants || []).map(v => v.image).filter(Boolean))];
    if (variantImgs.length) {
      // Same manual-reorder protection as the main path below — don't touch
      // images if the fallback set matches what's already stored.
      const currentSet = new Set(product.images || []);
      const fallbackSet = new Set(variantImgs);
      const sameSet = currentSet.size === fallbackSet.size &&
        [...currentSet].every(img => fallbackSet.has(img));
      if (!sameSet) {
        await Product.findByIdAndUpdate(product._id, { images: variantImgs });
      }
      return { status: 'updated', count: variantImgs.length, videos: 0, variantsSynced: 0, note: 'variant-fallback', cjSearchError: result?.error || null, cjSearchDebug: result?.debug || null };
    }
    return { status: 'failed', error: result?.error, cjSearchDebug: result?.debug || null };
  }

  const updateDoc = {
    supplier: result.supplier ?? 'CJdropshipping',
    ...(result.supplierUrl ? { supplierUrl: result.supplierUrl } : {}),
  };

  // Auto-fill category/subcategory when still empty. The product's own
  // title is tried FIRST — CJ suppliers often dump small accessories under
  // generic buckets ("Bike Top Tube Bag" landed under CJ's "Home & Garden")
  // regardless of what the item actually is, whereas a title like that is
  // unambiguous. CJ's own category path is only a fallback when the title
  // itself doesn't score above threshold (see categoryMatch.js). Each field
  // is only ever filled when genuinely empty — never overwrites a vendor's
  // own manual choice on a later sync. forceCategory (an explicit,
  // one-click, per-product "Re-match Category" action — never triggered by
  // a routine sync) opts out of that guard, for products that got a wrong
  // auto-match before a categoryMatch.js fix landed and need re-deriving.
  let categoryDebug = { cjCategoryName: result.cjCategoryName || null, titleMatch: null, matched: null, source: null, reason: null };
  if (forceCategory || !product.category || !product.subcategory) {
    let titleMatched;
    try {
      titleMatched = await matchProductTitleAI(product.name, product);
    } catch (err) {
      console.error('[aiCategoryMatch] falling back to keyword matching:', err.message);
      titleMatched = matchProductTitle(product.name);
    }
    categoryDebug.titleMatch = titleMatched;
    let matched = titleMatched;
    categoryDebug.source = 'title';
    if (!matched.category) {
      if (!result.cjCategoryName) {
        categoryDebug.reason = 'Title had no confident match, and CJ did not return a categoryName either';
      } else {
        matched = matchCjCategory(result.cjCategoryName);
        categoryDebug.source = 'cj-category';
        if (!matched.category) categoryDebug.reason = 'Neither title nor CJ category scored above the match threshold';
      }
    } else if (!matched.subcategory && result.cjCategoryName) {
      // Title confidently placed the category but couldn't pin a
      // subcategory (common — titles are often too short/generic for that
      // level of detail). Only use CJ's path to help fill just the
      // subcategory, and only when CJ independently agrees on the same
      // category — never adopt a subcategory whose parent category
      // disagrees with the one we already trust from the title.
      const cjMatched = matchCjCategory(result.cjCategoryName);
      if (cjMatched.category === matched.category && cjMatched.subcategory) {
        matched = { category: matched.category, subcategory: cjMatched.subcategory };
        categoryDebug.source = 'title+cj-subcategory';
      }
    }
    categoryDebug.matched = matched;
    if ((forceCategory || !product.category) && matched.category) updateDoc.category = matched.category;
    // subcategory always follows the freshly-matched category — carrying
    // over an old subcategory string from an unrelated category would be
    // its own kind of wrong pairing, so a genuine category CHANGE clears
    // it (to the new match, or to null if the new category has no
    // confident subcategory either). But when forceCategory re-confirms
    // the SAME category and simply can't pin a subcategory this time
    // (titles are often too short/generic for that level of detail), an
    // existing subcategory is left alone rather than wiped to null —
    // "force re-match" means "replace with something better if found",
    // not "erase a value the algorithm can no longer independently prove".
    const categoryChanged = matched.category && matched.category !== product.category;
    if (matched.category && (categoryChanged || !product.subcategory)) {
      updateDoc.subcategory = matched.subcategory || null;
    } else if (matched.category && matched.subcategory && matched.subcategory !== product.subcategory) {
      updateDoc.subcategory = matched.subcategory;
    }
  } else {
    categoryDebug.reason = 'Product already had category/subcategory set — left untouched';
  }

  // Only overwrite images when CJ's set actually changed (new/removed images) —
  // never just to "correct" the order. Every sync used to reset images to CJ's
  // raw order, silently undoing any manual drag-to-reorder the vendor had done
  // on the product edit page.
  const currentImageSet = new Set(product.images || []);
  const incomingImageSet = new Set(result.images);
  const sameImageSet = currentImageSet.size === incomingImageSet.size &&
    [...currentImageSet].every(img => incomingImageSet.has(img));
  if (!sameImageSet) {
    updateDoc.images = [...incomingImageSet];
  }

  // Save up to 5 video URLs. CJ's raw URLs don't stream in a browser, so
  // re-host each on Cloudinary first. Skip if this product already has a
  // Cloudinary-hosted video — avoids duplicate uploads on every run.
  // Exception: with a pinned supplierUrl the previous videos may belong to a
  // wrongly-matched product, so replace them outright (clearing unused slots).
  // videosSaved reports what the product HAS (kept ones count too), not just new uploads.
  const videoFields = ['videoUrl', 'videoUrl2', 'videoUrl3', 'videoUrl4', 'videoUrl5'];
  const alreadyHosted = (product.videoUrl || '').includes('res.cloudinary.com');
  let videosSaved = 0;
  if (alreadyHosted && !pidOverride) {
    videosSaved = videoFields.filter(f => (product[f] || '').trim()).length;
  } else if (result.videos?.length || pidOverride) {
    const hosted = [];
    for (const rawUrl of (result.videos || []).slice(0, 5)) {
      const h = await rehostVideoOnCloudinary(rawUrl);
      if (h) hosted.push(h);
    }
    if (pidOverride) {
      videoFields.forEach((f, i) => { updateDoc[f] = hosted[i] || ''; });
    } else {
      hosted.forEach((url, i) => { updateDoc[videoFields[i]] = url; });
    }
    videosSaved = hosted.length;
  }

  const usdGbp = Number(process.env.CJ_USD_GBP_RATE) || 0.79;

  // Sync per-variant image + CJ vid + price from CJ variantList (stock not
  // available via CJ API). The vid is CJ's internal variant id — needed for
  // live freight quotes and CJ auto-ordering. Price is only recalculated
  // when the vendor has a markup% configured (via the "Apply to Price" tool)
  // — without that we have no basis for turning CJ's cost into a sell price,
  // so an existing manually-set variant price is left alone in that case.
  let variantsSynced = 0;
  let pricesSynced = 0;
  let firstCjVid = '';
  let firstCjInventories = [];
  let minCostGbp = null;
  const hasMarkup = Number.isFinite(Number(product.markupPct));
  const variantMatchDebug = {
    cjVariantsFound: result.cjVariants?.length || 0,
    ourVariantsCount: (product.variants || []).length,
    videoApi: result.videoApiDebug || null,
  };
  // Pass 1: match our variants to CJ's, and find firstCjVid + the cost basis
  // per variant — but don't price anything yet. The shipping quote below
  // needs firstCjVid, and pricing had to wait for it: computing price here
  // using the pre-sync product.shippingCost left the vendor-visible price
  // one sync cycle behind every time CJ's freight quote changed, since this
  // same run then overwrote shippingCost with the new figure right after —
  // so the just-saved price always looked "wrong" relative to cost+shipping.
  let matched = [];
  if (result.cjVariants?.length) {
    matched = (product.variants || []).map(ourV => {
      const ourSku = (ourV.sku ?? '').trim();
      let cjV = result.cjVariants.find(cv =>
        ourSku && (cv.variantSku.trim() === ourSku || cv.vid.trim() === ourSku)
      );

      // Fallback: our SKU sometimes has a hand-appended attribute suffix that
      // isn't part of CJ's real SKU (e.g. "CJJSPBPB01209-White" vs CJ's own
      // "CJJSPBPB01209") — an exact match will never happen. If exactly one
      // CJ variant's SKU contains this variant's own attribute value (colour,
      // size, etc.), that's an unambiguous match.
      if (!cjV) {
        const attrVal = Object.values(ourV.attributes || {}).find(Boolean);
        if (attrVal) {
          const needle = String(attrVal).trim().toLowerCase();
          const candidates = result.cjVariants.filter(cv => cv.variantSku.toLowerCase().includes(needle));
          if (candidates.length === 1) cjV = candidates[0];
        }
      }

      // Fallback: the other direction of the same problem — our stored SKU
      // is CJ's own base/product-level SKU (captured at CSV-import time)
      // with CJ's per-variant suffix missing (e.g. our "CJYD2458305" vs
      // CJ's real variant SKU "CJYD245830501AZ"). If exactly one CJ variant
      // SKU starts with ours, that's unambiguous.
      if (!cjV && ourSku.length >= 6) {
        const candidates = result.cjVariants.filter(cv => cv.variantSku.startsWith(ourSku));
        if (candidates.length === 1) cjV = candidates[0];
      }

      // Fallback: a single-SKU product (no real variant options) with
      // exactly one CJ variant on the other side can only mean one thing,
      // regardless of whether the SKU strings happen to match at all.
      if (!cjV && (product.variants || []).length === 1 && result.cjVariants.length === 1) {
        cjV = result.cjVariants[0];
      }

      if (!cjV) return { ourV, cjV: null, costGbp: null };
      variantsSynced++;

      let costGbp = null;
      if (cjV.sellPriceUsd != null) {
        costGbp = cjV.sellPriceUsd * usdGbp;
        if (minCostGbp == null || costGbp < minCostGbp) minCostGbp = costGbp;
      }
      return { ourV, cjV, costGbp };
    });

    // Pick which matched variant to request the shipping quote from.
    // Was previously just "the first one matched" — but a variant with
    // zero stock (e.g. a discontinued colour) genuinely has no freight
    // route on CJ's side (0 options returned), silently leaving the
    // whole product's shippingCost stuck on a stale value forever even
    // though sibling variants with real stock quote fine. Prefer a
    // variant with actual stock; only fall back to a zero-stock one if
    // every matched variant is out of stock.
    const withCjV = matched.filter(m => m.cjV?.vid);
    const stockedFirst = withCjV.find(m => Number(m.ourV?.stock) > 0) || withCjV[0];
    if (stockedFirst) {
      firstCjVid = stockedFirst.cjV.vid;
      firstCjInventories = stockedFirst.cjV.inventories || [];
    }
  }

  // Live UK shipping quote using CJ's real variant id (SKUs get rejected with
  // "variant not found"). Only overwrite shippingCost when a quote succeeds —
  // otherwise the existing (weight-estimated) value stays. Fetched before
  // pass 2 below so this run's own fresh figure feeds this run's own price
  // calc, rather than the previous run's now-stale shippingCost.
  //
  // Tries candidateOrigins(firstCjInventories) in order (real stock in a
  // non-China warehouse first, 'CN' always last) and stops at the first
  // successful quote — so a product genuinely stocked in e.g. the UK gets
  // priced/timed from there instead of always assuming a China->GB freight
  // route, while a China-only product behaves exactly as before.
  //
  // CJ's live API doesn't expose per-variant warehouse data (confirmed —
  // it always comes back null), so candidateOrigins() here would normally
  // only ever produce ['CN']. If a real, non-CN origin was already
  // recorded some other way (the CSV import's "Shipping From" column —
  // the only source that actually has this data), try that FIRST rather
  // than silently reverting a correct GB/US/DE origin back to China just
  // because this particular sync run has no better information.
  const knownOrigin = product.shippingOriginCountry;
  const originCandidates = knownOrigin && knownOrigin !== 'CN'
    ? [knownOrigin, ...candidateOrigins(firstCjInventories).filter(c => c !== knownOrigin)]
    : candidateOrigins(firstCjInventories);
  let shippingGbp = null;
  if (firstCjVid) {
    for (const startCountryCode of originCandidates) {
      const quote = await cjProvider.getShippingCost(
        { supplierVariantRef: firstCjVid, destinationCountry: 'GB', quantity: 1, startCountryCode },
        credential
      );
      if (quote && Number.isFinite(Number(quote.cost))) {
        shippingGbp = Math.round(Number(quote.cost) * usdGbp * 100) / 100;
        updateDoc.shippingCost = shippingGbp;
        updateDoc.shippingOriginCountry = startCountryCode;

        // CJ's logisticAging shape isn't fully confirmed from docs alone —
        // handle both a plain number and a "min-max" range string, and log
        // the raw value once so real production data can be checked against
        // this parsing on the first live sync after this ships.
        const rawEta = quote.etaDays;
        console.log('[cjProductSync] raw logisticAging for vid=%s origin=%s:', firstCjVid, startCountryCode, rawEta);
        let etaMin = null, etaMax = null;
        if (typeof rawEta === 'string' && /\d+\D+\d+/.test(rawEta)) {
          const [a, b] = rawEta.match(/\d+/g).map(Number);
          etaMin = Math.min(a, b);
          etaMax = Math.max(a, b);
        } else if (Number.isFinite(Number(rawEta))) {
          etaMin = Number(rawEta);
          etaMax = etaMin + 3; // small buffer — a point estimate isn't a guarantee
        }
        if (etaMin != null) {
          updateDoc.estDeliveryMinDays = etaMin;
          updateDoc.estDeliveryMaxDays = etaMax;
        }
        break;
      }
    }
  }

  // Pass 2: price is only recalculated when the vendor has a markup%
  // configured (via the "Apply to Price" tool) — without that we have no
  // basis for turning CJ's cost into a sell price, so an existing
  // manually-set variant price is left alone in that case.
  if (matched.length) {
    // Must match the frontend markup-calc.js formula exactly — (cost + ship
    // when shipIncluded) * (1 + markup%) — otherwise this auto-sync (which
    // runs on every save and every 12h via the periodic worker) silently
    // reverts whatever price the vendor's own "Apply to Price" tool just
    // set, because the two were computing different numbers for the same
    // markupPct.
    const shipGbp = product.shipIncluded
      ? (shippingGbp != null ? shippingGbp : (Number(product.shippingCost) || 0))
      : 0;

    const syncedVariants = matched.map(({ ourV, cjV, costGbp }) => {
      if (!cjV) return ourV;
      let priceUpdate = {};
      if (hasMarkup && costGbp != null) {
        const newPrice = Math.round((costGbp + shipGbp) * (1 + Number(product.markupPct) / 100) * 100) / 100;
        priceUpdate = { price: newPrice };
        pricesSynced++;
      }
      // Stock — unlike price, this has no "no basis to compute it" case tied
      // to markup config: CJ's real inventory count is ground truth, so it
      // refreshes on every sync for every matched variant. Previously this
      // sync never touched stock at all — set once at CSV import, then
      // frozen forever, even though the data needed to keep it honest
      // (cjV.inventories) was already being fetched here for origin
      // detection. A real sellout could silently stay "in stock" forever,
      // or a real restock could stay blocked — the same staleness risk
      // shipping cost had, just for orders.js's trackInventory check.
      //
      // CJ's own API frequently returns no inventory data at all for a
      // variant (inventories: null, confirmed directly against production
      // data) — that's "CJ didn't tell us this time", not "confirmed zero
      // stock". Treating a missing/empty array as 0 would wrongly zero out
      // — and silently block orders on — every such product on its very
      // next sync. Only overwrite stock when CJ actually returned at least
      // one real inventory entry; otherwise keep whatever was already
      // stored rather than guessing.
      const stockUpdate = Array.isArray(cjV.inventories) && cjV.inventories.length > 0
        ? { stock: cjV.inventories.reduce((sum, inv) => sum + (Number(inv.totalInventory) || 0), 0) }
        : {};
      return { ...ourV, ...(cjV.image ? { image: cjV.image } : {}), cjVid: cjV.vid, ...stockUpdate, ...priceUpdate };
    });
    const totalStock = syncedVariants.reduce((sum, v) => sum + (Number(v.stock) || 0), 0);
    const previousStock = Number(product.stock) || 0;

    // Debounce a fresh "CJ says zero" against a previously-in-stock product.
    // CJ's own inventory feed genuinely glitches sometimes (confirmed
    // directly against production data), and this product's auto-sync-on-
    // save hook means a routine, unrelated edit silently re-triggers a live
    // CJ check — so a single flaky "0" reading is common, not rare. Only
    // commit to 0 once a second check, some time after the first, confirms
    // it; otherwise keep the last known-good numbers untouched this run.
    const ZERO_CONFIRM_MS = 3 * 60 * 60 * 1000; // 3 hours
    if (totalStock === 0 && previousStock > 0) {
      if (!product.stockZeroPendingSince) {
        updateDoc.stockZeroPendingSince = new Date();
        // Deliberately skip updateDoc.variants/stock/trackInventory this
        // run — preserve the existing, known-good values.
      } else if (Date.now() - new Date(product.stockZeroPendingSince).getTime() >= ZERO_CONFIRM_MS) {
        if (variantsSynced > 0) updateDoc.variants = syncedVariants;
        updateDoc.stock = totalStock;
        updateDoc.trackInventory = false;
        updateDoc.stockZeroPendingSince = null;
      }
      // else: still within the confirmation window — wait for a later sync.
    } else {
      if (variantsSynced > 0) updateDoc.variants = syncedVariants;
      updateDoc.stock = totalStock;
      updateDoc.trackInventory = totalStock > 0;
      if (product.stockZeroPendingSince) updateDoc.stockZeroPendingSince = null;
    }

    // Keep the base "from £X" price honest — always the cheapest variant,
    // never a stale independently-set number.
    const derivedBase = deriveBasePriceFromVariants(syncedVariants);
    if (derivedBase != null) updateDoc.price = derivedBase;

    // The vendor-visible Cost Price field was never touched by this sync —
    // it stayed at whatever was last manually typed while the price above
    // was silently computed from CJ's real live cost instead, so "Apply to
    // Price" (which reads from the Cost Price field) never matched the
    // actual saved price and looked broken. Keep it honest the same way as
    // the base price: reflect the cost basis that was actually used.
    if (minCostGbp != null) updateDoc.costPrice = Math.round(minCostGbp * 100) / 100;
  }

  await Product.findByIdAndUpdate(product._id, updateDoc);
  return { status: 'updated', count: result.images.length, videos: videosSaved, variantsSynced, pricesSynced, shipping: shippingGbp, categoryDebug, variantMatchDebug };
}

// ======================================================
// CHECK UK SHIPPING AVAILABILITY — ALL PRODUCTS
// Sweeps every professional vendor's CJ-connected products and records
// whether CJ currently has a freight route to the UK for each, using the
// same getShippingCost() call checkout/sync already rely on — so a broken
// route can be found proactively instead of only surfacing when a real
// order fails with "No shipping option available for this destination".
// Only checks the first variant with a cjVid per product, matching
// syncProductFromCj's existing "shipping is roughly product-level" treatment.
// ======================================================
export async function checkUkShippingForAllProducts() {
  const summary = { vendorsChecked: 0, productsChecked: 0, unavailable: 0, available: 0, skipped: 0, errors: 0, authFailed: 0, apiDisabled: 0, details: [] };

  const vendors = await Vendor.find({
    type: 'professional',
    'supplierCredentials.cjdropshipping': { $exists: true, $ne: null },
  });

  for (const vendor of vendors) {
    summary.vendorsChecked++;
    let credential;
    try {
      credential = decryptCredential(vendor.supplierCredentials.cjdropshipping);
    } catch (err) {
      summary.errors++;
      summary.details.push({ vendorId: String(vendor._id), storeName: vendor.storeName, error: 'Bad CJ credential: ' + err.message });
      continue;
    }

    // Test auth once per vendor before looping products — a *token* can be
    // obtained even when the account's API access is separately disabled
    // on CJ's side, so this alone isn't enough (see the code:200 check
    // below), but it still catches genuinely wrong credentials up front.
    const authCheck = await testCredentialAuth(credential);
    if (!authCheck.ok) {
      summary.authFailed++;
      summary.details.push({ vendorId: String(vendor._id), storeName: vendor.storeName, error: 'CJ credential did not authenticate — results skipped, not reported as unavailable' });
      continue;
    }

    const products = await Product.find({ vendor: vendor._id, archived: { $ne: true } });

    let vendorApiDisabled = false;

    for (const product of products) {
      if (vendorApiDisabled) { summary.skipped++; continue; }

      summary.productsChecked++;
      try {
        const cjVid = (product.variants || []).map(v => v.cjVid).find(Boolean);
        if (!cjVid) { summary.skipped++; continue; }

        // Use the diagnostic call, not getShippingCost() — that function
        // collapses "CJ account-level API access disabled" (code !== 200,
        // e.g. 1600014) and "genuinely no freight route" (code === 200,
        // empty options) into the same null, which would otherwise
        // misreport every product for an account with disabled API access
        // as having lost UK shipping — this is what actually happened on
        // the first run of this check, before this distinction existed.
        const diag = await getShippingCostDiagnostic(
          { supplierVariantRef: cjVid, destinationCountry: 'GB', quantity: 1 },
          credential
        );

        if (diag.code !== 200) {
          // Account-level problem, not per-product — stop hammering CJ with
          // the same failure for the rest of this vendor's catalog, and
          // clear any shippingUnavailableUK flags this vendor's products
          // already carry from an earlier run — those were written before
          // this code-!==200 distinction existed and don't reflect real
          // per-product data, just this same account-level failure repeated.
          vendorApiDisabled = true;
          summary.apiDisabled++;
          await Product.updateMany(
            { vendor: vendor._id, shippingCheckedAt: { $ne: null } },
            { shippingUnavailableUK: null, shippingCheckedAt: null }
          );
          summary.details.push({
            vendorId: String(vendor._id), storeName: vendor.storeName,
            error: `CJ API error (code ${diag.code}): ${diag.message || 'unknown'} — rest of this vendor's products skipped, stale flags cleared, not reported as unavailable`,
          });
          continue;
        }

        const unavailable = diag.optionsCount === 0;

        await Product.findByIdAndUpdate(product._id, {
          shippingUnavailableUK: unavailable,
          shippingCheckedAt: new Date(),
        });

        if (unavailable) {
          summary.unavailable++;
          summary.details.push({ vendorId: String(vendor._id), storeName: vendor.storeName, productId: String(product._id), name: product.name });
        } else {
          summary.available++;
        }
      } catch (err) {
        summary.errors++;
        summary.details.push({ vendorId: String(vendor._id), productId: String(product._id), error: err.message });
      }
    }
  }

  return summary;
}

// ======================================================
// CHECK UK SHIPPING AVAILABILITY — ONE VENDOR, ON DEMAND
// Same per-product logic as checkUkShippingForAllProducts above, scoped to
// a single already-fetched vendor so routes/vendor.js's on-demand endpoint
// doesn't have to wait for the automatic sweep's next cycle. Returns the
// same summary shape (minus the outer vendor loop) so callers can treat
// both responses identically.
// ======================================================
export async function checkUkShippingForOneVendor(vendor) {
  const summary = { vendorsChecked: 1, productsChecked: 0, unavailable: 0, available: 0, skipped: 0, errors: 0, authFailed: 0, apiDisabled: 0, details: [] };

  let credential;
  try {
    credential = decryptCredential(vendor.supplierCredentials.cjdropshipping);
  } catch (err) {
    summary.errors++;
    summary.details.push({ vendorId: String(vendor._id), storeName: vendor.storeName, error: 'Bad CJ credential: ' + err.message });
    return summary;
  }

  const authCheck = await testCredentialAuth(credential);
  if (!authCheck.ok) {
    summary.authFailed++;
    summary.details.push({ vendorId: String(vendor._id), storeName: vendor.storeName, error: 'CJ credential did not authenticate — results skipped, not reported as unavailable' });
    return summary;
  }

  const products = await Product.find({ vendor: vendor._id, archived: { $ne: true } });

  let vendorApiDisabled = false;

  for (const product of products) {
    if (vendorApiDisabled) { summary.skipped++; continue; }

    summary.productsChecked++;
    try {
      const cjVid = (product.variants || []).map(v => v.cjVid).find(Boolean);
      if (!cjVid) { summary.skipped++; continue; }

      const diag = await getShippingCostDiagnostic(
        { supplierVariantRef: cjVid, destinationCountry: 'GB', quantity: 1 },
        credential
      );

      if (diag.code !== 200) {
        vendorApiDisabled = true;
        summary.apiDisabled++;
        await Product.updateMany(
          { vendor: vendor._id, shippingCheckedAt: { $ne: null } },
          { shippingUnavailableUK: null, shippingCheckedAt: null }
        );
        summary.details.push({
          vendorId: String(vendor._id), storeName: vendor.storeName,
          error: `CJ API error (code ${diag.code}): ${diag.message || 'unknown'} — rest of this vendor's products skipped, stale flags cleared, not reported as unavailable`,
        });
        continue;
      }

      const unavailable = diag.optionsCount === 0;

      await Product.findByIdAndUpdate(product._id, {
        shippingUnavailableUK: unavailable,
        shippingCheckedAt: new Date(),
      });

      if (unavailable) {
        summary.unavailable++;
        summary.details.push({ vendorId: String(vendor._id), storeName: vendor.storeName, productId: String(product._id), name: product.name });
      } else {
        summary.available++;
      }
    } catch (err) {
      summary.errors++;
      summary.details.push({ vendorId: String(vendor._id), productId: String(product._id), error: err.message });
    }
  }

  return summary;
}

// ======================================================
// BEST-EFFORT: CANCEL THE MATCHING CJ ORDER
// Called whenever an item that already has an auto-created CJ order gets
// cancelled on our side. Only actually attempts a live CJ call while the
// CJ order is still 'CREATED' (unpaid) — CJ's deleteOrder endpoint itself
// refuses anything past that, which is the correct, safe outcome once the
// vendor has already paid for it in their CJ dashboard. Never throws and
// never blocks the caller's own cancellation — on any failure/skip, the
// item's existing cjOrderId/cjOrderStatus is left untouched, so the
// "still active on CJ" warning banner (product.js/vendor-order-details.js)
// keeps showing and tells the vendor to handle it manually instead.
// Mutates item.cjOrderStatus in place on success — caller still needs to
// save() the order afterwards.
// ======================================================
// Returns { attempted, cjCancelled, reason }. `attempted: false` means there
// was no live CJ order to check (not dropshipped, already resolved, or no
// vendor credential) — callers should treat that the same as a confirmed
// cancel, since there's nothing on CJ's side that could still ship.
// `attempted: true, cjCancelled: false` means CJ was actually asked and
// refused — most commonly because the order already moved past CREATED
// (i.e. it's been dispatched) — callers must NOT treat this as a clean
// cancel, since the item may genuinely still be on its way.
export async function attemptCjOrderCancel(item) {
  if (!item?.cjOrderId || item.cjOrderStatus !== 'CREATED') {
    return { attempted: false, cjCancelled: false };
  }

  try {
    const vendor = await Vendor.findById(item.vendorId).select('supplierCredentials');
    const rawCred = vendor?.supplierCredentials?.cjdropshipping;
    if (!rawCred) return { attempted: false, cjCancelled: false };

    const credential = decryptCredential(rawCred);
    const result = await cjProvider.cancelOrder(item.cjOrderId, credential);

    if (result?.success) {
      item.cjOrderStatus = 'cancelled';
      console.log(`[cj-auto-cancel] cancelled CJ order ${item.cjOrderId} for item ${item._id}`);
      return { attempted: true, cjCancelled: true };
    }

    console.warn(`[cj-auto-cancel] could not cancel CJ order ${item.cjOrderId} for item ${item._id}:`, result?.error);
    return { attempted: true, cjCancelled: false, reason: result?.error };
  } catch (err) {
    console.warn(`[cj-auto-cancel] error cancelling CJ order for item ${item._id}:`, err.message);
    return { attempted: true, cjCancelled: false, reason: err.message };
  }
}
