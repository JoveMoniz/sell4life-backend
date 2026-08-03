// ======================================================
// GEOIP — local MaxMind GeoLite2-Country lookup
// No per-request external calls, no ongoing cost. If the .mmdb file
// isn't present yet, lookups just return '' — never blocks server boot
// or breaks tracking.
// ======================================================
import { open } from 'maxmind';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.GEOIP_DB_PATH || path.join(__dirname, '../data/GeoLite2-Country.mmdb');

let lookup = null;
let loadAttempted = false;

export async function initGeoIp() {
  if (loadAttempted) return;
  loadAttempted = true;
  try {
    lookup = await open(DB_PATH);
    console.log('✅ GeoIP database loaded:', DB_PATH);
  } catch (err) {
    console.warn('⚠️  GeoIP database not loaded — country will be blank until it is added:', err.message);
  }
}

export function lookupCountry(ip) {
  if (!lookup || !ip) return '';
  try {
    const result = lookup.get(ip);
    return result?.country?.iso_code || result?.registered_country?.iso_code || '';
  } catch {
    return '';
  }
}
