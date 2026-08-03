// ======================================================
// TRAFFIC SOURCE CLASSIFICATION
// Computed once at session-creation time, not recomputed per query.
// ======================================================
const SEARCH_ENGINES = ['google.', 'bing.', 'duckduckgo.', 'yahoo.', 'baidu.', 'yandex.', 'ecosia.'];
const SOCIAL_SITES = [
  'facebook.', 'instagram.', 'twitter.', 'x.com', 't.co', 'linkedin.',
  'pinterest.', 'tiktok.', 'reddit.', 'youtube.', 'threads.net',
];

function hostnameOf(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
}

const SITE_HOSTNAMES = ['sell4life.com', 'staging.sell4life.com', 'localhost'];

export function classifyTrafficSource({ referrer, utmMedium }) {
  const medium = (utmMedium || '').toLowerCase();
  if (medium) {
    if (medium === 'email') return 'email';
    if (['cpc', 'ppc', 'paid', 'paidsocial', 'display'].includes(medium)) return 'paid';
    if (medium === 'social') return 'social';
    return 'referral';
  }

  const refHost = hostnameOf(referrer);
  if (!refHost || SITE_HOSTNAMES.some((h) => refHost.endsWith(h))) return 'direct';
  if (SEARCH_ENGINES.some((s) => refHost.includes(s))) return 'search';
  if (SOCIAL_SITES.some((s) => refHost.includes(s))) return 'social';
  return 'referral';
}

export function referrerDomainOf(referrer) {
  const host = hostnameOf(referrer);
  return SITE_HOSTNAMES.some((h) => host.endsWith(h)) ? '' : host;
}
