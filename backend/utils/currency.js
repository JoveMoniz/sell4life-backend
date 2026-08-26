// ======================================================
// CURRENCY — determines which currency a buyer should see prices in,
// based on their GeoIP country, and converts a GBP amount to it.
//
// The actual Stripe charge stays in GBP (unchanged) — this is
// display-only, matching what a buyer's own card issuer would convert
// anyway. A small conversion markup is baked into the shown price so
// this doesn't undersell the vendor once real card-network conversion
// costs are accounted for — same principle Stripe's own "Adaptive
// Pricing" uses (2-4% over mid-market, paid by the customer, invisible
// as a separate line item). Adaptive Pricing itself isn't usable here —
// it explicitly doesn't support the Payment Intents + Elements
// combination this checkout is built on — so this reimplements the same
// idea manually instead.
// ======================================================

import { EU_CODES } from './shippingScope.js';
import { getRates } from './exchangeRates.js';

const MARKUP_PCT = Number(process.env.CURRENCY_MARKUP_PCT) || 3; // %, matches Stripe's own 2-4% range

const CURRENCY_SYMBOLS = { GBP: '£', EUR: '€', USD: '$' };

// Cape Verde's escudo is hard-pegged to EUR (1 EUR = 110.265 CVE, fixed
// since 1998) — show EUR there even though it isn't an EU member.
const EUR_COUNTRIES = new Set([...EU_CODES, 'CV']);

export function currencyForCountry(countryCode) {
  const c = String(countryCode || '').toUpperCase();
  if (c === 'GB') return 'GBP';
  if (EUR_COUNTRIES.has(c)) return 'EUR';
  return 'USD'; // default fallback for everywhere else, including US/BR
}

// Returns the buyer-facing rate for a currency — GBP itself is always 1
// (no markup applied to your own base currency), others include the
// conversion markup baked in.
export async function getDisplayRate(currencyCode) {
  if (currencyCode === 'GBP') return 1;
  const rates = await getRates();
  const raw = rates[currencyCode];
  if (!raw) return 1; // unknown currency code — never crash a page over this
  return Math.round(raw * (1 + MARKUP_PCT / 100) * 10000) / 10000;
}

export function currencySymbol(currencyCode) {
  return CURRENCY_SYMBOLS[currencyCode] || currencyCode + ' ';
}

// Convenience — resolves a buyer's country straight to everything the
// frontend needs to format prices: which currency, the rate to multiply
// GBP amounts by, and the symbol to display.
export async function getDisplayCurrencyInfo(countryCode) {
  const currency = currencyForCountry(countryCode);
  const rate = await getDisplayRate(currency);
  return { currency, rate, symbol: currencySymbol(currency) };
}
