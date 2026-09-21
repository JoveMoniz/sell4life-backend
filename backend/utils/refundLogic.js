import stripe from '../config/stripe.js';
import { pushUniqueHistory, pushItemHistory } from './historyLogic.js';
import { calculateItemRefundAmount } from './returnLogic.js';
import { convertRefundToChargeCurrency, convertChargeToGbp } from './chargeCurrency.js';

// Default gives a real same-day safety window (long enough to catch an
// accidental order cancel and hit "Cancel Refund") without holding a
// genuine cancellation's refund back meaningfully — override via env var
// if a different window is ever needed.
const REFUND_DELAY_MS = Number(process.env.REFUND_DELAY_MS || 2 * 60 * 60 * 1000);

// When CJ refuses to cancel (item already dispatched), the refund is never
// fired on a blind timer — it only fires once CJ actually confirms the
// cancellation. To get that confirmation as fast as possible, the worker
// re-asks CJ every CJ_CANCEL_RETRY_INTERVAL_HOURS. If nothing has resolved
// within CJ_CANCEL_MAX_RETRY_HOURS of the original hold, auto-retry stops
// and the item is left for a human (vendor/admin) to decide — no automatic
// refund fires past that point, since CJ never actually confirmed the item
// won't arrive.
export const CJ_CANCEL_RETRY_INTERVAL_HOURS = Number(process.env.CJ_CANCEL_RETRY_INTERVAL_HOURS || 2);
export const CJ_CANCEL_MAX_RETRY_HOURS = Number(process.env.CJ_CANCEL_MAX_RETRY_HOURS || 24);
// Kept only so CJ_CANCEL_HOLD_HOURS-named references elsewhere (e.g. the
// buyer-facing "cancellation update" email) still have a human-readable
// window to quote — reflects the auto-retry ceiling, not a refund deadline.
export const CJ_CANCEL_HOLD_HOURS = CJ_CANCEL_MAX_RETRY_HOURS;

export function scheduleRefund(order) {
  // 🚫 Prevent duplicate scheduling FIRST
  if (order.refundScheduledAt) return;

  const now = new Date();
  const refundTime = new Date(now.getTime() + REFUND_DELAY_MS);

  // ========================
  // PAYMENT STATE
  // ========================
  order.paymentStatus = 'refund_scheduled';
  order.refundScheduledAt = refundTime;

  order.refundStatus = 'scheduled';
  order.refundType = 'auto';
  order.refundRequestedBy = 'system';

  // ========================
  // HISTORY (single source of truth)
  // ========================
  pushUniqueHistory(
    order,
    'Refund Scheduled',
    'Auto refund scheduled',
    new Date(now.getTime() + 1000)
  );

  // ========================
  // VENDOR SYNC
  // ========================
  order.vendorOrders.forEach((vo) => {
    if (!vo.refundScheduledAt) {
      vo.refundScheduledAt = refundTime;
    }
  });
}

// ======================================================
// HOLD AN ITEM WHEN CJ REFUSES TO CANCEL
// Leaves item.status exactly as it is (does NOT advance it to Cancelled —
// the item may genuinely still be on its way). refundScheduledAt here means
// "next auto-retry due", not "refund at" — refundWorker.js re-asks CJ every
// CJ_CANCEL_RETRY_INTERVAL_HOURS and only refunds once CJ actually confirms
// the cancellation. Callers must still order.markModified('items') and
// save() afterward.
// ======================================================
export function holdItemForCjCancelDenied(order, item, reason) {
  item.cjCancelDenied = true;
  item.cjCancelDeniedAt = new Date();
  item.refundStatus = 'scheduled';
  item.refundScheduledAt = new Date(Date.now() + CJ_CANCEL_RETRY_INTERVAL_HOURS * 60 * 60 * 1000);

  pushItemHistory(item, {
    type: 'cj_cancel_held',
    status: 'scheduled',
    note: `Cancellation requested but CJ could not stop the shipment${reason ? ` (${reason})` : ''} — we'll keep checking with the supplier and refund as soon as the cancellation is confirmed`,
  });

  pushUniqueHistory(
    order,
    'Cancel Held',
    `"${item.name}" — CJ could not stop the shipment, holding refund pending confirmation`
  );
}

