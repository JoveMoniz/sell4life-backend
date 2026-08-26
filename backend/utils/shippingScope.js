// ======================================================
// SHIPPING SCOPE — where a seller is willing to ship a given product.
// Single source of truth so this logic lives in exactly one place,
// reused by the product page's browse-time check and checkout's
// enforcement — never duplicated per caller.
// ======================================================

const UK_CODE = 'GB';

// EU member states, ISO 3166-1 alpha-2 — used for the 'uk_eu' preset so a
// seller doesn't have to hand-pick all 27 countries individually.
const EU_CODES = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE',
];

// Returns the explicit allow-list for a product's shippingScope, or null
// for 'worldwide' (meaning "no restriction from the seller's side").
export function countriesForScope(product) {
  switch (product?.shippingScope) {
    case 'uk':     return [UK_CODE];
    case 'uk_eu':  return [UK_CODE, ...EU_CODES];
    case 'custom': return (product.shippingCountries || []).map(c => String(c).toUpperCase());
    case 'worldwide':
    default:
      return null;
  }
}

// The one check every caller should use — does the seller's own stated
// scope permit shipping to this country? Doesn't know anything about CJ's
// real freight availability; that's a separate, live check only worth
// doing at checkout time (see checkout enforcement), not on every product
// page view.
export function isCountryAllowedByScope(product, countryCode) {
  const allowed = countriesForScope(product);
  if (allowed === null) return true;
  if (!countryCode) return true; // unknown buyer location — don't block on missing data
  return allowed.includes(String(countryCode).toUpperCase());
}
