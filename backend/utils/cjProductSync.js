// ======================================================
// CJ PRODUCT SYNC — shared by the manual vendor routes,
// the auto-sync-on-save hook, and the periodic sweep worker
// ======================================================
import Product from '../models/product.js';
import Vendor from '../models/vendor.js';
import cjProvider, { getProductImages as cjGetProductImages, testCredentialAuth, getShippingCostDiagnostic } from './shippingProviders/cjdropshipping.js';
import { decryptCredential } from './shippingProviders/registry.js';
import { matchCjCategory } from './categoryMatch.js';

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
  const vid = (product.variants || []).map(v => v.supplierVariantRef || v.sku).find(Boolean);
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

  // Auto-fill category/subcategory from CJ's own taxonomy when they're
  // still empty — CJ's category names don't match ours, so this is a
  // best-effort keyword match (see categoryMatch.js), not a direct copy.
  // Each field is only ever filled when genuinely empty — never overwrites
  // a vendor's own manual choice on a later sync. forceCategory (an
  // explicit, one-click, per-product "Re-match Category" action — never
  // triggered by a routine sync) opts out of that guard, for products that
  // got a wrong auto-match before a categoryMatch.js fix landed and need
  // re-deriving with the corrected logic.
  let categoryDebug = { cjCategoryName: result.cjCategoryName || null, matched: null, reason: null };
  if (forceCategory || !product.category || !product.subcategory) {
    if (!result.cjCategoryName) {
      categoryDebug.reason = 'CJ did not return a categoryName for this product';
    } else {
      const matched = matchCjCategory(result.cjCategoryName);
      categoryDebug.matched = matched;
      if (!matched.category) categoryDebug.reason = 'No category scored above the match threshold';
      if ((forceCategory || !product.category) && matched.category) updateDoc.category = matched.category;
      // subcategory always follows the freshly-matched category — carrying
      // over an old subcategory string from an unrelated category would be
      // its own kind of wrong pairing.
      if ((forceCategory || !product.subcategory) && matched.category) updateDoc.subcategory = matched.subcategory || null;
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

      if (!cjV) return { ourV, cjV: null, costGbp: null };
      if (!firstCjVid && cjV.vid) firstCjVid = cjV.vid;
      variantsSynced++;

      let costGbp = null;
      if (cjV.sellPriceUsd != null) {
        costGbp = cjV.sellPriceUsd * usdGbp;
        if (minCostGbp == null || costGbp < minCostGbp) minCostGbp = costGbp;
      }
      return { ourV, cjV, costGbp };
    });
  }

  // Live UK shipping quote using CJ's real variant id (SKUs get rejected with
  // "variant not found"). Only overwrite shippingCost when a quote succeeds —
  // otherwise the existing (weight-estimated) value stays. Fetched before
  // pass 2 below so this run's own fresh figure feeds this run's own price
  // calc, rather than the previous run's now-stale shippingCost.
  let shippingGbp = null;
  if (firstCjVid) {
    const quote = await cjProvider.getShippingCost(
      { supplierVariantRef: firstCjVid, destinationCountry: 'GB', quantity: 1 },
      credential
    );
    if (quote && Number.isFinite(Number(quote.cost))) {
      shippingGbp = Math.round(Number(quote.cost) * usdGbp * 100) / 100;
      updateDoc.shippingCost = shippingGbp;
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
      return { ...ourV, ...(cjV.image ? { image: cjV.image } : {}), cjVid: cjV.vid, ...priceUpdate };
    });
    if (variantsSynced > 0) updateDoc.variants = syncedVariants;

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
function blankShippingSummary() {
  return { vendorsChecked: 0, productsChecked: 0, unavailable: 0, available: 0, skipped: 0, errors: 0, authFailed: 0, apiDisabled: 0, details: [] };
}

// Checks UK freight availability for one vendor's CJ-connected products and
// merges the results into `summary`. Shared by the all-vendors admin sweep
// and the single-vendor on-demand check a vendor can trigger themselves.
async function checkUkShippingForVendor(vendor, summary) {
  summary.vendorsChecked++;
  let credential;
  try {
    credential = decryptCredential(vendor.supplierCredentials.cjdropshipping);
  } catch (err) {
    summary.errors++;
    summary.details.push({ vendorId: String(vendor._id), storeName: vendor.storeName, error: 'Bad CJ credential: ' + err.message });
    return;
  }

  // Test auth once per vendor before looping products — a *token* can be
  // obtained even when the account's API access is separately disabled
  // on CJ's side, so this alone isn't enough (see the code:200 check
  // below), but it still catches genuinely wrong credentials up front.
  const authCheck = await testCredentialAuth(credential);
  if (!authCheck.ok) {
    summary.authFailed++;
    summary.details.push({ vendorId: String(vendor._id), storeName: vendor.storeName, error: 'CJ credential did not authenticate — results skipped, not reported as unavailable' });
    return;
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

export async function checkUkShippingForAllProducts() {
  const summary = blankShippingSummary();

  const vendors = await Vendor.find({
    type: 'professional',
    'supplierCredentials.cjdropshipping': { $exists: true, $ne: null },
  });

  for (const vendor of vendors) {
    await checkUkShippingForVendor(vendor, summary);
  }

  return summary;
}

// On-demand check for a single vendor (e.g. a "Check UK shipping now"
// button on the vendor's own My Products page) — same logic, scoped to
// just their own catalog rather than sweeping every vendor.
export async function checkUkShippingForOneVendor(vendor) {
  const summary = blankShippingSummary();
  if (!vendor?.supplierCredentials?.cjdropshipping) {
    summary.details.push({ error: 'No CJ Dropshipping account connected' });
    return summary;
  }
  await checkUkShippingForVendor(vendor, summary);
  return summary;
}
