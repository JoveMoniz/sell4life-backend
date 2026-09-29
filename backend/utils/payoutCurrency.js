// ======================================================
// PAYOUT CURRENCY ESTIMATE — this does NOT pick what currency the actual
// Stripe transfer moves in. Confirmed live against Stripe's API: the
// platform's Stripe balance is GBP-only (no separate USD pool), so asking
// for a `currency: 'usd'` transfer fails outright with balance_insufficient
// no matter how much GBP is available. Every transfer is always sent in GBP
// (see vendorPayoutWorker.js / adminVendors.js) — Stripe auto-converts it
// into the connected account's OWN currency the instant it lands there (a
// real test transfer of £5.00 landed as $6.48 on a US test account), then
// pays that account out to their real bank in their real currency
// automatically. No platform-side USD balance is needed for that to work.
//
// What this file IS for: computing a vendor-facing ESTIMATE of what a GBP
// payout is worth in their local currency, for display (dashboard, payout
// emails) — using the RAW rate from exchangeRates.js's getRates(), never
// currency.js's getDisplayRate() (that one bakes in a buyer-protecting
// markup that has no place in an estimate shown to the vendor).
// ======================================================

import { getRates } from './exchangeRates.js';
import { currencySymbol } from './currency.js';

const MINOR_UNIT_DIGITS = { GBP: 2, USD: 2, EUR: 2 };

// Resolves the currency + rate a NEW payout transfer to this vendor
// country should use.
export async function resolvePayoutCurrency(vendorCountry) {
  const country = String(vendorCountry || '').toUpperCase();

  if (country === 'US') {
    const rates = await getRates();
    const rate = rates.USD || 1;
    return { currency: 'USD', rate, symbol: currencySymbol('USD') };
  }

  // GB, and everywhere else pending its own real-payout-currency support,
  // stays GBP — same deferred-until-added principle as chargeCurrency.js.
  return { currency: 'GBP', rate: 1, symbol: currencySymbol('GBP') };
}

// Converts a GBP amount into a target currency, honoring its minor unit.
// Returns both the decimal amount (for storage/logging) and the integer
// Stripe amount (pence/cents) actually sent to the API.
export function convertGbpToPayout(gbpAmount, currency, rate) {
  const digits = MINOR_UNIT_DIGITS[currency] ?? 2;
  const scale = 10 ** digits;
  const amount = Math.round(Number(gbpAmount) * Number(rate) * scale) / scale;
  const stripeAmount = Math.round(amount * scale);
  return { amount, stripeAmount };
}
