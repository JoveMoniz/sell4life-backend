// ======================================================
// AI LISTING GENERATION — writes title, short description, full
// description, bullet points and category/subcategory for a product from
// its existing (usually CJ-supplied) title/description plus its own
// already-synced photos. Same Claude call shape as aiCategoryMatch.js, but
// claude-sonnet-5 instead of Haiku (this is buyer-facing marketing copy,
// not a single-label classification) and vision-enabled — reuses that
// file's taxonomy/validation/suggestion-logging helpers rather than
// re-implementing category matching a second time.
// ======================================================
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import {
  CATEGORY_KEYS,
  getClient,
  taxonomyPromptBlock,
  validateSubcategory,
  logTaxonomySuggestion,
} from './aiCategoryMatch.js';

// CJ's download domain 403s without this Referer on video; harmless to send
// on image requests too if it turns out not to be required there — see
// cjProductSync.js's rehostVideoOnCloudinary() for the original case.
const CJ_REFERER = 'https://developers.cjdropshipping.com';
const MAX_IMAGES = 3;

const ListingSchema = z.object({
  name: z.string(),
  shortDescription: z.string(),
  description: z.string(),
  // Plain newline-delimited bullet lines, no leading "-"/"•" — this is the
  // only format the storefront reads (product.js: bulletPoints.split(/\n/)).
  bulletPoints: z.string(),
  category: z.enum(CATEGORY_KEYS),
  subcategory: z.string().nullable(),
  suggestedNewSubcategory: z.string().nullable(),
  suggestedTags: z.array(z.string()).nullable(),
  suggestedNewCategory: z.string().nullable(),
});

const SYSTEM_PROMPT = `You are a listing copywriter for a UK online marketplace. You'll be given a supplier's raw product title (and sometimes raw spec-sheet text) plus one or more real photos of the product. Write a completely fresh, buyer-facing listing from these — do not just copy or lightly edit the supplier text, which is often awkward machine-translated or keyword-stuffed wording.

Write:
- name: a clear, natural product title a UK shopper would actually search for and trust — no ALL CAPS, no keyword-stuffing, no emoji, include the real brand/model only if visible in the photos or title (never invent one).
- shortDescription: one or two punchy sentences, the kind shown right under the price.
- description: a fuller paragraph (or a few short paragraphs) covering what it is, what it's for, and genuinely useful detail visible from the photos or text — no invented technical specs you can't actually see or infer.
- bulletPoints: 4-7 short buyer-benefit lines, one per line, no bullet marker characters (the site adds its own) — key features/materials/what's included, each grounded in the photos or supplied text.

Then pick a category and, if genuinely confident, a subcategory, using the same rules as classification: always pick one of the 17 categories below (imperfect is fine, "other" is the catch-all); only fill subcategory when it's a clear match copied exactly from that category's list; never force a loose fit. If nothing fits, first check suggestedNewSubcategory isn't just a reword of an existing one, then propose ONE new one Title Case with 8-15 realistic lowercase UK buyer search terms in suggestedTags. suggestedNewCategory should almost never fire — only if this is a whole recognizable product family none of the 17 cover.

If the photos and text together don't give you enough to say something truthful and specific, keep it simple and honest rather than inventing detail.

Categories and their subcategories:
${taxonomyPromptBlock()}`;

// Claude's vision API accepts exactly these 4 media types — anything else
// (bmp, svg, x-icon, or a supplier CDN mislabeling a file) makes the WHOLE
// request 400, not just that one image, so this must be an exact allowlist,
// not merely "starts with image/".
const ANTHROPIC_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);

async function fetchImageAsBase64(url) {
  try {
    const res = await fetch(url, { headers: { Referer: CJ_REFERER } });
    if (!res.ok) return null;
    const contentType = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (!ANTHROPIC_IMAGE_TYPES.has(contentType)) return null;
    const buf = await res.arrayBuffer();
    if (!buf.byteLength || buf.byteLength > 5 * 1024 * 1024) return null;
    return { mediaType: contentType, data: Buffer.from(buf).toString('base64') };
  } catch (_) {
    return null;
  }
}

// {name, shortDescription, description, bulletPoints, category, subcategory}
// on success, or null if Claude returned nothing usable. `product` needs at
// least name/description/images; only used for prompt context and (like
// aiCategoryMatch.js) attaching context to any logged taxonomy suggestion.
export async function generateProductListingAI(product) {
  const title = String(product?.name || '').trim();
  const rawDescription = String(product?.description || '').trim();
  if (!title) return null;

  const imageUrls = (Array.isArray(product?.images) ? product.images : []).slice(0, MAX_IMAGES);
  const fetchedImages = (await Promise.all(imageUrls.map(fetchImageAsBase64))).filter(Boolean);

  const textParts = [`Supplier's raw title (rewrite, don't copy): "${title}"`];
  if (rawDescription) {
    textParts.push(`Supplier's raw description/spec text (reference only, rewrite, don't copy): "${rawDescription.slice(0, 2000)}"`);
  }
  if (!fetchedImages.length) {
    textParts.push('(No usable product photos were available — write from the text alone, and keep description/bullets conservative rather than guessing details you can\'t see.)');
  }

  const content = [
    { type: 'text', text: textParts.join('\n\n') },
    ...fetchedImages.map((img) => ({
      type: 'image',
      source: { type: 'base64', media_type: img.mediaType, data: img.data },
    })),
  ];

  const response = await getClient().messages.parse({
    model: 'claude-sonnet-5',
    max_tokens: 1500,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content }],
    output_config: { format: zodOutputFormat(ListingSchema) },
  });

  const parsed = response.parsed_output;
  if (!parsed) return null;

  const subcategory = validateSubcategory(parsed.category, parsed.subcategory);

  if (!subcategory && parsed.suggestedNewSubcategory) {
    logTaxonomySuggestion({
      level: 'subcategory',
      category: parsed.category,
      name: parsed.suggestedNewSubcategory,
      tags: parsed.suggestedTags,
      title,
      product,
    });
  }

  if (parsed.suggestedNewCategory) {
    logTaxonomySuggestion({
      level: 'category',
      category: null,
      name: parsed.suggestedNewCategory,
      tags: null,
      title,
      product,
    });
  }

  return {
    name: parsed.name.trim(),
    shortDescription: parsed.shortDescription.trim(),
    description: parsed.description.trim(),
    bulletPoints: parsed.bulletPoints.trim(),
    category: parsed.category,
    subcategory,
  };
}
