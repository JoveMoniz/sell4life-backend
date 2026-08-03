import express from 'express';
import mongoose from 'mongoose';

import AnalyticsSession from '../models/analyticsSession.js';
import AnalyticsEvent from '../models/analyticsEvent.js';
import { isBotUserAgent, parseUserAgent } from '../utils/uaParser.js';
import { lookupCountry } from '../utils/geoip.js';
import { classifyTrafficSource, referrerDomainOf } from '../utils/trafficSource.js';

const router = express.Router();

const EVENT_TYPES = [
  'pageview', 'product_view', 'add_to_cart', 'checkout_start',
  'purchase', 'search', 'store_view', 'signup', 'custom',
];

/* ======================================================
   POST /api/track/event
   Public, unauthenticated — most visitors aren't logged in.
   Never errors out to the client; a tracking failure must never
   surface as a visible problem on the site.
====================================================== */
router.post('/event', async (req, res) => {
  // Always respond fast and successfully — sendBeacon doesn't read the
  // response anyway, and a tracking hiccup must never be visible to users.
  res.status(200).json({ ok: true });

  try {
    const body = req.body || {};
    const { sessionId, visitorId, type } = body;

    if (!sessionId || !visitorId || !EVENT_TYPES.includes(type)) return;

    const ua = req.headers['user-agent'] || '';
    const isBot = isBotUserAgent(ua);
    const isInternal = !!body.isInternal;
    const userId = mongoose.Types.ObjectId.isValid(body.userId) ? body.userId : null;
    const now = new Date();
    const path = String(body.path || '').slice(0, 500);

    let session = await AnalyticsSession.findOne({ sessionId }).select('_id');

    if (!session) {
      const { device, browser, os } = parseUserAgent(ua);
      const country = lookupCountry(req.ip);
      const referrer = String(body.referrer || '').slice(0, 500);
      const utm = body.utm || {};

      const isNewVisitor = !(await AnalyticsSession.exists({ visitorId, sessionId: { $ne: sessionId } }));

      await AnalyticsSession.create({
        sessionId,
        visitorId,
        userId,
        startedAt: now,
        lastSeenAt: now,
        entryPage: path,
        exitPage: path,
        referrer,
        referrerDomain: referrerDomainOf(referrer),
        trafficSource: classifyTrafficSource({ referrer, utmMedium: utm.medium }),
        utmSource: String(utm.source || '').slice(0, 200),
        utmMedium: String(utm.medium || '').slice(0, 200),
        utmCampaign: String(utm.campaign || '').slice(0, 200),
        utmTerm: String(utm.term || '').slice(0, 200),
        utmContent: String(utm.content || '').slice(0, 200),
        device,
        browser,
        os,
        screenWidth: Number.isFinite(body.screen?.width) ? body.screen.width : null,
        screenHeight: Number.isFinite(body.screen?.height) ? body.screen.height : null,
        country,
        isNewVisitor,
        isBot,
        isInternal,
        pageViewCount: type === 'pageview' ? 1 : 0,
        eventCount: 1,
      });
    } else {
      await AnalyticsSession.updateOne(
        { sessionId },
        {
          $set: { lastSeenAt: now, exitPage: path },
          $inc: { pageViewCount: type === 'pageview' ? 1 : 0, eventCount: 1 },
        }
      );
    }

    await AnalyticsEvent.create({
      sessionId,
      visitorId,
      userId,
      type,
      path,
      title: String(body.title || '').slice(0, 300),
      timeOnPageSec: Number.isFinite(body.timeOnPageSec) ? body.timeOnPageSec : null,
      isBot,
      isInternal,
      metadata: body.metadata && typeof body.metadata === 'object' ? body.metadata : {},
      timestamp: now,
    });
  } catch (err) {
    // Deliberately swallowed — response already sent, this is fire-and-forget.
    console.warn('[track] event error:', err.message);
  }
});

export default router;
