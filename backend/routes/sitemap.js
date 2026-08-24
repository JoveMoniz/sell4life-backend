// ======================================================
// PUBLIC SITEMAP  –  no auth required
// Generates sitemap.xml including live products + store pages,
// alongside the static core/category/info/legal pages.
// ======================================================

import express from 'express';
import Product from '../models/product.js';
import Vendor from '../models/vendor.js';

const router = express.Router();
const SITE = 'https://sell4life.com';

const STATIC_URLS = [
  { loc: `${SITE}/`, changefreq: 'daily', priority: '1.0' },
  { loc: `${SITE}/shop/`, changefreq: 'daily', priority: '0.9' },
  { loc: `${SITE}/stores/`, changefreq: 'weekly', priority: '0.7' },
  { loc: `${SITE}/category/electronics.html`, changefreq: 'weekly', priority: '0.8' },
  { loc: `${SITE}/category/fashion.html`, changefreq: 'weekly', priority: '0.8' },
  { loc: `${SITE}/category/books.html`, changefreq: 'weekly', priority: '0.8' },
  { loc: `${SITE}/category/health-beauty.html`, changefreq: 'weekly', priority: '0.8' },
  { loc: `${SITE}/category/home-garden.html`, changefreq: 'weekly', priority: '0.8' },
  { loc: `${SITE}/category/toys.html`, changefreq: 'weekly', priority: '0.8' },
  { loc: `${SITE}/about/`, changefreq: 'monthly', priority: '0.5' },
  { loc: `${SITE}/contact/`, changefreq: 'monthly', priority: '0.5' },
  { loc: `${SITE}/sell/`, changefreq: 'monthly', priority: '0.6' },
  { loc: `${SITE}/help/`, changefreq: 'monthly', priority: '0.5' },
  { loc: `${SITE}/legal/terms.html`, changefreq: 'yearly', priority: '0.3' },
  { loc: `${SITE}/legal/privacy.html`, changefreq: 'yearly', priority: '0.3' },
  { loc: `${SITE}/legal/returns.html`, changefreq: 'yearly', priority: '0.3' },
];

const escapeXml = (s) =>
  String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c]));

const urlTag = ({ loc, changefreq, priority, lastmod }) =>
  `  <url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}<changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;

router.get('/sitemap.xml', async (req, res) => {
  try {
    const [products, vendors] = await Promise.all([
      Product.find({ active: true, archived: { $ne: true }, deletedAt: null })
        .select('slug updatedAt')
        .lean(),
      Vendor.find({ status: 'approved' }).select('storeSlug updatedAt').lean(),
    ]);

    const productUrls = products
      .filter((p) => p.slug)
      .map((p) => ({
        loc: `${SITE}/product/product.html?slug=${encodeURIComponent(p.slug)}`,
        changefreq: 'weekly',
        priority: '0.7',
        lastmod: p.updatedAt ? new Date(p.updatedAt).toISOString().slice(0, 10) : undefined,
      }));

    const storeUrls = vendors
      .filter((v) => v.storeSlug)
      .map((v) => ({
        loc: `${SITE}/stores/store.html?slug=${encodeURIComponent(v.storeSlug)}`,
        changefreq: 'weekly',
        priority: '0.6',
        lastmod: v.updatedAt ? new Date(v.updatedAt).toISOString().slice(0, 10) : undefined,
      }));

    const allUrls = [...STATIC_URLS, ...storeUrls, ...productUrls];

    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      allUrls.map(urlTag).join('\n') +
      `\n</urlset>\n`;

    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.send(xml);
  } catch (err) {
    console.error('sitemap generation failed:', err);
    res.status(500).send('sitemap generation failed');
  }
});

export default router;
