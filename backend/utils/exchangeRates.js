// ======================================================
// EXCHANGE RATES — live GBP-based rates for buyer-facing currency display.
// Source: Frankfurter (ECB reference rates), free, no API key required.
// Cached in memory and refreshed periodically — checkout/browsing must
// never block on or fail because of this external call, so a stale cached
// rate (or the hardcoded fallback) is always used instead of erroring out.
// ======================================================

const FRANKFURTER_URL = 'https://api.frankfurter.dev/v1/latest?base=GBP&symbols=EUR,USD';
const REFRESH_MS = 6 * 60 * 60 * 1000; // 6 hours — these don't need to be second-fresh

// Reasonable hardcoded fallback if the API has never successfully returned
// yet (e.g. right after a fresh deploy) — approximate, better than crashing
// or showing £0.00 to a buyer.
let _rates = { EUR: 1.15, USD: 1.27 };
let _lastFetchedAt = 0;
let _refreshPromise = null;

async function _refresh() {
  try {
    const resp = await fetch(FRANKFURTER_URL);
    if (!resp.ok) return;
    const data = await resp.json();
    if (data?.rates?.EUR && data?.rates?.USD) {
      _rates = { EUR: data.rates.EUR, USD: data.rates.USD };
      _lastFetchedAt = Date.now();
      console.log('[exchangeRates] refreshed:', _rates);
    }
  } catch (err) {
    console.warn('[exchangeRates] refresh failed, keeping last known rates:', err.message);
  }
}

// Called lazily on demand rather than a startup-blocking fetch — the first
// caller of the process either gets the hardcoded fallback (if this is the
// very first call and the fetch hasn't resolved yet) or waits briefly for
// the in-flight refresh, never a hard failure either way.
export async function getRates() {
  const isStale = Date.now() - _lastFetchedAt > REFRESH_MS;
  if (isStale && !_refreshPromise) {
    _refreshPromise = _refresh().finally(() => { _refreshPromise = null; });
  }
  if (_lastFetchedAt === 0 && _refreshPromise) {
    // Only block if we've NEVER successfully fetched yet — otherwise serve
    // the last known good rate immediately and refresh in the background.
    await _refreshPromise;
  }
  return _rates;
}
