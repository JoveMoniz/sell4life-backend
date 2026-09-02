import mongoose from 'mongoose';

// Logged when the AI classifier (aiCategoryMatch.js) finds a product that
// genuinely doesn't fit any existing subcategory — reviewed and approved by
// hand (not auto-applied), since the taxonomy is a static, curated list that
// several other things depend on (filters, search, tag suggestions). One
// pending row per unique (category, name) pair, never duplicated.
const subcategorySuggestionSchema = new mongoose.Schema(
  {
    category: { type: String, required: true, index: true },
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

subcategorySuggestionSchema.index({ category: 1, nameLower: 1 }, { unique: true });

export default mongoose.models.SubcategorySuggestion
  || mongoose.model('SubcategorySuggestion', subcategorySuggestionSchema);
