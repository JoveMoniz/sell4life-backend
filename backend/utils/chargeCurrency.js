// ======================================================
// REAL CHARGE CURRENCY — resolves what currency a Stripe PaymentIntent is
// actually created/refunded in, as opposed to utils/currency.js's
// display-only GBP-to-shown-currency conversion. Deliberately a separate,
// narrower allow-list: currencyForCountry() already knows DE -> EUR, but
// Germany/EUR stays GBP-charged here until Stripe Tax/VAT registration is
// sorted (see project notes) — this file is what actually gates real
// money, so it must never silently follow the broader display list.
// ======================================================

import { currencyForCountry, getDisplayRate, currencySymbol } from './currency.js';

const CHARGEABLE_COUNTRIES = new Set(['US']);

// GBP/USD/EUR are all 2-decimal minor units — written generically (not
// hardcoded *100 inline at every call site) so a future zero-decimal
// currency (e.g. JPY) can't silently corrupt an amount somewhere it was
// missed.
const MINOR_UNIT_DIGITS = { GBP: 2, USD: 2, EUR: 2 };

// Resolves the currency + rate a NEW charge for this shipping country
// should use. Everything not explicitly allow-listed above charges GBP at
// rate 1 — unaffected, byte-for-byte identical to today's behavior.
export async function resolveChargeCurrency(countryCode) {
  const country = String(countryCode || '').toUpperCase();
  if (!CHARGEABLE_COUNTRIES.has(country)) {
    return { currency: 'GBP', rate: 1, symbol: '£' };
  }
  const currency = currencyForCountry(country);
  const rate = await getDisplayRate(currency); // includes the same conversion markup already used for display
  return { currency, rate, symbol: currencySymbol(currency) };
}

// Converts a GBP amount into a target currency, honoring its minor unit.
// Returns both the decimal amount (for display/logging) and the integer
// Stripe amount (pence/cents) actually sent to the API.
export function convertGbpToCharge(gbpAmount, currency, rate) {
  const digits = MINOR_UNIT_DIGITS[currency] ?? 2;
  const scale = 10 ** digits;
  const amount = Math.round(Number(gbpAmount) * Number(rate) * scale) / scale;
  const stripeAmount = Math.round(amount * scale);
  return { amount, stripeAmount };
}

// A REFUND must always convert using the ORDER's stored chargeToGbpRate —
// never a freshly-resolved live rate — so a refund is guaranteed
// mathematically consistent with the original charge even if market rates
// moved since. Thin wrapper over convertGbpToCharge for call-site clarity.
export function convertRefundToChargeCurrency(order, gbpAmount) {
  const currency = order.chargeCurrency || 'GBP';
  const rate = order.chargeToGbpRate || 1;
  return convertGbpToCharge(gbpAmount, currency, rate);
}

// Reverse direction — used only when a refund gets capped against the
// real remaining Stripe balance (stale shippingCost data, etc.): the
// capped charge-currency amount needs to convert back to a GBP figure for
// item.refundedAmount/order bookkeeping, which stays GBP always regardless
// of charge currency.
export function convertChargeToGbp(stripeAmount, currency, rate) {
  const digits = MINOR_UNIT_DIGITS[currency] ?? 2;
  const chargeDecimal = stripeAmount / 10 ** digits;
  return Math.round((chargeDecimal / (Number(rate) || 1)) * 100) / 100;
}
