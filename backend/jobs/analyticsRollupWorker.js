// ======================================================
// ANALYTICS ROLLUP + RETENTION WORKER
// Compresses each day's raw AnalyticsSession/AnalyticsEvent docs into a
// single AnalyticsDailyRollup once the day is old enough that its
// beacons have all settled (ROLLUP_DELAY_DAYS buffer), then — only for
// days that already have a rollup — deletes the raw docs once they're
// older than RAW_RETENTION_DAYS. A day's raw data is never deleted
// before it has been safely rolled up.
// ======================================================
import AnalyticsSession from '../models/analyticsSession.js';
import AnalyticsEvent from '../models/analyticsEvent.js';
import AnalyticsDailyRollup from '../models/analyticsDailyRollup.js';

const ROLLUP_DELAY_DAYS = 2;
const RAW_RETENTION_DAYS = 180;
const MAX_DAYS_PER_RUN = 60;

const FUNNEL_EVENT_TYPES = ['product_view', 'add_to_cart', 'checkout_start', 'purchase'];

function startOfUTCDay(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function addDays(d, n) {
  return new Date(d.getTime() + n * 24 * 60 * 60 * 1000);
}

function toCountMap(rows) {
  return rows.reduce((m, r) => {
    if (r._id) m[r._id] = r.count;
    return m;
  }, {});
}

async function rollupOneDay(day, nextDay) {
  const sessionMatch = { isBot: false, isInternal: false, startedAt: { $gte: day, $lt: nextDay } };
  const eventMatch = { isBot: false, isInternal: false, timestamp: { $gte: day, $lt: nextDay } };

  const [summaryAgg, sourceAgg, deviceAgg, browserAgg, osAgg, countryAgg, funnelAgg] = await Promise.all([
    AnalyticsSession.aggregate([
      { $match: sessionMatch },
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
    AnalyticsSession.aggregate([{ $match: sessionMatch }, { $group: { _id: '$trafficSource', count: { $sum: 1 } } }]),
    AnalyticsSession.aggregate([{ $match: sessionMatch }, { $group: { _id: '$device', count: { $sum: 1 } } }]),
    AnalyticsSession.aggregate([{ $match: { ...sessionMatch, browser: { $ne: '' } } }, { $group: { _id: '$browser', count: { $sum: 1 } } }]),
    AnalyticsSession.aggregate([{ $match: { ...sessionMatch, os: { $ne: '' } } }, { $group: { _id: '$os', count: { $sum: 1 } } }]),
    AnalyticsSession.aggregate([{ $match: { ...sessionMatch, country: { $ne: '' } } }, { $group: { _id: '$country', count: { $sum: 1 } } }]),
    AnalyticsEvent.aggregate([
      { $match: { ...eventMatch, type: { $in: FUNNEL_EVENT_TYPES } } },
      { $group: { _id: { type: '$type', sessionId: '$sessionId' } } },
      { $group: { _id: '$_id.type', count: { $sum: 1 } } },
    ]),
  ]);

  const s = summaryAgg[0] || {};
  const funnelCounts = toCountMap(funnelAgg);

  await AnalyticsDailyRollup.updateOne(
    { date: day },
    {
      $set: {
        date: day,
        totalVisits: s.totalVisits || 0,
        uniqueVisitors: s.uniqueVisitors?.length || 0,
        pageViews: s.pageViews || 0,
        avgSessionDurationSec: Math.round(s.avgSessionDurationSec || 0),
        bounces: s.bounces || 0,
        newVisitors: s.newVisitors || 0,
        trafficSource: toCountMap(sourceAgg),
        devices: toCountMap(deviceAgg),
        browsers: toCountMap(browserAgg),
        os: toCountMap(osAgg),
        countries: toCountMap(countryAgg),
        funnel: {
          visitors: s.totalVisits || 0,
          productViews: funnelCounts.product_view || 0,
          addToCart: funnelCounts.add_to_cart || 0,
          checkoutStart: funnelCounts.checkout_start || 0,
          purchases: funnelCounts.purchase || 0,
        },
      },
    },
    { upsert: true }
  );
}

export async function processAnalyticsRollup() {
  const summary = { rolledUp: 0, prunedDays: 0, prunedSessions: 0, prunedEvents: 0 };

  const now = new Date();
  const rollupCutoff = addDays(startOfUTCDay(now), -ROLLUP_DELAY_DAYS);

  const earliestSession = await AnalyticsSession.findOne({}, {}, { sort: { startedAt: 1 } }).select('startedAt');

  if (earliestSession) {
    let day = startOfUTCDay(earliestSession.startedAt);
    let processed = 0;

    while (day < rollupCutoff && processed < MAX_DAYS_PER_RUN) {
      const nextDay = addDays(day, 1);
      const alreadyRolledUp = await AnalyticsDailyRollup.exists({ date: day });

      if (!alreadyRolledUp) {
        await rollupOneDay(day, nextDay);
        summary.rolledUp++;
      }

      day = nextDay;
      processed++;
    }
  }

  // Prune raw data — only for days that already have a rollup, so a day's
  // raw data is never lost before it has been safely compressed.
  const deletionCutoff = addDays(startOfUTCDay(now), -RAW_RETENTION_DAYS);
  const prunable = await AnalyticsDailyRollup
    .find({ date: { $lt: deletionCutoff }, rawDataPruned: false })
    .select('date')
    .lean();

  for (const { date } of prunable) {
    const nextDay = addDays(date, 1);
    const [eventsResult, sessionsResult] = await Promise.all([
      AnalyticsEvent.deleteMany({ timestamp: { $gte: date, $lt: nextDay } }),
      AnalyticsSession.deleteMany({ startedAt: { $gte: date, $lt: nextDay } }),
    ]);

    await AnalyticsDailyRollup.updateOne({ date }, { $set: { rawDataPruned: true } });

    summary.prunedDays++;
    summary.prunedSessions += sessionsResult.deletedCount;
    summary.prunedEvents += eventsResult.deletedCount;
  }

  return summary;
}

export function startAnalyticsRollupWorker() {
  const INTERVAL_MS = 24 * 60 * 60 * 1000; // once a day

  setInterval(async () => {
    console.log('⏱ Analytics rollup worker tick:', new Date().toISOString());
    try {
      const summary = await processAnalyticsRollup();
      console.log('📊 Analytics rollup summary:', summary);
    } catch (err) {
      console.error('💥 ANALYTICS ROLLUP WORKER ERROR:', err.message);
    }
  }, INTERVAL_MS);
}
