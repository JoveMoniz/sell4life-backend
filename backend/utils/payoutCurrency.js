// ======================================================
// REAL PAYOUT CURRENCY — resolves what currency a Stripe Connect transfer
// to a vendor actually moves in, mirroring chargeCurrency.js's principle
// for the other side of the ledger: internal accounting (computeVendorBalance,
// commission, HMRC, payout.amount) stays GBP-canonical everywhere; real-currency
// conversion happens ONLY at the actual transfer boundary, using a rate
// resolved and stored once at that moment.
//
// Deliberately uses the RAW rate from exchangeRates.js's getRates(), never
// currency.js's getDisplayRate() — that rate bakes in a buyer-protecting
// markup meant to offset what a buyer's card issuer would charge; applying
// it here would overpay the vendor at the platform's expense.
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
