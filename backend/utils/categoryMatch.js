// ======================================================
// CATEGORY MATCHING — from a product title, or from CJ's category path
// CJ's own category taxonomy (returned as a "/"-separated path like
// "Home & Garden / Home Storage / Home Office Storage") is often too
// generic to reflect what a product actually is — CJ suppliers frequently
// dump small accessories under broad buckets like "Home & Garden"
// regardless of real use ("Bike Top Tube Bag" landed under
// "Home > Office & Study Furniture"). A product's own title is a much
// stronger signal ("Water-Resistant Bike Top Tube Bag" is unambiguous), so
// matchProductTitle() is tried first; matchCjCategory() (CJ's path) is
// only a fallback when the title itself doesn't score above threshold.
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

// Real product titles use much richer, more specific vocabulary than CJ's
// coarse category paths ("Bike Top Tube Bag" vs just "Home & Garden") —
// these lists are deliberately broad so a title's own words can pull it
// toward the right category even when CJ's own path is generic or wrong.
const CATEGORY_KEYWORDS = {
  electronics: ['computer', 'laptop', 'pc', 'phone', 'cellphone', 'smartphone', 'tablet', 'tech', 'gadget',
    'digital', 'camera', 'headphone', 'earphone', 'earbud', 'speaker', 'charger', 'cable', 'adapter',
    'monitor', 'keyboard', 'mouse', 'printer', 'router', 'drive', 'ssd', 'hdd', 'battery', 'powerbank',
    'smartwatch', 'television', 'tv', 'projector', 'microphone', 'webcam', 'usb', 'bluetooth', 'wireless',
    'led', 'hdmi', 'consol', 'console', 'controller', 'gimbal', 'tripod', 'lens', 'scanner', 'modem',
    'converter', 'amplifier', 'transmitter', 'receiver'],
  automotive:  ['car', 'vehicle', 'auto', 'tyre', 'tire', 'motorcycle', 'motorbike', 'dashboard', 'dashcam',
    'wheel', 'engine', 'windshield', 'bumper', 'exhaust', 'brake', 'suspension', 'headlight', 'taillight',
    'steering', 'seatcover', 'gps', 'obd'],
  health:      ['beauty', 'cosmetic', 'skincare', 'makeup', 'wellness', 'massage', 'shaver', 'razor',
    'toothbrush', 'supplement', 'vitamin', 'facial', 'skin', 'nail', 'cream', 'lotion', 'serum', 'perfume',
    'fragrance', 'lipstick', 'mascara', 'brush', 'hairdryer', 'straightener', 'trimmer', 'epilator', 'thermometer'],
  home:        ['kitchen', 'furniture', 'garden', 'household', 'storage', 'organizer', 'organiser', 'shelf',
    'shelving', 'rack', 'decor', 'curtain', 'bedding', 'pillow', 'cushion', 'lamp', 'bathroom', 'towel',
    'rug', 'mat', 'vase', 'candle', 'cookware', 'utensil', 'appliance', 'sofa', 'chair', 'table', 'mattress',
    'wardrobe', 'drawer', 'cabinet', 'blanket', 'duvet', 'mirror', 'clock', 'basket', 'hanger', 'hook',
    'holder', 'stand', 'bin', 'dispenser', 'mop', 'broom', 'vacuum', 'planter', 'plant', 'fan', 'heater',
    'humidifier', 'diffuser', 'nightlight', 'mug', 'cup', 'plate', 'bowl', 'cutlery', 'kettle', 'teapot',
    'tumbler', 'jug', 'tray', 'saucepan', 'pan', 'pot', 'chopping board', 'oven', 'fridge', 'refrigerator'],
  sports:      ['fitness', 'outdoor', 'gym', 'cycling', 'bike', 'bicycle', 'camping', 'hiking', 'yoga',
    'running', 'football', 'basketball', 'tennis', 'golf', 'swim', 'swimming', 'ski', 'fishing', 'helmet',
    'workout', 'exercise', 'sport', 'saddle', 'pedal', 'dumbbell', 'resistance', 'treadmill', 'skateboard',
    'tent', 'backpacking', 'climbing', 'boxing', 'badminton', 'volleyball', 'archery', 'kayak', 'surf'],
  toys:        ['hobby', 'hobbies', 'puzzle', 'game', 'lego', 'doll', 'figure', 'rc', 'drone', 'toy',
    'building block', 'plush', 'kite', 'slime', 'boardgame'],
  // Deliberately NOT 'kids'/'children' — those describe an intended
  // audience, not a product type, and would otherwise outrank the actual
  // product-type keyword on plenty of non-baby items ("Kids Educational
  // Building Block Toy Set" wrongly matched baby over toys via "kids").
  // 'infant'/'toddler' stay — those are baby-gear-specific in practice.
  baby:        ['infant', 'toddler', 'stroller', 'pram', 'diaper', 'nappy', 'crib',
    'pacifier', 'baby', 'bib', 'teether', 'babyproof', 'highchair', 'carrier', 'nursery'],
  pets:        ['dog', 'cat', 'pet', 'leash', 'collar', 'aquarium', 'kennel', 'litter', 'feeder', 'chew',
    'harness', 'terrarium', 'birdcage'],
  arts:        ['craft', 'paint', 'brush', 'canvas', 'sewing', 'knitting', 'yarn', 'drawing', 'sketch',
    'calligraphy', 'embroidery', 'glue', 'glitter', 'scrapbook', 'origami', 'beading'],
  office:      ['stationery', 'pen', 'pencil', 'notebook', 'desk', 'folder', 'binder', 'office', 'stapler',
    'eraser', 'marker', 'highlighter', 'whiteboard', 'calculator', 'planner', 'diary'],
  // Deliberately NOT 'vintage'/'retro' — those are near-universal STYLE
  // adjectives ("vintage wallet", "retro lamp") used across fashion, home
  // decor etc. far more often than they mean an actual antique/collectible
  // item, and wrongly outranked the real product type ("Vintage Leather
  // Wallet" matched antiques over fashion via "vintage" alone).
  antiques:    ['collectible', 'antique', 'coin', 'stamp', 'memorabilia'],
  travel:      ['luggage', 'suitcase', 'backpack', 'passport', 'travel', 'duffel', 'carryon', 'trolley'],
  software:    ['digital', 'app', 'license', 'licence', 'subscription', 'software', 'download', 'key'],
  fashion:     ['clothing', 'shirt', 'dress', 'shoe', 'jewelry', 'jewellery', 'watch', 'sunglasses', 'hat',
    'scarf', 'glove', 'jacket', 'coat', 'trouser', 'jean', 'skirt', 'sock', 'belt', 'wallet', 'handbag',
    'purse', 'necklace', 'bracelet', 'earring', 'ring', 'legging', 'hoodie', 'sweater', 'sneaker', 'boot',
    'sandal', 'heel', 'lingerie', 'swimwear', 'bikini'],
  food:        ['snack', 'drink', 'tea', 'coffee', 'spice', 'sauce', 'food', 'chocolate', 'candy', 'beverage',
    'seasoning', 'condiment'],
  books:       ['book', 'novel', 'magazine', 'textbook', 'ebook', 'journal', 'comic', 'dictionary',
    'notebook', 'diary', 'planner', 'cookbook', 'audiobook', 'manga'],
};

