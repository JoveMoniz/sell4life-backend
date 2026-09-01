import express from 'express';

import AnalyticsSession from '../models/analyticsSession.js';
import AnalyticsEvent from '../models/analyticsEvent.js';
import Order from '../models/order.js';
import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';
import { processAnalyticsRollup } from '../jobs/analyticsRollupWorker.js';

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

/* ======================================================
   ONE-OFF: purge known test data generated while diagnosing
   the tracking pipeline (test-page/cors-test/inline-static-test
   paths, and the synthetic sessionIds/visitorIds used for curl
   tests). Safe to remove this route once run.
====================================================== */
const TEST_PATHS = ['/test-page', '/cors-test', '/inline-static-test', '/final-verify', '/referrer-test', '/geoip-test'];
const TEST_IDS = ['test-session-001', 'test-visitor-001', 'test-session-bot-001', 'test-visitor-bot-001', 'inline-test', 'cors-test', 'final-verify'];

router.delete('/test-data', async (req, res) => {
  try {
    const eventFilter = { $or: [{ path: { $in: TEST_PATHS } }, { sessionId: { $in: TEST_IDS } }, { visitorId: { $in: TEST_IDS } }] };
    const sessionFilter = { $or: [{ entryPage: { $in: TEST_PATHS } }, { sessionId: { $in: TEST_IDS } }, { visitorId: { $in: TEST_IDS } }] };

    const [eventsResult, sessionsResult] = await Promise.all([
      AnalyticsEvent.deleteMany(eventFilter),
      AnalyticsSession.deleteMany(sessionFilter),
    ]);

    res.json({
      ok: true,
      eventsDeleted: eventsResult.deletedCount,
      sessionsDeleted: sessionsResult.deletedCount,
    });
  } catch (err) {
    console.error('[admin-analytics] test-data cleanup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   MANUAL TRIGGER — runs the same rollup/retention job the nightly
   worker runs, on demand. Useful for verifying it works without
   waiting for the next scheduled tick.
====================================================== */
router.post('/run-rollup', async (req, res) => {
  try {
    const summary = await processAnalyticsRollup();
    res.json({ ok: true, ...summary });
  } catch (err) {
    console.error('[admin-analytics] manual rollup error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Same "counts as real revenue" status list adminVendors.js /financials
// uses — a paid order stays counted through refund_scheduled/processing
// (the sale genuinely happened; only 'refunded'/'partially_refunded'
// reduce the total, which this route doesn't attempt to net out here).
const PAID = ['paid', 'refunded', 'partially_refunded', 'refund_scheduled', 'refund_processing'];

/* ======================================================
   DATE-RANGE FILTER
   Same period convention used across the admin panel
   (adminVendors.js /financials) — today|week|month|quarter|
   rolling12|year, default = all-time.
====================================================== */
function dateFilterFor(field, period) {
  const now = new Date();
  if (period === 'today') {
    return { [field]: { $gte: new Date(now.getFullYear(), now.getMonth(), now.getDate()) } };
  }
  if (period === 'week') {
    const s = new Date(now); s.setDate(s.getDate() - 7);
    return { [field]: { $gte: s } };
  }
  if (period === 'month') {
    return { [field]: { $gte: new Date(now.getFullYear(), now.getMonth(), 1) } };
  }
  if (period === 'quarter') {
    const q = Math.floor(now.getMonth() / 3);
    return { [field]: { $gte: new Date(now.getFullYear(), q * 3, 1) } };
  }
  if (period === 'rolling12') {
    const s = new Date(now); s.setFullYear(s.getFullYear() - 1);
    return { [field]: { $gte: s } };
  }
  if (period === 'year') {
    return { [field]: { $gte: new Date(now.getFullYear(), 0, 1) } };
  }
  return {};
}

/* ======================================================
   GET /summary
====================================================== */
router.get('/summary', async (req, res) => {
  try {
    const match = { isBot: false, isInternal: false, ...dateFilterFor('startedAt', req.query.period) };
    // Orders/revenue come straight from Order, not from any client-fired
    // event — the funnel's old 'purchase' AnalyticsEvent was never
    // actually fired anywhere in checkout.js, so it undercounted every
    // real order (see below too). Querying Order directly is also
    // retroactively correct for orders placed before this existed.
    const orderMatch = { paymentStatus: { $in: PAID }, ...dateFilterFor('createdAt', req.query.period) };

    const [[agg], [orderAgg]] = await Promise.all([
      AnalyticsSession.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalVisits: { $sum: 1 },
            uniqueVisitors: { $addToSet: '$visitorId' },
            pageViews: { $sum: '$pageViewCount' },
            avgSessionDurationSec: { $avg: '$durationSec' },
            bounces: { $sum: { $cond: [{ $lte: ['$pageViewCount', 1] }, 1, 0] } },
            newVisitors: { $sum: { $cond: ['$isNewVisitor', 1, 0] } },
          },
        },
      ]),
      Order.aggregate([
        { $match: orderMatch },
        { $group: { _id: null, orders: { $sum: 1 }, revenue: { $sum: '$total' } } },
      ]),
    ]);

    const totalVisits = agg?.totalVisits || 0;
    const uniqueVisitors = agg?.uniqueVisitors?.length || 0;
    const orders = orderAgg?.orders || 0;

    res.json({
      totalVisits,
      uniqueVisitors,
      pageViews: agg?.pageViews || 0,
      avgSessionDurationSec: Math.round(agg?.avgSessionDurationSec || 0),
      bounceRate: totalVisits ? Math.round(((agg?.bounces || 0) / totalVisits) * 1000) / 10 : 0,
      newVisitorPct: totalVisits ? Math.round(((agg?.newVisitors || 0) / totalVisits) * 1000) / 10 : 0,
      orders,
      revenue: Math.round((orderAgg?.revenue || 0) * 100) / 100,
      conversionRate: totalVisits ? Math.round((orders / totalVisits) * 1000) / 10 : 0,
    });
  } catch (err) {
    console.error('[admin-analytics] summary error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET /timeseries
====================================================== */
router.get('/timeseries', async (req, res) => {
  try {
    const period = req.query.period || 'week';
    const match = { isBot: false, isInternal: false, ...dateFilterFor('startedAt', period) };
    const granularity = period === 'today' ? 'hour' : 'day';

    const dateFormat = granularity === 'hour' ? '%Y-%m-%dT%H:00' : '%Y-%m-%d';

    const rows = await AnalyticsSession.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { format: dateFormat, date: '$startedAt' } },
          visits: { $sum: 1 },
          pageViews: { $sum: '$pageViewCount' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json(rows.map((r) => ({ bucket: r._id, visits: r.visits, pageViews: r.pageViews })));
  } catch (err) {
    console.error('[admin-analytics] timeseries error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET /realtime — visitors active in the last 5 minutes
====================================================== */
router.get('/realtime', async (req, res) => {
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const activeVisitors = await AnalyticsSession.countDocuments({
      isBot: false, isInternal: false,
      lastSeenAt: { $gte: fiveMinAgo },
    });
    res.json({ activeVisitors });
  } catch (err) {
    console.error('[admin-analytics] realtime error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET /top-pages
====================================================== */
router.get('/top-pages', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const match = { isBot: false, isInternal: false, type: 'pageview', ...dateFilterFor('timestamp', req.query.period) };

    const rows = await AnalyticsEvent.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$path',
          views: { $sum: 1 },
          avgTimeOnPageSec: { $avg: '$timeOnPageSec' },
        },
      },
      { $sort: { views: -1 } },
      { $limit: limit },
    ]);

    res.json(rows.map((r) => ({
      path: r._id,
      views: r.views,
      avgTimeOnPageSec: r.avgTimeOnPageSec != null ? Math.round(r.avgTimeOnPageSec) : null,
    })));
  } catch (err) {
    console.error('[admin-analytics] top-pages error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET /top-products — most-viewed products, from product_view events.
   product.js already sends productId/name/price in metadata on every
   view; this just aggregates what's already being collected rather than
   needing any new tracking.
====================================================== */
router.get('/top-products', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const match = {
      isBot: false, isInternal: false, type: 'product_view',
      'metadata.productId': { $exists: true, $ne: '' },
      ...dateFilterFor('timestamp', req.query.period),
    };

    const rows = await AnalyticsEvent.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$metadata.productId',
          name: { $last: '$metadata.name' },
          price: { $last: '$metadata.price' },
          views: { $sum: 1 },
        },
      },
      { $sort: { views: -1 } },
      { $limit: limit },
    ]);

    res.json(rows.map((r) => ({
      productId: r._id,
      name: r.name || '(unknown product)',
      price: typeof r.price === 'number' ? r.price : null,
      views: r.views,
    })));
  } catch (err) {
    console.error('[admin-analytics] top-products error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET /sources
====================================================== */
router.get('/sources', async (req, res) => {
  try {
    const match = { isBot: false, isInternal: false, ...dateFilterFor('startedAt', req.query.period) };

    const [breakdown, topReferrers, topCampaigns] = await Promise.all([
      AnalyticsSession.aggregate([
        { $match: match },
        { $group: { _id: '$trafficSource', visits: { $sum: 1 } } },
        { $sort: { visits: -1 } },
      ]),
      AnalyticsSession.aggregate([
        { $match: { ...match, referrerDomain: { $ne: '' } } },
        { $group: { _id: '$referrerDomain', visits: { $sum: 1 } } },
        { $sort: { visits: -1 } },
        { $limit: 20 },
      ]),
      AnalyticsSession.aggregate([
        { $match: { ...match, utmCampaign: { $ne: '' } } },
        {
          $group: {
            _id: { source: '$utmSource', medium: '$utmMedium', campaign: '$utmCampaign' },
            visits: { $sum: 1 },
          },
        },
        { $sort: { visits: -1 } },
        { $limit: 20 },
      ]),
    ]);

    res.json({
      breakdown: breakdown.map((r) => ({ source: r._id, visits: r.visits })),
      topReferrers: topReferrers.map((r) => ({ domain: r._id, visits: r.visits })),
      topCampaigns: topCampaigns.map((r) => ({
        utmSource: r._id.source, utmMedium: r._id.medium, utmCampaign: r._id.campaign, visits: r.visits,
      })),
    });
  } catch (err) {
    console.error('[admin-analytics] sources error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET /devices
====================================================== */
router.get('/devices', async (req, res) => {
  try {
    const match = { isBot: false, isInternal: false, ...dateFilterFor('startedAt', req.query.period) };

    const [devices, browsers, os] = await Promise.all([
      AnalyticsSession.aggregate([{ $match: match }, { $group: { _id: '$device', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      AnalyticsSession.aggregate([{ $match: { ...match, browser: { $ne: '' } } }, { $group: { _id: '$browser', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]),
      AnalyticsSession.aggregate([{ $match: { ...match, os: { $ne: '' } } }, { $group: { _id: '$os', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 10 }]),
    ]);

    res.json({
      devices: devices.map((r) => ({ device: r._id, count: r.count })),
      browsers: browsers.map((r) => ({ browser: r._id, count: r.count })),
      os: os.map((r) => ({ os: r._id, count: r.count })),
    });
  } catch (err) {
    console.error('[admin-analytics] devices error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET /countries
====================================================== */
router.get('/countries', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const match = { isBot: false, isInternal: false, country: { $ne: '' }, ...dateFilterFor('startedAt', req.query.period) };

    const rows = await AnalyticsSession.aggregate([
      { $match: match },
      { $group: { _id: '$country', visits: { $sum: 1 } } },
      { $sort: { visits: -1 } },
      { $limit: limit },
    ]);

    res.json(rows.map((r) => ({ country: r._id, visits: r.visits })));
  } catch (err) {
    console.error('[admin-analytics] countries error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET /top-cities — city/region resolved via GeoLite2-City. Directional,
   not precise (free-tier IP geolocation is noticeably less accurate at
   city level than country level).
====================================================== */
router.get('/top-cities', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    // $exists is required alongside $ne — Mongo's $ne treats a genuinely
    // missing field as "not equal", so without it every session recorded
    // before city/region existed on the schema (i.e. all of it, until
    // just now) would slip through as a single blank-city bucket that
    // pools every historical visit's country/visit count together.
    const match = { isBot: false, isInternal: false, city: { $exists: true, $ne: '' }, ...dateFilterFor('startedAt', req.query.period) };

    const rows = await AnalyticsSession.aggregate([
      { $match: match },
      { $group: { _id: { city: '$city', region: '$region', country: '$country' }, visits: { $sum: 1 } } },
      { $sort: { visits: -1 } },
      { $limit: limit },
    ]);

    res.json(rows.map((r) => ({
      city: r._id.city, region: r._id.region, country: r._id.country, visits: r.visits,
    })));
  } catch (err) {
    console.error('[admin-analytics] top-cities error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET /searches — top on-site search terms
====================================================== */
router.get('/searches', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const match = { isBot: false, isInternal: false, type: 'search', ...dateFilterFor('timestamp', req.query.period) };

    const rows = await AnalyticsEvent.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $toLower: { $trim: { input: { $ifNull: ['$metadata.query', ''] } } } },
          count: { $sum: 1 },
        },
      },
      { $match: { _id: { $ne: '' } } },
      { $sort: { count: -1 } },
      { $limit: limit },
    ]);

    res.json(rows.map((r) => ({ query: r._id, count: r.count })));
  } catch (err) {
    console.error('[admin-analytics] searches error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET /funnel — visitors -> product views -> add to cart ->
   checkout started -> purchase, with drop-off % per stage
====================================================== */
const FUNNEL_STAGES = [
  { key: 'visitors', label: 'Visitors', source: 'session' },
  { key: 'productViews', label: 'Product Views', source: 'event', type: 'product_view' },
  { key: 'addToCart', label: 'Add to Cart', source: 'event', type: 'add_to_cart' },
  { key: 'checkoutStart', label: 'Checkout Started', source: 'event', type: 'checkout_start' },
  { key: 'purchases', label: 'Purchases', source: 'order' },
];

router.get('/funnel', async (req, res) => {
  try {
    const period = req.query.period;
    const sessionMatch = { isBot: false, isInternal: false, ...dateFilterFor('startedAt', period) };
    const eventMatch = { isBot: false, isInternal: false, ...dateFilterFor('timestamp', period) };
    const orderMatch = { paymentStatus: { $in: PAID }, ...dateFilterFor('createdAt', period) };
    const eventTypes = FUNNEL_STAGES.filter((s) => s.source === 'event').map((s) => s.type);

    const [visitorCount, eventCounts, orderCount] = await Promise.all([
      AnalyticsSession.countDocuments(sessionMatch),
      AnalyticsEvent.aggregate([
        { $match: { ...eventMatch, type: { $in: eventTypes } } },
        { $group: { _id: { type: '$type', sessionId: '$sessionId' } } },
        { $group: { _id: '$_id.type', count: { $sum: 1 } } },
      ]),
      // Real purchases from Order — the 'purchase' AnalyticsEvent this
      // used to read from is never actually fired anywhere in
      // checkout.js, so it silently undercounted (always to zero) every
      // real order. See /summary's orders/revenue fields for the same fix.
      Order.countDocuments(orderMatch),
    ]);

    const countByType = {};
    eventCounts.forEach((r) => { countByType[r._id] = r.count; });

    let prevCount = null;
    const stages = FUNNEL_STAGES.map((stage) => {
      const count = stage.source === 'order' ? orderCount
        : stage.source === 'session' ? visitorCount
        : (countByType[stage.type] || 0);
      const dropOffPct = prevCount != null && prevCount > 0
        ? Math.round((1 - count / prevCount) * 1000) / 10
        : null;
      prevCount = count;
      return { key: stage.key, label: stage.label, count, dropOffPct };
    });

    res.json({ stages });
  } catch (err) {
    console.error('[admin-analytics] funnel error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

/* ======================================================
   GET /sessions — recent sessions that reached at least a given funnel
   stage, each with its full event trail. Built so a specific drop-off
   (e.g. "who abandoned checkout, and what country were they in") can be
   diagnosed directly instead of guessed at from separate aggregate
   tables — /countries and /funnel can't be cross-referenced today.
====================================================== */
const STAGE_ORDER = ['pageview', 'product_view', 'add_to_cart', 'checkout_start'];

router.get('/sessions', async (req, res) => {
  try {
    const period = req.query.period;
    const minStage = STAGE_ORDER.includes(req.query.minStage) ? req.query.minStage : 'add_to_cart';
    const limit = Math.min(Number(req.query.limit) || 50, 200);

    // Any event at-or-past the requested stage qualifies the session —
    // e.g. minStage=add_to_cart also pulls in sessions that got as far as
    // checkout_start, not only ones that stopped exactly at add_to_cart.
    const stageTypes = STAGE_ORDER.slice(STAGE_ORDER.indexOf(minStage));
    const eventMatch = { isBot: false, isInternal: false, type: { $in: stageTypes }, ...dateFilterFor('timestamp', period) };

    const sessionIds = await AnalyticsEvent.distinct('sessionId', eventMatch);
    if (!sessionIds.length) return res.json([]);

    const sessions = await AnalyticsSession
      .find({ sessionId: { $in: sessionIds }, isBot: false, isInternal: false })
      .sort({ startedAt: -1 })
      .limit(limit)
      .lean();

    if (!sessions.length) return res.json([]);

    const events = await AnalyticsEvent
      .find({ sessionId: { $in: sessions.map((s) => s.sessionId) } })
      .sort({ timestamp: 1 })
      .select('sessionId type path title metadata timestamp')
      .lean();

    const eventsBySession = {};
    events.forEach((e) => {
      (eventsBySession[e.sessionId] = eventsBySession[e.sessionId] || []).push(e);
    });

    // Best-effort only — orders don't store a sessionId, so this infers a
    // likely match by "same logged-in user, paid within a couple of hours
    // of the session" rather than a guaranteed link. Good enough to tell
    // an admin "yes, they did buy shortly after" vs "no, they didn't."
    const userIds = [...new Set(sessions.filter((s) => s.userId).map((s) => String(s.userId)))];
    const orders = userIds.length
      ? await Order.find({ user: { $in: userIds }, paymentStatus: { $in: PAID } }).select('user createdAt total').lean()
      : [];

    res.json(sessions.map((s) => {
      const windowEnd = new Date((s.lastSeenAt || s.startedAt).getTime() + 2 * 3600 * 1000);
      const purchasedNearby = s.userId
        ? orders.some((o) => String(o.user) === String(s.userId) && o.createdAt >= s.startedAt && o.createdAt <= windowEnd)
        : false;

      return {
        sessionId: s.sessionId,
        startedAt: s.startedAt,
        lastSeenAt: s.lastSeenAt,
        durationSec: s.durationSec,
        country: s.country,
        region: s.region,
        city: s.city,
        device: s.device,
        browser: s.browser,
        os: s.os,
        entryPage: s.entryPage,
        exitPage: s.exitPage,
        trafficSource: s.trafficSource,
        referrerDomain: s.referrerDomain,
        isNewVisitor: s.isNewVisitor,
        loggedIn: !!s.userId,
        purchasedNearby,
        events: (eventsBySession[s.sessionId] || []).map((e) => ({
          type: e.type,
          path: e.path,
          title: e.title,
          metadata: e.metadata,
          timestamp: e.timestamp,
        })),
      };
    }));
  } catch (err) {
    console.error('[admin-analytics] sessions error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
