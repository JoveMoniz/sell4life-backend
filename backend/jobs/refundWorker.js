// ======================================================
// REFUND WORKER (FINAL CLEAN VERSION)
// ======================================================
import { pushUniqueHistory, pushItemHistory } from '../utils/historyLogic.js';
import { getDerivedOrderStatus } from '../utils/orderLogic.js';
import { calculateItemRefundAmount } from '../utils/returnLogic.js';
import { finalizeCjCancelHold, CJ_CANCEL_RETRY_INTERVAL_HOURS, CJ_CANCEL_MAX_RETRY_HOURS } from '../utils/refundLogic.js';
import { convertRefundToChargeCurrency, convertChargeToGbp } from '../utils/chargeCurrency.js';
import { attemptCjOrderCancel } from '../utils/cjProductSync.js';
import { mailOrderCancelled } from '../utils/email.js';

import Order from '../models/order.js';
import stripe from '../config/stripe.js';

// ======================================================
// CJ CANCEL HOLD — item-level. Never refunds on a blind timer: a held item
// only gets refunded once CJ actually confirms the cancellation. This job
// re-asks CJ every CJ_CANCEL_RETRY_INTERVAL_HOURS (refundScheduledAt here
// means "next retry due", not "refund at" — see holdItemForCjCancelDenied).
// If nothing confirms within CJ_CANCEL_MAX_RETRY_HOURS of the original hold,
// auto-retry stops and the item is left for a human (vendor/admin) to
// decide — no refund fires automatically past that point.
// ======================================================
async function processCjCancelHoldRetries(now) {
  const orders = await Order.find({
    'items.cjCancelDenied': true,
    'items.refundStatus': 'scheduled',
    'items.refundScheduledAt': { $lte: now },
  });

  for (const order of orders) {
    let changed = false;

    for (const item of order.items) {
      if (!item.cjCancelDenied || item.refundStatus !== 'scheduled') continue;
      if (!item.refundScheduledAt || item.refundScheduledAt > now) continue;

      changed = true;

      // The CJ tracking sync worker (cjOrderStatusSyncWorker.js) keeps polling
      // held items exactly like any other in-flight item and will flip this to
      // 'Delivered' the moment CJ confirms it — independently of this hold.
      // Refunding here would hand the buyer the item AND the money back, so
      // pull it out of the retry queue and leave it for a human to resolve.
      if (item.status === 'Delivered') {
        item.refundStatus = 'requested';
        item.refundScheduledAt = null;

        pushItemHistory(item, {
          type: 'cj_cancel_hold_resolved',
          status: 'failed',
          amount: 0,
          note: `Auto-refund withheld — CJ confirmed delivery of "${item.name}" during the hold window. Needs manual review instead of an automatic refund.`,
        });

        pushUniqueHistory(
          order,
          'Refund Held — Needs Review',
          `"${item.name}" — delivered during the CJ-cancel hold window; auto-refund withheld, needs manual review`
        );

        continue;
      }

      // Re-ask CJ. Two independent confirmation signals: attemptCjOrderCancel
      // actively retries the cancel call itself (catches a transient earlier
      // failure — auth blip, rate limit — while the order is still genuinely
      // uncommitted on CJ's side); item.cjOrderStatus === 'CANCELLED' catches
      // CJ (or the vendor, directly in CJ's dashboard) having cancelled it
      // independently, which the general tracking sync deliberately never
      // acts on for a normal order but is exactly the confirmation we want
      // for an item we ourselves already flagged as held.
      const retry = await attemptCjOrderCancel(item);
      const confirmed = retry?.cjCancelled || item.cjOrderStatus === 'CANCELLED';

      if (confirmed) {
        // finalizeCjCancelHold logs its own item-level 'cj_cancel_confirmed'
        // history entry — no need to duplicate it here.
        const { refundResult } = await finalizeCjCancelHold(order, item, null, 'CJ confirmed cancellation on automatic retry');

        const buyer = await order.populate('user', 'email').then((o) => o.user).catch(() => null);
        if (buyer?.email) {
          mailOrderCancelled({
            to: buyer.email,
            orderRef: order.shortId || order._id,
            itemName: item.name,
            refundAmount: refundResult?.success ? refundResult.refundedAmount : null,
            refundImmediate: true,
            refundPending: !!refundResult && !refundResult.success,
          }).catch(() => {});
        }

        continue;
      }

      const hoursSinceHold = (now - item.cjCancelDeniedAt) / (60 * 60 * 1000);

      if (hoursSinceHold >= CJ_CANCEL_MAX_RETRY_HOURS) {
        item.refundStatus = 'requested';
        item.refundScheduledAt = null;

        pushItemHistory(item, {
          type: 'cj_cancel_hold_resolved',
          status: 'failed',
          amount: 0,
          note: `CJ still hasn't confirmed cancellation of "${item.name}" after ${CJ_CANCEL_MAX_RETRY_HOURS}h of retries — stopping automatic retry, needs a vendor/admin decision`,
        });

        pushUniqueHistory(
          order,
          'Refund Held — Needs Review',
          `"${item.name}" — CJ never confirmed cancellation after ${CJ_CANCEL_MAX_RETRY_HOURS}h; automatic retry stopped, needs manual decision`
        );

        continue;
      }

      // Still unresolved, still within the window — check again in
      // CJ_CANCEL_RETRY_INTERVAL_HOURS.
      item.refundScheduledAt = new Date(now.getTime() + CJ_CANCEL_RETRY_INTERVAL_HOURS * 60 * 60 * 1000);
    }

    if (changed) {
      order.paymentStatus = order.items.every((i) => i.refundStatus === 'processed')
        ? 'refunded'
        : order.items.some((i) => ['processed', 'partially_refunded'].includes(i.refundStatus))
          ? 'partially_refunded'
          : order.paymentStatus;

      order.status = getDerivedOrderStatus(order);

      order.markModified('items');
      await order.save();
    }
  }
}

