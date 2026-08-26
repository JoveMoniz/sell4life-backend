// Countries Sell4Life currently supports for vendor payouts via Stripe
// Connect. Stripe fixes an Express account's country permanently at
// creation (it determines the expected bank-account format and ID
// verification rules), so we must only ever pass a country here we've
// actually validated works.
//
// To open payouts to a new country: add its ISO 3166-1 alpha-2 code to
// this list. Nothing else needs to change — routes/vendor.js reads this
// list both to populate the country picker and to validate a vendor's
// choice before creating their Stripe account.
export const STRIPE_CONNECT_COUNTRIES = ['GB', 'PT'];

export function isStripeConnectCountry(code) {
  return STRIPE_CONNECT_COUNTRIES.includes(String(code || '').toUpperCase());
}
