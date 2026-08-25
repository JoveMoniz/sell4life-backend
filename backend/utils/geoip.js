// ======================================================
// GEOIP — local MaxMind GeoLite2-City lookup
// No per-request external calls, no ongoing cost. If the .mmdb file
// isn't present yet, lookups just return blanks — never blocks server
// boot or breaks tracking.
//
// City edition (not the older Country-only file) — same free MaxMind
// account, just a different downloadable file — adds city/region on top
// of country. Free-tier IP geolocation is noticeably less precise at
// city level than country level (mobile carrier / VPN traffic especially
// can resolve to the wrong city within the right country) — treat city
// as directional, not authoritative. The raw IP itself is never
// persisted, only these resolved fields.
// ======================================================
import { open } from 'maxmind';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.GEOIP_DB_PATH || path.join(__dirname, '../data/GeoLite2-City.mmdb');

let lookup = null;
let loadAttempted = false;

export async function initGeoIp() {
  if (loadAttempted) return;
  loadAttempted = true;
  try {
    lookup = await open(DB_PATH);
    console.log('✅ GeoIP database loaded:', DB_PATH);
  } catch (err) {
    console.warn('⚠️  GeoIP database not loaded — country/city will be blank until it is added:', err.message);
  }
}

export function isGeoIpLoaded() {
  return !!lookup;
}

// Returns { country, region, city } — each '' if unresolvable. region is
// the top-level subdivision (state/county/province), not a fine-grained
// district.
export function lookupGeo(ip) {
  if (!lookup || !ip) return { country: '', region: '', city: '' };
  try {
    const result = lookup.get(ip);
    if (!result) return { country: '', region: '', city: '' };
    return {
      country: result.country?.iso_code || result.registered_country?.iso_code || '',
      region:  result.subdivisions?.[0]?.names?.en || '',
      city:    result.city?.names?.en || '',
    };
  } catch {
    return { country: '', region: '', city: '' };
  }
}

// Kept for any caller that only ever needed the country — avoids touching
// every existing call site just for this upgrade.
export function lookupCountry(ip) {
  return lookupGeo(ip).country;
}