// ======================================================
// GOODWILL REFUNDS — vendor-scheduled, item-level, 24h delay
// ======================================================
async function processGoodwillRefunds(now) {
  const orders = await Order.find({
    'items.goodwillRefund': true,
    'items.refundStatus': 'scheduled',
    'items.refundScheduledAt': { $lte: now },
  });

  for (const order of orders) {
    let changed = false;

    for (const item of order.items) {
      if (!item.goodwillRefund || item.refundStatus !== 'scheduled') continue;
      if (!item.refundScheduledAt || item.refundScheduledAt > now) continue;

      changed = true;

      try {
        let amount = Number(item.goodwillRefundAmount || 0); // GBP — admin enters this like every other money field
        let cappedFrom = null;

        if (amount <= 0 || !order.paymentIntentId) {
          throw new Error('Invalid goodwill refund amount or missing payment intent');
        }

        // Convert to whatever this order was actually charged in (GBP/rate
        // 1 for the vast majority) using the order's OWN stored rate —
        // never a freshly re-fetched live rate — so this stays
        // mathematically consistent with the original charge.
        let { stripeAmount } = convertRefundToChargeCurrency(order, amount);

        // The amount was validated at scheduling time against a ceiling built
        // from item.shippingCost, which can be stale — re-check against the
        // real remaining charge balance right before sending to Stripe, so a
        // stale-data mismatch degrades to "refund what's available" instead
        // of failing silently 24h after the vendor scheduled it. Comparison
        // happens in charge-currency minor units throughout.
        const pi = await stripe.paymentIntents.retrieve(order.paymentIntentId, {
          expand: ['latest_charge'],
        });
        const charge = pi.latest_charge;

        if (charge && typeof charge === 'object') {
          const remainingStripeAmount = charge.amount - charge.amount_refunded;

          if (stripeAmount > remainingStripeAmount) {
            cappedFrom = amount;
            stripeAmount = Math.max(0, remainingStripeAmount);
            amount = convertChargeToGbp(stripeAmount, order.chargeCurrency || 'GBP', order.chargeToGbpRate || 1);
          }
        }

        if (stripeAmount <= 0) {
          throw new Error('Nothing left unrefunded on this charge');
        }

        console.log('🎁 Processing goodwill refund:', item._id, amount);

        const stripeRefund = await stripe.refunds.create({
          payment_intent: order.paymentIntentId,
          amount: stripeAmount,
          metadata: {
            orderId: String(order._id),
            itemId: String(item._id),
            type: 'goodwill',
          },
        });

        item.refundedQuantity = item.quantity;
        item.refundedAmount = Number(item.refundedAmount || 0) + amount;
        item.refundedAt = new Date();
        item.refundStatus = 'processed';
        item.refundScheduledAt = null;

        pushItemHistory(item, {
          type: 'goodwill_refund_processed',
          stripeRefundId: stripeRefund.id,
          status: 'processed',
          amount,
          note: cappedFrom
            ? `Goodwill refund processed (24h review window elapsed, capped from £${cappedFrom.toFixed(2)} to remaining charge balance)`
            : 'Goodwill refund processed (24h review window elapsed)',
        });

        pushUniqueHistory(
          order,
          'Goodwill Refund Processed',
          cappedFrom
            ? `Goodwill refund of £${amount.toFixed(2)} processed for ${item.name} (capped from £${cappedFrom.toFixed(2)} — only that much remained unrefunded on the charge)`
            : `Goodwill refund of £${amount.toFixed(2)} processed for ${item.name}`
        );
      } catch (err) {
        console.error('💥 Goodwill refund error:', err.message);
        item.refundStatus = 'failed';
        item.refundScheduledAt = null;
        pushUniqueHistory(order, 'Goodwill Refund Failed', `Goodwill refund failed for ${item.name}: ${err.message}`);
      }
    }

    if (changed) {
      order.paymentStatus = order.items.every((i) => i.refundStatus === 'processed')
        ? 'refunded'
        : order.items.some((i) => ['processed', 'partially_refunded'].includes(i.refundStatus))
          ? 'partially_refunded'
          : order.paymentStatus;

      order.status = getDerivedOrderStatus(order);

      order.markModified('items');
      await order.save();
    }
  }
}

