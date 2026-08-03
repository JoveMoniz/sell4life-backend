import express from 'express';

import AnalyticsSession from '../models/analyticsSession.js';
import AnalyticsEvent from '../models/analyticsEvent.js';
import authMiddleware from '../middleware/authMiddleware.js';
import adminMiddleware from '../middleware/adminMiddleware.js';

const router = express.Router();

router.use(authMiddleware);
router.use(adminMiddleware);

/* ======================================================
   ONE-OFF: purge known test data generated while diagnosing
   the tracking pipeline (test-page/cors-test/inline-static-test
   paths, and the synthetic sessionIds/visitorIds used for curl
   tests). Safe to remove this route once run.
====================================================== */
const TEST_PATHS = ['/test-page', '/cors-test', '/inline-static-test', '/final-verify'];
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
    const match = { isBot: false, ...dateFilterFor('startedAt', req.query.period) };

    const [agg] = await AnalyticsSession.aggregate([
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
    ]);

    const totalVisits = agg?.totalVisits || 0;
    const uniqueVisitors = agg?.uniqueVisitors?.length || 0;

    res.json({
      totalVisits,
      uniqueVisitors,
      pageViews: agg?.pageViews || 0,
      avgSessionDurationSec: Math.round(agg?.avgSessionDurationSec || 0),
      bounceRate: totalVisits ? Math.round(((agg?.bounces || 0) / totalVisits) * 1000) / 10 : 0,
      newVisitorPct: totalVisits ? Math.round(((agg?.newVisitors || 0) / totalVisits) * 1000) / 10 : 0,
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
    const match = { isBot: false, ...dateFilterFor('startedAt', period) };
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
      isBot: false,
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
    const match = { isBot: false, type: 'pageview', ...dateFilterFor('timestamp', req.query.period) };

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
   GET /sources
====================================================== */
router.get('/sources', async (req, res) => {
  try {
    const match = { isBot: false, ...dateFilterFor('startedAt', req.query.period) };

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
    const match = { isBot: false, ...dateFilterFor('startedAt', req.query.period) };

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
    const match = { isBot: false, country: { $ne: '' }, ...dateFilterFor('startedAt', req.query.period) };

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

export default router;
