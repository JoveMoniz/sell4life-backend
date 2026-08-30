import mongoose from 'mongoose';

const platformConfigSchema = new mongoose.Schema(
  {
    // Singleton key — only one document ever exists
    _key: { type: String, default: 'global', unique: true },

    // Default commission for all vendors
    commissionDefault:    { type: Number, default: 0.08, min: 0, max: 1 },
    commissionDefaultSetAt: { type: Date, default: null },

    // Per-tier commission overrides (null = fall back to commissionDefault)
    commissionByTier: {
      casual:       { type: Number, default: null },
      refurbished:  { type: Number, default: null },
      professional: { type: Number, default: null },
      enterprise:   { type: Number, default: null },
    },
    // When each tier rate was last changed
    commissionByTierSetAt: {
      casual:       { type: Date, default: null },
      refurbished:  { type: Date, default: null },
      professional: { type: Date, default: null },
      enterprise:   { type: Date, default: null },
    },

    // Reviews & ratings
    reviewsEnabled:   { type: Boolean, default: false },
    reviewsMinCount:  { type: Number, default: 3, min: 1 },

    // Blocks real checkout for any non-GB vendor until DAC7 (EU digital
    // platform reporting) registration is sorted — a vendor can still sign
    // up and list from an EU country, this only stops a real transaction
    // from completing, since that's what starts the registration clock.
    euSellingEnabled: { type: Boolean, default: false },

    // Founding Seller program — discounts commission (rate, default 0 =
    // fully free) for each seller's first N sales, for the first `cap`
    // sellers overall. `claimed` is an atomic counter (claimed via
    // findOneAndUpdate + $lt guard at signup), the source of truth for the
    // public "spots remaining" display. `rate` and `freeSalesByTier` are
    // snapshotted onto each vendor at signup (Vendor.foundingSeller), so
    // raising the cap or changing the rate here only affects new signups
    // from that point on — e.g. run a "wave 2" at a lower discount (not
    // necessarily 0%) once the current wave's cap is reached, without
    // retroactively changing what earlier Founding Sellers were promised.
    foundingSeller: {
      cap:     { type: Number, default: 50, min: 0 },
      claimed: { type: Number, default: 0, min: 0 },
      rate:    { type: Number, default: 0, min: 0, max: 1 },
      freeSalesByTier: {
        casual:       { type: Number, default: 10, min: 0 },
        refurbished:  { type: Number, default: 10, min: 0 },
        professional: { type: Number, default: 30, min: 0 },
        enterprise:   { type: Number, default: 30, min: 0 },
      },
    },

    // Marketing/lifecycle emails — the delayed "got stuff to sell?"
    // seller-invite worker (welcome email on signup is unconditional and
    // not covered here). Country is an ISO code ('' = no restriction).
    marketingEmails: {
      sellerInviteEnabled:    { type: Boolean, default: true },
      sellerInviteDelayDays:  { type: Number, default: 2, min: 0 },
      sellerInviteCountry:    { type: String, default: 'GB' },
    },

    // Reserve rates
    reserveRateStandard:    { type: Number, default: 0.10, min: 0, max: 1 },
    reserveRateStandardSetAt: { type: Date, default: null },
    reserveRateTrusted:     { type: Number, default: 0.05, min: 0, max: 1 },
    reserveRateTrustedSetAt:  { type: Date, default: null },
    reserveTrustedMonths:   { type: Number, default: 6, min: 0 },
  },
  { timestamps: true }
);

const PlatformConfig =
  mongoose.models.PlatformConfig ||
  mongoose.model('PlatformConfig', platformConfigSchema);

export default PlatformConfig;

const FOUNDING_SELLER_DEFAULTS = {
  cap: 50,
  claimed: 0,
  rate: 0,
  freeSalesByTier: { casual: 10, refurbished: 10, professional: 30, enterprise: 30 },
};

const MARKETING_EMAILS_DEFAULTS = {
  sellerInviteEnabled: true,
  sellerInviteDelayDays: 2,
  sellerInviteCountry: 'GB',
};

// Returns the singleton config, creating it with defaults if absent
export async function getPlatformConfig() {
  let cfg = await PlatformConfig.findOne({ _key: 'global' }).lean();
  if (!cfg) {
    cfg = await PlatformConfig.create({ _key: 'global' });
    cfg = cfg.toObject();
  }
  // .lean() skips schema-default application for paths missing on an
  // already-existing document (e.g. this singleton, created before
  // foundingSeller was added to the schema) — merge defaults in here so
  // every caller can trust cfg.foundingSeller.* without its own fallback.
  if (!cfg.foundingSeller) {
    cfg.foundingSeller = { ...FOUNDING_SELLER_DEFAULTS, freeSalesByTier: { ...FOUNDING_SELLER_DEFAULTS.freeSalesByTier } };
  } else {
    if (!cfg.foundingSeller.freeSalesByTier) cfg.foundingSeller.freeSalesByTier = { ...FOUNDING_SELLER_DEFAULTS.freeSalesByTier };
    if (cfg.foundingSeller.rate == null) cfg.foundingSeller.rate = FOUNDING_SELLER_DEFAULTS.rate;
  }
  if (!cfg.marketingEmails) {
    cfg.marketingEmails = { ...MARKETING_EMAILS_DEFAULTS };
  } else {
    if (cfg.marketingEmails.sellerInviteEnabled == null) cfg.marketingEmails.sellerInviteEnabled = MARKETING_EMAILS_DEFAULTS.sellerInviteEnabled;
    if (cfg.marketingEmails.sellerInviteDelayDays == null) cfg.marketingEmails.sellerInviteDelayDays = MARKETING_EMAILS_DEFAULTS.sellerInviteDelayDays;
    if (cfg.marketingEmails.sellerInviteCountry == null) cfg.marketingEmails.sellerInviteCountry = MARKETING_EMAILS_DEFAULTS.sellerInviteCountry;
  }
  return cfg;
}
