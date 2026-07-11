// ======================================================
// CJ PRODUCT SYNC — shared by the manual vendor routes,
// the auto-sync-on-save hook, and the periodic sweep worker
// ======================================================
import Product from '../models/product.js';
import cjProvider, { getProductImages as cjGetProductImages } from './shippingProviders/cjdropshipping.js';

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

// Full CJ sync for one product: images (replaced), videos (re-hosted on
// Cloudinary), per-variant images + cjVid, supplier name + URL. Shared by
// the manual bulk/single-product routes, the auto-sync-on-save hook, and
// the periodic sweep worker, so all four behave identically.
// When the vendor has saved a CJ link in supplierUrl, that product is fetched
// directly (no fuzzy search) — the manual override for wrong matches.
// Returns { status: 'skipped'|'updated'|'failed', count?, videos?, variantsSynced?, note?, error? }
export async function syncProductFromCj(product, credential) {
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
      return { status: 'updated', count: variantImgs.length, videos: 0, variantsSynced: 0, note: 'variant-fallback' };
    }
    return { status: 'failed', error: result?.error };
  }

  const updateDoc = {
    supplier: result.supplier ?? 'CJdropshipping',
    ...(result.supplierUrl ? { supplierUrl: result.supplierUrl } : {}),
  };

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
  const hasMarkup = Number.isFinite(Number(product.markupPct));
  if (result.cjVariants?.length) {
    const syncedVariants = (product.variants || []).map(ourV => {
      const ourSku = (ourV.sku ?? '').trim();
      const cjV = result.cjVariants.find(cv =>
        ourSku && (cv.variantSku.trim() === ourSku || cv.vid.trim() === ourSku)
      );
      if (!cjV) return ourV;
      if (!firstCjVid && cjV.vid) firstCjVid = cjV.vid;
      variantsSynced++;

      let priceUpdate = {};
      if (hasMarkup && cjV.sellPriceUsd != null) {
        const costGbp = cjV.sellPriceUsd * usdGbp;
        // Must match the frontend markup-calc.js formula exactly — (cost + ship
        // when shipIncluded) * (1 + markup%) — otherwise this auto-sync (which
        // runs on every save and every 12h via the periodic worker) silently
        // reverts whatever price the vendor's own "Apply to Price" tool just
        // set, because the two were computing different numbers for the same
        // markupPct. That mismatch is what caused a real vendor-visible bug:
        // the price kept drifting back down shortly after being fixed.
        const shipGbp = product.shipIncluded ? (Number(product.shippingCost) || 0) : 0;
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
  }

  // Live UK shipping quote using CJ's real variant id (SKUs get rejected with
  // "variant not found"). Only overwrite shippingCost when a quote succeeds —
  // otherwise the existing (weight-estimated) value stays.
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

  await Product.findByIdAndUpdate(product._id, updateDoc);
  return { status: 'updated', count: result.images.length, videos: videosSaved, variantsSynced, pricesSynced, shipping: shippingGbp };
}
