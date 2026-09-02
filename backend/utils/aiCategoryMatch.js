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

const CATEGORY_KEYS = Object.keys(taxonomy);

// Same slug convention the old categoryMatch.js used — subcategory is
// always stored as a slug ("cycling-accessories"), never the display
// string ("Cycling Accessories"), so this stays a drop-in replacement
// for anything already reading product.subcategory.
const slugify = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

let client = null;
function getClient() {
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
});

function taxonomyPromptBlock() {
  return CATEGORY_KEYS.map((cat) => `${cat}: ${taxonomy[cat].join(' | ')}`).join('\n');
}

const SYSTEM_PROMPT = `You are a product categorization assistant for a UK online marketplace. Given a product's title, pick the single best-fitting category, and — only if you are genuinely confident — a subcategory copied exactly from that category's list below.

Do not force-fit a product into a subcategory that's only a loose or tangential match just because it's the closest thing on the list — a wrong subcategory is worse than none. If nothing on the list is a genuinely good fit for the category you picked, leave subcategory null and consider proposing a new one instead (see below), rather than picking the least-bad existing option.

If, and only if, no existing subcategory in your chosen category is a genuinely good fit: first double-check whether this is really just a reword of something already on the list (e.g. "Cycling Bags" is the same real thing as "Cycling Accessories" — don't propose it in that case). Otherwise, if you can name a clear, commonly-recognized product type this actually is that isn't covered, propose ONE concise new subcategory name in suggestedNewSubcategory, Title Case, matching the style of the existing list (e.g. "Bike Panniers & Bags", "Beekeeping Equipment", "Metal Detecting"). If you genuinely can't tell from the title alone (too generic/short), leave both subcategory and suggestedNewSubcategory null rather than guessing either way. Never propose a new subcategory when subcategory above is already filled in.

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

  let subcategory = null;
  if (parsed.subcategory) {
    const validSubs = taxonomy[parsed.category] || [];
    const match = validSubs.find((s) => s.toLowerCase() === parsed.subcategory.toLowerCase());
    if (match) subcategory = slugify(match);
  }

  if (!subcategory && parsed.suggestedNewSubcategory) {
    logSubcategorySuggestion(parsed.category, parsed.suggestedNewSubcategory, clean, product);
  }

  return { category: parsed.category, subcategory };
}

// Fire-and-forget — a logging failure must never break the actual
// classification result the caller is waiting on.
async function logSubcategorySuggestion(category, name, title, product) {
  try {
    const { default: SubcategorySuggestion } = await import('../models/subcategorySuggestion.js');
    const normalized = String(name).trim();
    await SubcategorySuggestion.findOneAndUpdate(
      { category, nameLower: normalized.toLowerCase() },
      {
        $setOnInsert: { category, name: normalized, nameLower: normalized.toLowerCase(), status: 'pending' },
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
    console.error('[aiCategoryMatch] failed to log subcategory suggestion:', err.message);
  }
}