const STOPWORDS = new Set(['and', 'the', 'for', 'with', 'of', 'a', 'an', 'to', 'in', 'on']);

// "Mountain Bike Phone Mount Handlebar Holder" contains both words of the
// subcategory "Mountain Bikes" — a perfect, unbeatable overlap score —
// even though the product is an accessory FOR a mountain bike, not the
// bike itself. Same failure for "Laptop Stand" vs bare "Laptops". When a
// title contains one of these words, subcategory matching only considers
// candidates that ALSO contain an accessory word — "Cycling Accessories"
// or "Laptop Stands & Accessories" over "Mountain Bikes"/"Laptops" — so a
// whole-product subcategory can't win just because its name happens to be
// a substring of a longer accessory title.
// Deliberately narrow — each of these is only rarely the core product
// itself. Broader-seeming words like 'mat', 'bag', 'case', 'rack', 'pad',
// 'tray' or 'hook' were tried and reverted: they're too often the actual
// product ("Yoga Mat", "Tote Bag", "Shoe Rack", "Pencil Case" are all
// standalone products, not accessories for something else), and wrongly
// suppressed their own correct whole-product subcategory match.
const ACCESSORY_WORDS = new Set(['mount', 'holder', 'stand', 'kit', 'adapter', 'adaptor', 'clip', 'strap',
  'cover', 'sleeve', 'dock', 'guard', 'protector', 'accessory', 'accessories', 'part', 'spare', 'replacement',
  // 'bag' re-added: "Mountain Bike Saddle Bag" was still matching whole-
  // vehicle "Mountain Bikes" since 'bag' wasn't triggering the accessory
  // filter. A standalone bag product ("Tote Bag") isn't hurt by this —
  // that only affects which subcategory wins WITHIN the category already
  // chosen; it doesn't change the category itself.
  'bag']);

