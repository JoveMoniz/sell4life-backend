// ======================================================
// REAL CHARGE CURRENCY — resolves what currency a Stripe PaymentIntent is
// actually created/refunded in, as opposed to utils/currency.js's
// display-only GBP-to-shown-currency conversion.
//
// Mirrors currencyForCountry()'s "rest of world" policy — GB stays GBP,
// USD is the practical global default for everywhere else — with ONE
// deliberate carve-out: Europe/EUR is explicitly held back to GBP here
// even though currencyForCountry() already knows those countries map to
// EUR for display, because EU VAT/OSS registration isn't sorted yet (see
// project notes). This file is what actually gates real money, so that
// carve-out must never silently disappear just because the display list
// changes — it's re-declared here on purpose, not inherited.
// ======================================================

import { getDisplayRate, currencySymbol } from './currency.js';
import { EU_CODES } from './shippingScope.js';

// Matches currency.js's own EUR_COUNTRIES (EU members + Cape Verde, whose
// escudo is hard-pegged to EUR) — the set of countries deliberately held
// back to GBP here pending VAT/OSS registration.
const EUR_DEFERRED_COUNTRIES = new Set([...EU_CODES, 'CV']);

// GBP/USD/EUR are all 2-decimal minor units — written generically (not
// hardcoded *100 inline at every call site) so a future zero-decimal
// currency (e.g. JPY) can't silently corrupt an amount somewhere it was
// missed.
const MINOR_UNIT_DIGITS = { GBP: 2, USD: 2, EUR: 2 };

// Resolves the currency + rate a NEW charge for this shipping country
// should use.
export async function resolveChargeCurrency(countryCode) {
  const country = String(countryCode || '').toUpperCase();

  if (country === 'GB' || EUR_DEFERRED_COUNTRIES.has(country)) {
    return { currency: 'GBP', rate: 1, symbol: '£' };
  }

  // Everywhere else — the US and the rest of the world outside Europe —
  // charges in USD, same "rest of world" fallback currencyForCountry()
  // already uses for display (GB and the EU set above are the only other
  // branches it has, and both are already excluded by this point).
  const currency = 'USD';
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
