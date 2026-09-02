// ======================================================
// LOCAL TITLE-BASED CATEGORY MATCHING — no CJ dependency
// Runs a real Claude classification (aiCategoryMatch.js) against a
// product's own name and writes the result directly to the database.
// Available to every vendor, on every tier, with no supplier credentials
// involved — the only external call this makes is to Anthropic's API,
// not any dropshipping supplier.
//
// Falls back to the old word-overlap matcher (categoryMatch.js) if the AI
// call fails (missing/invalid API key, rate limit, network issue) — a
// worse match beats a hard failure for a background operation like this.
// ======================================================
import Product from '../models/product.js';
import { matchProductTitle } from './categoryMatch.js';
import { matchProductTitleAI } from './aiCategoryMatch.js';

async function classify(product) {
  try {
    return await matchProductTitleAI(product.name, product);
  } catch (err) {
    console.error('[aiCategoryMatch] falling back to keyword matching:', err.message);
    return matchProductTitle(product.name);
  }
}

// Applies a fresh title-based match to one product and saves it.
// force: true means a full, unconditional overwrite of both category and
// subcategory with whatever the title match produces (including null if
// no confident subcategory is found) — this is what the "force re-match"
// bulk tool promises its own confirm dialog ("OVERWRITE what's set now").
// Without force, an existing subcategory is preserved when the match can't
// independently re-derive one, so the "fill gaps only" path never erases
// data the vendor already had.
export async function rematchProductCategoryFromTitle(product, { force = false } = {}) {
  if (!force && product.category && product.subcategory) {
    return { status: 'skipped', matched: null };
  }

  const matched = await classify(product);
  if (!matched.category) {
    return { status: 'no-match', matched };
  }

  const update = {};
  if (force || !product.category) update.category = matched.category;

  if (force) {
    update.subcategory = matched.subcategory || null;
  } else {
    const categoryChanged = matched.category !== product.category;
    if (categoryChanged || !product.subcategory) {
      update.subcategory = matched.subcategory || null;
    } else if (matched.subcategory && matched.subcategory !== product.subcategory) {
      update.subcategory = matched.subcategory;
    }
  }

  const actuallyChanged = Object.entries(update).some(
    ([key, value]) => (product[key] ?? null) !== (value ?? null)
  );
  if (!actuallyChanged) {
    return { status: 'unchanged', matched };
  }

  await Product.updateOne({ _id: product._id }, { $set: update });
  return { status: 'updated', matched, update };
}
