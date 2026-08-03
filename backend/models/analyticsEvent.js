import mongoose from 'mongoose';

const analyticsEventSchema = new mongoose.Schema(
  {
    sessionId: { type: String, required: true, index: true },
    visitorId: { type: String, required: true, index: true },
    userId:    { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    type: {
      type: String,
      enum: [
        'pageview',
        'product_view',
        'add_to_cart',
        'checkout_start',
        'purchase',
        'search',
        'store_view',
        'signup',
        'custom',
      ],
      required: true,
      index: true,
    },

    path:  { type: String, default: '' },
    title: { type: String, default: '' },

    // Populated best-effort via a pagehide/visibilitychange beacon — not
    // load-bearing for the phase-1 dashboard (session-level durationSec is
    // used instead), kept for a future per-page time-on-page report.
    timeOnPageSec: { type: Number, default: null },

    isBot:      { type: Boolean, default: false },
    isInternal: { type: Boolean, default: false },

    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },

    timestamp: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

analyticsEventSchema.index({ type: 1, timestamp: -1 });
analyticsEventSchema.index({ sessionId: 1, timestamp: 1 });
analyticsEventSchema.index({ path: 1, timestamp: -1 });

export default mongoose.models.AnalyticsEvent || mongoose.model('AnalyticsEvent', analyticsEventSchema);