// ======================================================
// ABANDON A CJ-CANCEL HOLD — the merchant decides to let the shipment
// proceed instead of continuing to chase a confirmation that was never
// coming. Item.status is left exactly as it already is (it was never
// advanced to Cancelled while held), so the order just continues its
// normal fulfillment lifecycle. No refund has fired at this point — this
// only clears the hold/retry state, never touches Stripe.
// Callers must still order.markModified('items') and save() afterward.
// ======================================================
export function abandonCjCancelHold(order, item, actorNote) {
  item.cjCancelDenied = false;
  item.cjCancelDeniedAt = null;
  item.refundStatus = 'none';
  item.refundScheduledAt = null;

  pushItemHistory(item, {
    type: 'cj_cancel_abandoned',
    status: 'cancelled',
    amount: 0,
    note: `Cancellation abandoned${actorNote ? ` (${actorNote})` : ''} — CJ never confirmed it could stop the shipment, so the order continues as normal instead of retrying.`,
  });

  pushUniqueHistory(
    order,
    'Cancel Abandoned',
    `"${item.name}" — cancellation abandoned, order continues as normal`
  );
}

// ======================================================
// FINALIZE A HELD ITEM ONCE CJ CONFIRMS THE CANCELLATION
// Shared by the vendor's manual "Retry CJ cancel" button (vendor.js) and the
// worker's automatic retry (refundWorker.js) so both resolve a confirmed
// hold identically: mark Cancelled, refund immediately (safe — CJ confirming
// cancellation means nothing shipped/nothing charged to the vendor), and
// notify the buyer. Callers must still order.markModified('items') and
// save() afterward; this does not touch res/req so it works from either a
// route handler or a background worker tick.
// ======================================================
export async function finalizeCjCancelHold(order, item, vendorId, resolutionNote) {
  item.cjCancelDenied = false;
  item.cjCancelDeniedAt = null;
  item.refundScheduledAt = null;
  item.refundStatus = 'none';
  item.statusBeforeCancel = item.statusBeforeCancel || item.status;
  item.status = 'Cancelled';
  item.cancelledAt = item.cancelledAt || new Date();

  const isPaid = ['paid', 'partially_refunded'].includes((order.paymentStatus || '').toLowerCase());
  const outstandingQty = Math.max(0, Number(item.quantity || 0) - Number(item.refundedQuantity || 0));

  let refundResult = null;
  if (isPaid && order.paymentIntentId && outstandingQty > 0) {
    refundResult = await triggerItemRefund(order, item, outstandingQty, vendorId || null);
  }

  pushItemHistory(item, {
    type: 'cj_cancel_confirmed',
    status: refundResult?.success !== false ? 'processed' : 'failed',
    amount: refundResult?.refundedAmount || 0,
    note: refundResult && !refundResult.success
      ? `${resolutionNote || 'CJ confirmed cancellation'} — refund attempt failed: ${refundResult.error}`
      : resolutionNote || 'CJ confirmed cancellation',
  });

  pushUniqueHistory(
    order,
    'Cancelled',
    `"${item.name}" — ${resolutionNote || 'CJ confirmed cancellation'}`
  );

  return { refundResult };
}

