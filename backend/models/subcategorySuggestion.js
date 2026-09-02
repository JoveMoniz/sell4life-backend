import mongoose from 'mongoose';

// Logged when the AI classifier (aiCategoryMatch.js) finds a product that
// genuinely doesn't fit any existing subcategory (level:'subcategory'), or —
// far rarer — doesn't really belong in any of the 17 top-level categories at
// all (level:'category') — reviewed and approved by hand (not auto-applied),
// since the taxonomy is a static, curated list that several other things
// depend on (filters, search, tag suggestions, site navigation). One pending
// row per unique (level, category, name), never duplicated. For a
// level:'category' row, `category` is null — `name` is the proposed new
// top-level category itself.
const subcategorySuggestionSchema = new mongoose.Schema(
  {
    level: {
      type: String,
      enum: ['category', 'subcategory'],
      default: 'subcategory',
      index: true,
    },
    // Required for level:'subcategory' (which existing category it belongs
    // under); null for level:'category' (there's no parent — it IS the
    // proposal). Not marked schema-required since that split depends on level.
    category: { type: String, default: null, index: true },
    name: { type: String, required: true, trim: true },
    // Lowercased dedup key — MongoDB's default string uniqueness is
    // case-sensitive, and the AI's exact casing/wording can vary slightly
    // run to run even for the same real gap in the taxonomy.
    nameLower: { type: String, required: true, trim: true, lowercase: true },

    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
      index: true,
    },

    // AI-proposed tags for this subcategory, same style as the hand-written
    // TAG_SUGGESTIONS lists in frontend/assets/js/vendor-add-product.js — so
    // an approved subcategory doesn't start with zero tag suggestions.
    suggestedTags: { type: [String], default: [] },

    // A few real examples of what triggered this, for review context —
    // capped rather than growing unbounded if the same gap keeps recurring.
    examples: [
      {
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        title: String,
        seenAt: { type: Date, default: Date.now },
      },
    ],

    reviewedAt: Date,
  },
  { timestamps: true }
);

subcategorySuggestionSchema.index({ level: 1, category: 1, nameLower: 1 }, { unique: true });

export default mongoose.models.SubcategorySuggestion
  || mongoose.model('SubcategorySuggestion', subcategorySuggestionSchema);
