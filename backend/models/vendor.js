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

    // Vendor opts in to covering return postage for change-of-mind returns
    freeReturns: {
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

    // Business/residency country used for Stripe Connect payouts — separate
    // from taxInfo.addrCountry (free-text, HMRC-specific). Must be one of
    // stripeConnectCountries.STRIPE_CONNECT_COUNTRIES before the vendor can
    // connect Stripe; locked once stripeAccountId is set since Stripe fixes
    // an account's country permanently at creation.
    country: {
      type: String,
      default: null,
      uppercase: true,
      trim: true,
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
    commissionOverrideSetAt: {
      type: Date,
      default: null,
    },

    // ── HMRC Digital Platform Reporting ──
    reportingStatus: {
      type: String,
      enum: ['none', 'approaching', 'required'],
      default: 'none',
    },

    hmrcReporting: {
      year:             { type: Number, default: null },
      transactionCount: { type: Number, default: 0 },
      grossPayoutTotal: { type: Number, default: 0 },
    },

    taxInfoCompletedAt: { type: Date, default: null },

    taxInfo: {
      legalName:    { type: String, default: null },
      dateOfBirth:  { type: String, default: null },
      addrLine1:    { type: String, default: null },
      addrLine2:    { type: String, default: null },
      addrCity:     { type: String, default: null },
      addrPostcode: { type: String, default: null },
      addrCountry:  { type: String, default: null },
      taxIdType:    { type: String, default: null },
      taxIdValue:   { type: String, default: null },
      // EU sellers only — DAC7 wants a VAT number captured separately from
      // the TIN when the seller has one; left null for GB/HMRC vendors.
      vatId:        { type: String, default: null },
      confirmedAt:  { type: Date,   default: null },
    },

    // Encrypted supplier API credentials, keyed by providerName.
    // Values are AES-256-GCM blobs produced by taxInfoCrypto.encrypt().
    // Never expose raw values in any API response.
    supplierCredentials: {
      type:    mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Founding Seller program — set once at registration if a spot was
    // available. freeSalesLimit and rate are SNAPSHOTS of the program's
    // configured values at signup time, so a later admin change (e.g.
    // raising the cap or lowering the discount for a "wave 2") doesn't
    // retroactively change what this seller was promised.
    foundingSeller: {
      enrolled:       { type: Boolean, default: false },
      joinedAt:       { type: Date, default: null },
      freeSalesLimit: { type: Number, default: null },
      rate:           { type: Number, default: null }, // 0 = fully free; legacy enrollees (before this field existed) treated as 0 by getFoundingSellerStatus
    },
  },
  { timestamps: true }
);

export default mongoose.models.Vendor || mongoose.model('Vendor', vendorSchema);