// Crude singular/plural fold ("creams" -> "cream", "phones" -> "phone") so
// "Face Creams" matches "Face Cream" — CJ's and our own naming rarely agree
// on plurality even when they mean the same thing. Left alone below length
// 4 so short real words ("gas", "bus") don't get mangled.
function singularize(word) {
  // length > 3 (not > 4): protects real 3-letter words ending in 's'
  // ("gas", "bus") from being mangled, while still folding 4-letter
  // plurals like "mats"/"pans"/"pots"/"rugs" — the previous > 4 threshold
  // silently left EVERY 4-letter plural unsingularized, so a title saying
  // "Yoga Mat" (singular) could never match a subcategory named "Yoga
  // Mats & Accessories" (plural) even though they're obviously the same
  // word.
  if (word.length <= 3 || !word.endsWith('s')) return word;
  // "-ies" -> "-y" ("accessories" -> "accessory", "batteries" -> "battery")
  // — the old plain slice(0,-1) produced "accessorie"/"batterie", which
  // then silently failed to match anything (e.g. an ACCESSORY_WORDS check
  // for "accessory" never fired since the real value was "accessorie").
  if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
  return word.slice(0, -1);
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
// longer path (CJ's, or a product title), rather than the other way round.
function overlapScore(candidateWords, targetWords) {
  if (!candidateWords.length) return 0;
  const targetSet = new Set(targetWords);
  const hits = candidateWords.filter((w) => targetSet.has(w)).length;
  return hits / candidateWords.length;
}

const CATEGORY_THRESHOLD = 0.5;
// Higher than CATEGORY_THRESHOLD deliberately: most of our subcategory
// names are only 2 words (e.g. "Cycling Helmets", "Road Bikes"), so at 0.5
// a SINGLE shared generic word — like "cycling", which every "Cycling ___"
// subcategory under Sports shares — was enough to hit the threshold. With
// many sibling subcategories tying on that same lone word, whichever one
// happened to iterate first won essentially at random (confirmed: "Bicycle
// Frame Bag" matched "Cycling Helmets", "Bike Bags" matched "Road Bikes").
// 0.6 requires a real majority of a subcategory's own words to be present,
// not just its parent category's word — a 2-word name now needs both
// words, not one.
const SUBCATEGORY_THRESHOLD = 0.6;

// Both add-product.js and edit-product.js store subcategory as a slug
// (e.g. "Garden Furniture & Parasols" -> "garden-furniture-parasols"),
// never the raw display name — matching that exact slugification so the
// vendor's subcategory dropdown actually selects the stored value instead
// of silently matching nothing.
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

// Shared scoring core — matches a bag of words (from either a CJ category
// path or a product title) onto our category + (best-effort) subcategory.
// subcategory is only ever set above a real confidence threshold — a wrong
// specific guess is worse than leaving it blank for the vendor to pick.
function matchWords(targetWords) {
  if (!targetWords.length) return { category: null, subcategory: null };

  // A title genuinely about a category tends to mention SEVERAL of its
  // keywords ("Cable Organizer With Phone Stand" hits both "cable" and
  // "phone" for electronics), while an incidental feature mention is
  // usually just one word ("...with Touchscreen Phone Holder" on an
  // otherwise bike-related title) — so more distinct keyword hits scores
  // higher, rather than every hit flattening to the same 0.6. When two
  // categories still tie (equal hit count, e.g. exactly one keyword each),
  // fall back to whichever match appears EARLIEST in the source words —
  // titles conventionally lead with the core item and trail off into
  // secondary features — rather than whichever category happens to be
  // listed first in CATEGORY_NAMES.
  let bestCategory = null;
  let bestCategoryScore = 0;
  let bestCategoryPos = Infinity;
  for (const [id, name] of Object.entries(CATEGORY_NAMES)) {
    let score = overlapScore(words(name), targetWords);
    const nameWords = new Set(words(name));
    let pos = targetWords.findIndex((w) => nameWords.has(w));
    const hitKeywords = (CATEGORY_KEYWORDS[id] || []).filter((kw) => targetWords.includes(singularize(kw)));
    if (hitKeywords.length) {
      const keywordScore = 0.55 + 0.05 * Math.min(hitKeywords.length, 4);
      const firstHitPos = Math.min(...hitKeywords.map((kw) => targetWords.indexOf(singularize(kw))));
      if (score < keywordScore) { score = keywordScore; pos = firstHitPos; }
      else if (pos === -1 || firstHitPos < pos) { pos = firstHitPos; }
    }
    if (pos === -1) pos = Infinity;
    if (score > bestCategoryScore || (score === bestCategoryScore && pos < bestCategoryPos)) {
      bestCategoryScore = score;
      bestCategoryPos = pos;
      bestCategory = id;
    }
  }
  if (!bestCategory || bestCategoryScore < CATEGORY_THRESHOLD) {
    return { category: null, subcategory: null };
  }

  // Primary pass: plain word-overlap fraction (unchanged from the original
  // design) — on a tie, prefer the more specific (more-worded) subcategory
  // name ("Laptop Stands & Accessories" over plain "Laptops" for a path
  // that actually says "Laptop Stands", even though both technically match).
  const allSiblings = SUBCATEGORIES[bestCategory] || [];
  // If the title itself signals "this is an accessory/part", restrict
  // candidates to subcategories that are themselves accessory-flavored —
  // unless none exist in this category, in which case there's nothing
  // better to fall back to.
  const titleIsAccessory = targetWords.some((w) => ACCESSORY_WORDS.has(w));
  const accessorySiblings = titleIsAccessory
    ? allSiblings.filter((s) => words(s).some((w) => ACCESSORY_WORDS.has(w)))
    : [];
  const siblings = accessorySiblings.length ? accessorySiblings : allSiblings;
  let bestSub = null;
  let bestSubScore = 0;
  let bestSubWordCount = 0;
  for (const sub of siblings) {
    const subWords = words(sub);
    const score = overlapScore(subWords, targetWords);
    if (score > bestSubScore || (score === bestSubScore && score > 0 && subWords.length > bestSubWordCount)) {
      bestSubScore = score;
      bestSub = sub;
      bestSubWordCount = subWords.length;
    }
  }

  // A "distinctive single word" fallback pass was tried here (to catch
  // paired subcategory names like "Glasses & Mugs" where a title only
  // mentions one half) and then REMOVED: verified against a real 40-product
  // batch, it recovered a few good matches ("mug" -> Glasses & Mugs) but
  // also produced confident wrong ones on ordinary ambiguous words — "tube"
  // is unique to "Resistance Bands & Tubes" within Sports, so "Bike...
  // Upper Tube Bag" (a bike frame part) matched fitness resistance tubes;
  // "hand" similarly pulled "Vacuum Storage Bags...Hand Pump" into "Hand
  // Tools". Being unique WITHIN our own subcategory list says nothing
  // about being unambiguous in real language. Leaving subcategory blank
  // for the vendor to pick is better than a confident wrong guess, so only
  // the primary (0.6 overlap) pass above is trusted now.

  return {
    category: bestCategory,
    subcategory: bestSubScore >= SUBCATEGORY_THRESHOLD ? slugify(bestSub) : null,
  };
}

export function matchCjCategory(cjCategoryName) {
  if (!cjCategoryName) return { category: null, subcategory: null };
  const segments = String(cjCategoryName).split('/').map((s) => s.trim()).filter(Boolean);
  return matchWords(words(segments.join(' ')));
}

// Matches a product's own title/name onto our category + subcategory —
// tried before matchCjCategory() (see file header for why).
export function matchProductTitle(title) {
  if (!title) return { category: null, subcategory: null };
  return matchWords(words(title));
}
