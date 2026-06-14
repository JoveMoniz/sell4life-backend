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

// Returns the singleton config, creating it with defaults if absent
export async function getPlatformConfig() {
  let cfg = await PlatformConfig.findOne({ _key: 'global' }).lean();
  if (!cfg) {
    cfg = await PlatformConfig.create({ _key: 'global' });
    cfg = cfg.toObject();
  }
  return cfg;
}