// ======================================================
// TRIGGER PER-ITEM REFUND (immediate, auto — no worker)
// Call after cancel approval or mark-returned.
// On Stripe failure: sets item.refundStatus = 'failed', logs, returns { success: false }.
// Does NOT throw — callers must still save the order.
// ======================================================
export async function triggerItemRefund(order, item, refundQty, actorId) {
  try {
    const qty = Number(refundQty);
    let refundTotal = calculateItemRefundAmount(item, qty).total; // GBP — item.price etc. are always GBP
    let cappedFrom = null;

    // Convert to whatever this order was actually charged in (GBP/rate 1
    // for the vast majority of orders) using the order's OWN stored rate —
    // never a freshly re-fetched live rate — so this refund is guaranteed
    // mathematically consistent with the original charge.
    let { stripeAmount: refundStripeAmount } = convertRefundToChargeCurrency(order, refundTotal);

    let stripeRefundId = null;

    if (order.stripeRefundId) {
      // Worker already issued a full Stripe refund — money is back; just record DB entries.
      stripeRefundId = order.stripeRefundId;
    } else if (order.paymentIntentId) {
      // item.shippingCost is a checkout-time snapshot that can go stale (e.g. the
      // historical shipIncluded bug, or a product's free-shipping setting changing
      // after the order was placed) — rather than trust it blindly and let Stripe
      // hard-reject an over-large request, cap against what's actually still
      // unrefunded on the real charge before calling Stripe. This makes any future
      // stale-data case degrade to "refund what's available" instead of a failure
      // that needs a manual admin data patch. Comparison happens in charge-currency
      // minor units throughout — charge.amount/amount_refunded are already in
      // whatever currency this PaymentIntent was actually created in.
      const pi = await stripe.paymentIntents.retrieve(order.paymentIntentId, {
        expand: ['latest_charge'],
      });
      const charge = pi.latest_charge;

      if (charge && typeof charge === 'object') {
        const remainingStripeAmount = charge.amount - charge.amount_refunded;

        if (refundStripeAmount > remainingStripeAmount) {
          cappedFrom = refundTotal;
          refundStripeAmount = Math.max(0, remainingStripeAmount);
          // Re-derive the GBP figure from the capped charge-currency amount
          // for item.refundedAmount bookkeeping below, which stays GBP
          // always regardless of charge currency.
          refundTotal = convertChargeToGbp(refundStripeAmount, order.chargeCurrency || 'GBP', order.chargeToGbpRate || 1);
        }
      }

      if (refundStripeAmount <= 0) {
        throw new Error('Nothing left unrefunded on this charge');
      }

      const stripeRefund = await stripe.refunds.create({
        payment_intent: order.paymentIntentId,
        amount: refundStripeAmount,
        metadata: {
          orderId:  String(order._id),
          itemId:   String(item._id),
          quantity: String(qty),
          trigger:  'auto',
        },
      });
      stripeRefundId = stripeRefund.id;
    }

    item.refundedQuantity = Number(item.refundedQuantity || 0) + qty;
    item.refundedAmount   = Number(item.refundedAmount   || 0) + refundTotal;
    item.refundedAt       = new Date();
    item.refundStatus     = item.refundedQuantity >= Number(item.quantity) ? 'processed' : 'partially_refunded';

    order.paymentStatus = order.items.every((i) => i.refundStatus === 'processed')
      ? 'refunded'
      : 'partially_refunded';
    order.refundStatus  = order.paymentStatus === 'refunded' ? 'processed' : 'partially_refunded';

    pushUniqueHistory(
      order,
      item.refundStatus === 'processed' ? 'Refunded' : 'Partially Refunded',
      cappedFrom
        ? `Auto-refund: ${item.name} x${qty} (£${refundTotal.toFixed(2)} — capped from £${cappedFrom.toFixed(2)}, only that much remained unrefunded on the charge)`
        : `Auto-refund: ${item.name} x${qty}`
    );

    pushItemHistory(item, {
      type:          item.refundStatus === 'processed' ? 'refund_processed' : 'partial_refund',
      stripeRefundId,
      status:        item.refundStatus,
      quantity:      qty,
      amount:        refundTotal,
      note:          cappedFrom
        ? `Automatic refund on cancel/return (capped from £${cappedFrom.toFixed(2)} to remaining charge balance)`
        : 'Automatic refund on cancel/return',
      by:            actorId,
    });

    return { success: true, stripeRefundId, refundedAmount: refundTotal, cappedFrom };
  } catch (err) {
    console.error('triggerItemRefund error:', err);
    item.refundStatus = 'failed';
    pushUniqueHistory(order, 'Refund Failed', `Auto-refund failed for ${item.name}: ${err.message}`);
    return { success: false, error: err.message };
  }
}
