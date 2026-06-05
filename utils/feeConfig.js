import { getPlatformConfig } from '../models/platformConfig.js';

/**
 * Resolves the commission rate for a vendor.
 * Priority: vendor override → tier override → platform default
 */
export async function resolveCommissionRate(vendorType, commissionOverride) {
  if (commissionOverride != null) return Number(commissionOverride);
  const cfg = await getPlatformConfig();
  const tierRate = cfg.commissionByTier?.[vendorType];
  if (tierRate != null) return Number(tierRate);
  return Number(cfg.commissionDefault ?? 0.08);
}

/**
 * Returns full fee config (for routes that need multiple values).
 */
export async function getFeeConfig() {
  return getPlatformConfig();
}