export function startRefundWorker() {
  const START_TIME = new Date('2026-04-25T21:00:00Z');

  setInterval(async () => {
    const now = new Date();

    console.log('⏱ Worker tick:', now.toISOString());

    try {
      await processGoodwillRefunds(now);
    } catch (err) {
      console.error('💥 GOODWILL REFUND WORKER ERROR:', err.message);
    }

    try {
      await processCjCancelHoldRetries(now);
    } catch (err) {
      console.error('💥 CJ CANCEL HOLD RETRY WORKER ERROR:', err.message);
    }

    try {
      const orders = await Order.find({
        paymentStatus: 'refund_scheduled',
        refundScheduledAt: { $lte: now },
        createdAt: { $gte: START_TIME },
      });

      console.log('🔍 Orders found:', orders.length);

      for (const order of orders) {
        console.log('👉 Processing order:', order._id);

        try {
          // ============================================
          // SAFETY CHECKS
          // ============================================

          if (!order.paymentIntentId) {
            console.log('❌ Missing paymentIntentId');
            continue;
          }

          if (order.paymentStatus !== 'refund_scheduled') {
            console.log('⚠ Skipping invalid paymentStatus:', order.paymentStatus);
            continue;
          }

          // ============================================
          // PREVENT DUPLICATE REFUNDS
          // ============================================

          if (order.refundedAt || order.stripeRefundId) {
            console.log('⚠ Refund already processed');
            continue;
          }

          console.log('🚀 Sending refund to Stripe...');

          // ============================================
          // LOCK REFUND PROCESSING
          // ============================================

          const alreadyRefundedItems = order.items.some(
            (item) =>
              Number(item.refundedQuantity || 0) > 0 ||
              Number(item.refundedAmount || 0) > 0 ||
              ['processed', 'partially_refunded', 'processing'].includes(item.refundStatus)
          );

          if (alreadyRefundedItems) {
            console.log('⚠ Item-level refunds already exist. Skipping worker refund.');

            order.paymentStatus = 'partially_refunded';

            await order.save();

            continue;
          }

          order.paymentStatus = 'refund_processing';
          order.refundStatus = 'processing';

          await order.save();

          console.log('🚀 Sending refund to Stripe...');

          // ============================================
          // STRIPE REFUND
          // ============================================

          const refund = await stripe.refunds.create({
            payment_intent: order.paymentIntentId,
          });

          console.log('✅ Stripe refund SUCCESS:', refund.id);

          // ============================================
          // UPDATE ORDER
          // ============================================

          order.paymentStatus = 'refunded';
          order.refundStatus = 'processed';

          order.refundedAt = new Date();

          order.refundScheduledAt = null;

          // save stripe refund id
          order.stripeRefundId = refund.id;

          // ============================================
          // CLEAN VENDOR ORDERS
          // ============================================

          order.items.forEach((item) => {
            item.refundScheduledAt = null;

            if (item.refundStatus === 'scheduled') {
              // This full-order refund only ever flipped refundStatus to
              // 'processed' without recording what each item actually got
              // back — leaving item.refundedAmount at 0 forever, which made
              // goodwill's maxGoodwill calc (price - refundedAmount) think
              // nothing had been refunded and kept offering the full price.
              const outstandingQty = Number(item.quantity || 0) - Number(item.refundedQuantity || 0);
              if (outstandingQty > 0) {
                const amount = calculateItemRefundAmount(item, outstandingQty).total;
                item.refundedQuantity = Number(item.refundedQuantity || 0) + outstandingQty;
                item.refundedAmount   = Number(item.refundedAmount   || 0) + amount;
                item.refundedAt       = new Date();
              }
              item.refundStatus = 'processed';
            }

            // =========================================
            // FINALIZE CANCELLED ITEMS
            // =========================================

            if (item.status === 'Cancel Requested') {
              item.status = 'Cancelled';
            }
          });

          // ============================================
          // CLEAN ITEMS
          // ============================================

          order.items.forEach((item) => {
            item.refundScheduledAt = null;

            if (item.refundStatus === 'scheduled') {
              item.refundStatus = 'processed';
            }
          });

          // ============================================
          // HISTORY (NO DUPLICATES)
          // ============================================

          order.status = getDerivedOrderStatus(order);

          pushUniqueHistory(order, 'Refunded', 'Processed by worker');

          order.markModified('vendorOrders');
          order.markModified('items');

          await order.save();

          console.log('💾 DB updated to REFUNDED');
        } catch (err) {
          console.error('💥 STRIPE ERROR:', err.message);
        }
      }
    } catch (err) {
      console.error('💥 WORKER ERROR:', err.message);
    }
  }, 60 * 1000);
}
