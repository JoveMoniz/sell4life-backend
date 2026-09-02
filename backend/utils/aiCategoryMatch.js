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
});

function taxonomyPromptBlock() {
  return CATEGORY_KEYS.map((cat) => `${cat}: ${taxonomy[cat].join(' | ')}`).join('\n');
}

const SYSTEM_PROMPT = `You are a product categorization assistant for a UK online marketplace. Given a product's title, pick the single best-fitting category, and — only if you are genuinely confident — a subcategory copied exactly from that category's list below. If no subcategory clearly fits (e.g. the title is too generic or short), return null for subcategory rather than guessing. Never invent a category or subcategory that isn't in this list.

Categories and their subcategories:
${taxonomyPromptBlock()}`;

// Same shape as categoryMatch.js's matchProductTitle() — {category, subcategory}
// — so it's a drop-in replacement wherever that was called.
export async function matchProductTitleAI(title) {
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

  return { category: parsed.category, subcategory };
}
