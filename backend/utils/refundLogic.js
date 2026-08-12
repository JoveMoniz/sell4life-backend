import stripe from '../config/stripe.js';
import { pushUniqueHistory, pushItemHistory } from './historyLogic.js';
import { calculateItemRefundAmount } from './returnLogic.js';

// Default gives a real same-day safety window (long enough to catch an
// accidental order cancel and hit "Cancel Refund") without holding a
// genuine cancellation's refund back meaningfully — override via env var
// if a different window is ever needed.
const REFUND_DELAY_MS = Number(process.env.REFUND_DELAY_MS || 2 * 60 * 60 * 1000);

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
// TRIGGER PER-ITEM REFUND (immediate, auto — no worker)
// Call after cancel approval or mark-returned.
// On Stripe failure: sets item.refundStatus = 'failed', logs, returns { success: false }.
// Does NOT throw — callers must still save the order.
// ======================================================
export async function triggerItemRefund(order, item, refundQty, actorId) {
  try {
    const qty = Number(refundQty);
    let refundTotal = calculateItemRefundAmount(item, qty).total;
    let cappedFrom = null;

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
      // that needs a manual admin data patch.
      const pi = await stripe.paymentIntents.retrieve(order.paymentIntentId, {
        expand: ['latest_charge'],
      });
      const charge = pi.latest_charge;

      if (charge && typeof charge === 'object') {
        const remaining = (charge.amount - charge.amount_refunded) / 100;

        if (refundTotal > remaining + 0.005) {
          cappedFrom = refundTotal;
          refundTotal = Math.max(0, remaining);
        }
      }

      if (refundTotal <= 0) {
        throw new Error('Nothing left unrefunded on this charge');
      }

      const stripeRefund = await stripe.refunds.create({
        payment_intent: order.paymentIntentId,
        amount: Math.round(refundTotal * 100),
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
