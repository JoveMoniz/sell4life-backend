// ======================================================
// USER-AGENT PARSING + BOT DETECTION
// Server-side only — never trust a client-supplied "isBot" flag.
// ======================================================
import { UAParser } from 'ua-parser-js';

const BOT_PATTERNS = [
  /bot/i, /spider/i, /crawl/i, /slurp/i, /googlebot/i, /bingbot/i, /yandex/i,
  /baiduspider/i, /duckduckbot/i, /facebookexternalhit/i, /twitterbot/i,
  /linkedinbot/i, /whatsapp/i, /telegrambot/i, /semrush/i, /ahrefs/i,
  /mj12bot/i, /dotbot/i, /petalbot/i, /curl/i, /wget/i, /python-requests/i,
  /python-urllib/i, /go-http-client/i, /okhttp/i, /axios/i, /node-fetch/i,
  /postmanruntime/i, /headlesschrome/i, /phantomjs/i, /puppeteer/i, /playwright/i,
  /scrapy/i, /libwww-perl/i, /monitoring/i, /pingdom/i, /uptimerobot/i,
  /statuscake/i, /gtmetrix/i, /lighthouse/i, /chrome-lighthouse/i,
];

export function isBotUserAgent(ua) {
  if (!ua) return true; // no UA at all — not a real browser, safest default
  return BOT_PATTERNS.some((re) => re.test(ua));
}

export function parseUserAgent(uaString) {
  const result = new UAParser(uaString || '').getResult();

  const deviceType = result.device?.type;
  const device = deviceType === 'mobile' ? 'mobile' : deviceType === 'tablet' ? 'tablet' : 'desktop';

  return {
    device,
    browser: result.browser?.name || '',
    os: result.os?.name || '',
  };
}
