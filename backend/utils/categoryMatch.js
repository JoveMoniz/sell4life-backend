// ======================================================
// CJ CATEGORY → SELL4LIFE CATEGORY MATCHING
// CJ's own category taxonomy (returned as a "/"-separated path like
// "Home & Garden / Home Storage / Home Office Storage") doesn't correspond
// to ours, so this does a best-effort keyword match onto our fixed
// category + subcategory list instead of copying CJ's names in directly.
//
// data/productSubcategories.json is a generated snapshot of
// frontend/assets/js/vendor-add-product.js's subcategoriesMap — the two
// repos can't share a module directly, so if that map changes, regenerate
// this file to match (see the extraction script used to create it).
// ======================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SUBCATEGORIES = JSON.parse(
  fs.readFileSync(path.join(__dirname, '../data/productSubcategories.json'), 'utf8')
);

// Display name per category id — must match frontend/data/category.json's
// names ('other' has no category.json entry, since it's a catch-all with
// no dedicated browse page).
const CATEGORY_NAMES = {
  fashion:     'Fashion',
  electronics: 'Electronics',
  home:        'Home & Garden',
  books:       'Books',
  toys:        'Toys & Games',
  health:      'Health & Beauty',
  sports:      'Sports & Outdoors',
  automotive:  'Automotive & Vehicles',
  food:        'Food & Drink',
  baby:        'Baby & Kids',
  pets:        'Pet Supplies',
  arts:        'Arts, Crafts & Hobbies',
  office:      'Office & Stationery',
  antiques:    'Antiques & Collectibles',
  travel:      'Travel & Luggage',
  software:    'Software & Digital',
};

// CJ's own top-level category names often don't share a word with ours
// (e.g. CJ's "Computer & Office" vs our "Electronics") — extra keywords
// per category catch the common cases without needing CJ's exact taxonomy.
const CATEGORY_KEYWORDS = {
  electronics: ['computer', 'computers', 'pc', 'laptop', 'phone', 'cellphone', 'tech', 'gadgets', 'digital'],
  automotive:  ['car', 'cars', 'vehicle', 'auto'],
  health:      ['beauty', 'cosmetic', 'cosmetics', 'wellness'],
  home:        ['kitchen', 'furniture', 'garden', 'household'],
  sports:      ['fitness', 'outdoor', 'gym'],
  toys:        ['hobbies', 'hobby'],
  baby:        ['kids', 'children', 'infant'],
};

const STOPWORDS = new Set(['and', 'the', 'for', 'with', 'of', 'a', 'an', 'to', 'in', 'on']);

// Crude singular/plural fold ("creams" -> "cream", "phones" -> "phone") so
// "Face Creams" matches "Face Cream" — CJ's and our own naming rarely agree
// on plurality even when they mean the same thing. Left alone below length
// 4 so short real words ("gas", "bus") don't get mangled.
function singularize(word) {
  return word.length > 4 && word.endsWith('s') ? word.slice(0, -1) : word;
}

function words(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w))
    .map(singularize);
}

// Fraction of candidateWords that also appear in targetWords — biased
// toward short, specific names (like ours) matching cleanly against a
// longer path (CJ's), rather than the other way round.
function overlapScore(candidateWords, targetWords) {
  if (!candidateWords.length) return 0;
  const targetSet = new Set(targetWords);
  const hits = candidateWords.filter((w) => targetSet.has(w)).length;
  return hits / candidateWords.length;
}

const CATEGORY_THRESHOLD = 0.5;
const SUBCATEGORY_THRESHOLD = 0.5;

// Matches a CJ category path onto our category + (best-effort) subcategory.
// subcategory is only ever set above a real confidence threshold — a wrong
// specific guess is worse than leaving it blank for the vendor to pick.
export function matchCjCategory(cjCategoryName) {
  if (!cjCategoryName) return { category: null, subcategory: null };

  const segments = String(cjCategoryName).split('/').map((s) => s.trim()).filter(Boolean);
  const pathWords = words(segments.join(' '));
  if (!pathWords.length) return { category: null, subcategory: null };

  let bestCategory = null;
  let bestCategoryScore = 0;
  for (const [id, name] of Object.entries(CATEGORY_NAMES)) {
    let score = overlapScore(words(name), pathWords);
    const keywordHit = (CATEGORY_KEYWORDS[id] || []).some((kw) => pathWords.includes(singularize(kw)));
    if (keywordHit) score = Math.max(score, 0.6);
    if (score > bestCategoryScore) {
      bestCategoryScore = score;
      bestCategory = id;
    }
  }
  if (!bestCategory || bestCategoryScore < CATEGORY_THRESHOLD) {
    return { category: null, subcategory: null };
  }

  // On a tie, prefer the more specific (more-worded) subcategory name —
  // "Laptop Stands & Accessories" over plain "Laptops" for a CJ path that
  // actually says "Laptop Stands", even though both technically match.
  let bestSub = null;
  let bestSubScore = 0;
  let bestSubWordCount = 0;
  for (const sub of SUBCATEGORIES[bestCategory] || []) {
    const subWords = words(sub);
    const score = overlapScore(subWords, pathWords);
    if (score > bestSubScore || (score === bestSubScore && score > 0 && subWords.length > bestSubWordCount)) {
      bestSubScore = score;
      bestSub = sub;
      bestSubWordCount = subWords.length;
    }
  }

  // Both add-product.js and edit-product.js store subcategory as a slug
  // (e.g. "Garden Furniture & Parasols" -> "garden-furniture-parasols"),
  // never the raw display name — matching that exact slugification here so
  // the vendor's subcategory dropdown actually selects the stored value
  // instead of silently matching nothing.
  const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  return {
    category: bestCategory,
    subcategory: bestSubScore >= SUBCATEGORY_THRESHOLD ? slugify(bestSub) : null,
  };
}
