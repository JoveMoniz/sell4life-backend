import mongoose from 'mongoose';

// One document per calendar day (UTC midnight). Built by the nightly
// rollup worker from raw AnalyticsSession/AnalyticsEvent docs once a day
// is old enough that its raw data is about to be pruned — keeps
// long-range views (Year to Date, All Time) cheap without keeping every
// raw session/event around forever.
const analyticsDailyRollupSchema = new mongoose.Schema(
  {
    date: { type: Date, required: true, unique: true, index: true },

    totalVisits: { type: Number, default: 0 },
    uniqueVisitors: { type: Number, default: 0 },
    pageViews: { type: Number, default: 0 },
    avgSessionDurationSec: { type: Number, default: 0 },
    bounces: { type: Number, default: 0 },
    newVisitors: { type: Number, default: 0 },

    trafficSource: { type: mongoose.Schema.Types.Mixed, default: {} },
    devices: { type: mongoose.Schema.Types.Mixed, default: {} },
    browsers: { type: mongoose.Schema.Types.Mixed, default: {} },
    os: { type: mongoose.Schema.Types.Mixed, default: {} },
    countries: { type: mongoose.Schema.Types.Mixed, default: {} },

    funnel: {
      visitors: { type: Number, default: 0 },
      productViews: { type: Number, default: 0 },
      addToCart: { type: Number, default: 0 },
      checkoutStart: { type: Number, default: 0 },
      purchases: { type: Number, default: 0 },
    },

    // Set once raw AnalyticsSession/AnalyticsEvent docs for this day have
    // actually been deleted — lets the prune step skip days with nothing
    // left to delete instead of re-running deleteMany against them forever.
    rawDataPruned: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.models.AnalyticsDailyRollup
  || mongoose.model('AnalyticsDailyRollup', analyticsDailyRollupSchema);
