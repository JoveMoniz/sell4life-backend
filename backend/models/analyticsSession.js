import mongoose from 'mongoose';

const analyticsSessionSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, unique: true, index: true },
    visitorId: { type: String, required: true, index: true },
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    startedAt:   { type: Date, required: true, default: Date.now },
    lastSeenAt:  { type: Date, required: true, default: Date.now },
    endedAt:     { type: Date, default: null },
    durationSec: { type: Number, default: 0 },

    entryPage:      { type: String, default: '' },
    exitPage:       { type: String, default: '' },
    referrer:       { type: String, default: '' },
    referrerDomain: { type: String, default: '' },
    trafficSource: {
      type: String,
      enum: ['direct', 'search', 'social', 'referral', 'email', 'paid'],
      default: 'direct',
    },

    utmSource:   { type: String, default: '' },
    utmMedium:   { type: String, default: '' },
    utmCampaign: { type: String, default: '' },
    utmTerm:     { type: String, default: '' },
    utmContent:  { type: String, default: '' },

    device:       { type: String, enum: ['desktop', 'mobile', 'tablet', 'other'], default: 'other' },
    browser:      { type: String, default: '' },
    os:           { type: String, default: '' },
    screenWidth:  { type: Number, default: null },
    screenHeight: { type: Number, default: null },

    // ISO country code resolved from IP via local MaxMind lookup at ingest
    // time — the raw IP itself is never persisted.
    country: { type: String, default: '' },

    isNewVisitor: { type: Boolean, default: true },
    isBot:        { type: Boolean, default: false },
    // Advisory-only tag (client-reported, not server-verified) so internal
    // traffic can be filtered later without needing to re-instrument.
    isInternal:   { type: Boolean, default: false },

    pageViewCount: { type: Number, default: 0 },
    eventCount:    { type: Number, default: 0 },
  },
  { timestamps: true }
);

analyticsSessionSchema.index({ lastSeenAt: -1 });
analyticsSessionSchema.index({ startedAt: -1 });
analyticsSessionSchema.index({ isBot: 1, startedAt: -1 });
analyticsSessionSchema.index({ visitorId: 1, startedAt: -1 });

export default mongoose.models.AnalyticsSession || mongoose.model('AnalyticsSession', analyticsSessionSchema);
