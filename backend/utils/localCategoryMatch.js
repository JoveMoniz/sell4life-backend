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
// force: true overwrites an existing category/subcategory — but still
// never destructively clears an existing subcategory just because the
// fresh match confirms the same category and simply can't independently
// re-derive a subcategory this time ("force re-match" means "replace with
// something better if found", not "erase what's already there").
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

  const categoryChanged = matched.category !== product.category;
  if (categoryChanged || !product.subcategory) {
    update.subcategory = matched.subcategory || null;
  } else if (matched.subcategory && matched.subcategory !== product.subcategory) {
    update.subcategory = matched.subcategory;
  }

  if (!Object.keys(update).length) {
    return { status: 'unchanged', matched };
  }

  await Product.updateOne({ _id: product._id }, { $set: update });
  return { status: 'updated', matched, update };
}
