// ======================================================
// AI-BASED CATEGORY MATCHING — replaces the old word-overlap approach
// (categoryMatch.js) with a real Claude classification call. A keyword
// table can never understand "Rubber duck" means Toys or that "book"
// means Books; real language understanding fixes that whole class of
// failure in one move. See project memory (category-rematch-unresolved)
// for the full history of why the old approach was replaced.
// ======================================================
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

const here = path.dirname(fileURLToPath(import.meta.url));
const taxonomy = JSON.parse(
  fs.readFileSync(path.join(here, '../data/productSubcategories.json'), 'utf8')
);

export const CATEGORY_KEYS = Object.keys(taxonomy);
export { taxonomy };

// Same slug convention the old categoryMatch.js used — subcategory is
// always stored as a slug ("cycling-accessories"), never the display
// string ("Cycling Accessories"), so this stays a drop-in replacement
// for anything already reading product.subcategory.
export const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

let client = null;
export function getClient() {
  if (!client) client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  return client;
}

const ClassificationSchema = z.object({
  category: z.enum(CATEGORY_KEYS),
  // Intentionally a plain nullable string, not a per-category enum — Claude
  // is instructed to copy a subcategory verbatim from the list for its
  // chosen category, or null. The real safety guarantee is the post-check
  // below, which never trusts this string without confirming it's an
  // actual member of that category's list.
  subcategory: z.string().nullable(),
  // Only meaningful when subcategory is null — a candidate new subcategory
  // name, proposed only after Claude has already checked it isn't just a
  // reword of something already in the list. Logged for human review, never
  // applied automatically. See models/subcategorySuggestion.js.
  suggestedNewSubcategory: z.string().nullable(),
  // Only meaningful alongside suggestedNewSubcategory — realistic buyer
  // search terms for that proposed subcategory, same style as the existing
  // hand-written tag lists (frontend/assets/js/vendor-add-product.js's
  // TAG_SUGGESTIONS), so an approved subcategory doesn't start with zero
  // tag suggestions for vendors.
  suggestedTags: z.array(z.string()).nullable(),
  // category above is always one of the real 17 (a product needs a working
  // category to function on the site) — this is a separate, much rarer
  // signal that even the best of those 17 was a poor fit, with a proposed
  // new top-level category name. Unlike subcategory, this should almost
  // never fire: 17 categories plus "other" as a catch-all already covers
  // nearly everything a marketplace like this would sell.
  suggestedNewCategory: z.string().nullable(),
});

export function taxonomyPromptBlock() {
  return CATEGORY_KEYS.map((cat) => `${cat}: ${taxonomy[cat].join(' | ')}`).join('\n');
}

// Validates a Claude-proposed subcategory string against the real taxonomy
// list for the given category — never trust the string verbatim, only a
// confirmed case-insensitive match against an actual list member. Shared
// with aiListingGenerate.js so both callers apply the exact same safety
// check instead of two copies drifting apart.
export function validateSubcategory(category, proposedSubcategory) {
  if (!proposedSubcategory) return null;
  const validSubs = taxonomy[category] || [];
  const match = validSubs.find((s) => s.toLowerCase() === proposedSubcategory.toLowerCase());
  return match ? slugify(match) : null;
}

const SYSTEM_PROMPT = `You are a product categorization assistant for a UK online marketplace. Given a product's title, pick the single best-fitting category (you must always pick one of the 17 below, even if imperfect — "other" is the catch-all for anything that doesn't fit elsewhere), and — only if you are genuinely confident — a subcategory copied exactly from that category's list below.

Separately: if you genuinely believe NONE of the 17 categories (including "other") capture what this product family really is — not just this one item, but a whole recognizable class of products that would keep coming up — propose a concise new top-level category name in suggestedNewCategory, Title Case (e.g. "Musical Instruments" if that were missing). This should be rare. Do not propose one just because a subcategory is missing — that's what suggestedNewSubcategory below is for. Leave suggestedNewCategory null in almost every case.

Do not force-fit a product into a subcategory that's only a loose or tangential match just because it's the closest thing on the list — a wrong subcategory is worse than none. If nothing on the list is a genuinely good fit for the category you picked, leave subcategory null and consider proposing a new one instead (see below), rather than picking the least-bad existing option.

If, and only if, no existing subcategory in your chosen category is a genuinely good fit: first double-check whether this is really just a reword of something already on the list (e.g. "Cycling Bags" is the same real thing as "Cycling Accessories" — don't propose it in that case). Otherwise, if you can name a clear, commonly-recognized product type this actually is that isn't covered, propose ONE concise new subcategory name in suggestedNewSubcategory, Title Case, matching the style of the existing list (e.g. "Bike Panniers & Bags", "Beekeeping Equipment", "Metal Detecting") — and when you do, also fill suggestedTags with 8-15 realistic lowercase buyer search terms for that subcategory (the same style a UK shopper would type into a search box — e.g. for "Metal Detecting": "metal detector", "treasure hunting", "gold detector", "metal detecting accessories"). If you genuinely can't tell from the title alone (too generic/short), leave subcategory, suggestedNewSubcategory, and suggestedTags all null rather than guessing. Never propose a new subcategory or tags when subcategory above is already filled in.

Categories and their subcategories:
${taxonomyPromptBlock()}`;

// Same shape as categoryMatch.js's matchProductTitle() — {category, subcategory}
// — so it's a drop-in replacement wherever that was called. `product` (optional)
// is only used to attach context to a logged suggestion, never for matching.
export async function matchProductTitleAI(title, product = null) {
  const clean = String(title || '').trim();
  if (!clean) return { category: null, subcategory: null };

  const response = await getClient().messages.parse({
    model: 'claude-haiku-4-5',
    max_tokens: 256,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Product title: "${clean}"` }],
    output_config: { format: zodOutputFormat(ClassificationSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) return { category: null, subcategory: null };

  const subcategory = validateSubcategory(parsed.category, parsed.subcategory);

  if (!subcategory && parsed.suggestedNewSubcategory) {
    logTaxonomySuggestion({
      level: 'subcategory',
      category: parsed.category,
      name: parsed.suggestedNewSubcategory,
      tags: parsed.suggestedTags,
      title: clean,
      product,
    });
  }

  if (parsed.suggestedNewCategory) {
    logTaxonomySuggestion({
      level: 'category',
      category: null,
      name: parsed.suggestedNewCategory,
      tags: null,
      title: clean,
      product,
    });
  }

  return { category: parsed.category, subcategory };
}

// Fire-and-forget — a logging failure must never break the actual
// classification result the caller is waiting on.
export async function logTaxonomySuggestion({ level, category, name, tags, title, product }) {
  try {
    const { default: SubcategorySuggestion } = await import('../models/subcategorySuggestion.js');
    const normalized = String(name).trim();
    const cleanTags = Array.isArray(tags)
      ? [...new Set(tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 20)
      : [];
    await SubcategorySuggestion.findOneAndUpdate(
      { level, category, nameLower: normalized.toLowerCase() },
      {
        // Set once, only on first sighting — tags shouldn't drift between
        // repeat sightings of the same proposed name.
        $setOnInsert: {
          level,
          category,
          name: normalized,
          nameLower: normalized.toLowerCase(),
          status: 'pending',
          suggestedTags: cleanTags,
        },
        $push: {
          examples: {
            $each: [{ productId: product?._id, title: product?.name || title }],
            $slice: -5,
          },
        },
      },
      { upsert: true }
    );
  } catch (err) {
    console.error('[aiCategoryMatch] failed to log taxonomy suggestion:', err.message);
  }
}
