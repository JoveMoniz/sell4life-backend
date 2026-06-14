import { getPlatformConfig } from '../models/platformConfig.js';

// Returns the rate if orderCreatedAt is on/after setAt, else the hardcoded fallback.
function rateAtTime(currentRate, setAt, fallback, orderCreatedAt) {
  if (!setAt || !orderCreatedAt) return Number(currentRate ?? fallback);
  return new Date(orderCreatedAt) >= new Date(setAt)
    ? Number(currentRate ?? fallback)
    : fallback;
}

/**
 * Resolves the commission rate for a vendor — NOT date-aware.
 * Used where order date is unavailable (e.g. displaying current rates).
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

/**
 * Date-aware commission resolution.
 * Priority: vendor override → tier rate → platform default.
 *
 * Tier rates always apply to all orders of that tier (no timestamp check) —
 * they are structural to the vendor type, not a point-in-time change.
 * Only per-vendor overrides and the platform default are prospective.
 */
export async function resolveCommissionRateForOrder(vendor, orderCreatedAt) {
  const override   = vendor?.commissionOverride;
  const overrideAt = vendor?.commissionOverrideSetAt;

  if (override != null) {
    if (!overrideAt) return Number(override); // legacy: no timestamp → applies to all orders
    if (orderCreatedAt && new Date(orderCreatedAt) >= new Date(overrideAt)) {
      return Number(override);
    }
    // order predates the override — fall through to tier/default
  }

  const cfg      = await getPlatformConfig();
  const tierRate  = cfg.commissionByTier?.[vendor?.type];
  const tierSetAt = cfg.commissionByTierSetAt?.[vendor?.type];

  if (tierRate != null) {
    // Tier rate applies only to orders placed on/after it was configured.
    // Orders predating the configuration fall through to the platform default.
    if (!tierSetAt || !orderCreatedAt || new Date(orderCreatedAt) >= new Date(tierSetAt)) {
      return Number(tierRate);
    }
  }

  return rateAtTime(cfg.commissionDefault, cfg.commissionDefaultSetAt, 0.08, orderCreatedAt);
}

/**
 * Date-aware reserve rate for a specific order.
 * Uses vendor approval date to determine trust status at order time.
 * Checks reserve rate timestamps so rate changes only apply to newer orders.
 */
export function resolveReserveRateAtTime(vendor, cfg, orderCreatedAt) {
  const approvedAt  = vendor?.approvedAt ? new Date(vendor.approvedAt).getTime() : Date.now();
  const trustedMs   = Number(cfg?.reserveTrustedMonths ?? 6) * 30 * 24 * 60 * 60 * 1000;
  const orderMs     = new Date(orderCreatedAt).getTime();
  const wasTrusted  = (orderMs - approvedAt) >= trustedMs;

  if (!wasTrusted) {
    return rateAtTime(cfg?.reserveRateStandard, cfg?.reserveRateStandardSetAt, 0.10, orderCreatedAt);
  }
  return rateAtTime(cfg?.reserveRateTrusted, cfg?.reserveRateTrustedSetAt, 0.05, orderCreatedAt);
}
