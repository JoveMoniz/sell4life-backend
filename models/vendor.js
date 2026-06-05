import mongoose from 'mongoose';

const vendorSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },

    status: {
      type: String,
      enum: ['pending', 'approved', 'suspended'],
      default: 'pending',
    },

    approvedAt: Date,
    suspendedAt: Date,

    storeName: {
      type: String,
      required: true,
      trim: true,
    },

    storeSlug: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    storeDescription: String,
    storeLogo: String,
    storeBanner: String,

    type: {
      type: String,
      enum: ['casual', 'refurbished', 'professional', 'enterprise'],
      default: 'casual',
    },

    // Tier 2 — Refurbished
    refurbishedBadge: {
      type: Boolean,
      default: false,
    },

    // Tier 4 — Enterprise (foundation only)
    staffAccounts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    apiKey: { type: String, default: null },

    verified: {
      type: Boolean,
      default: false,
    },

    stripeAccountId: String,

    payoutEnabled: {
      type: Boolean,
      default: false,
    },

    featured: {
      type: Boolean,
      default: false,
    },

    salesCount: {
      type: Number,
      default: 0,
    },

    vatRegistered: {
      type: Boolean,
      default: false,
    },

    vatNumber: {
      type: String,
      trim: true,
      default: '',
    },

    // null = use platform/tier default; set to override commission for this vendor only
    commissionOverride: {
      type: Number,
      default: null,
      min: 0,
      max: 1,
    },

    upgradeRequest: {
      requestedAt: Date,
      requestedTier: String,
      message: String,
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
      },
    },
  },
  { timestamps: true }
);

export default mongoose.models.Vendor || mongoose.model('Vendor', vendorSchema);
