// ======================================================
// LOCAL TITLE-BASED CATEGORY MATCHING — no CJ dependency
// Runs matchProductTitle() against a product's own name and writes the
// result directly to the database. Available to every vendor, on every
// tier, with no supplier credentials and no external API call involved —
// this is a purely internal Sell4Life operation.
// ======================================================
import Product from '../models/product.js';
import { matchProductTitle } from './categoryMatch.js';

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

  const matched = matchProductTitle(product.name);
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
