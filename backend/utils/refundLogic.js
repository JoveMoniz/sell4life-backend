import stripe from '../config/stripe.js';
import { pushUniqueHistory, pushItemHistory } from './historyLogic.js';

const REFUND_DELAY_MS = Number(process.env.REFUND_DELAY_MS || 15000);

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
    const qty   = Number(refundQty);
    const price = Number(item.price || 0);
    const refundTotal = Math.max(
      0,
      qty * price
        + Number(item.taxAmount      || 0)
        + Number(item.shippingAmount || 0)
        - Number(item.discountAmount || 0)
    );

    let stripeRefundId = null;

    if (order.stripeRefundId) {
      // Worker already issued a full Stripe refund — money is back; just record DB entries.
      stripeRefundId = order.stripeRefundId;
    } else if (order.paymentIntentId) {
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
      `Auto-refund: ${item.name} x${qty}`
    );

    pushItemHistory(item, {
      type:          item.refundStatus === 'processed' ? 'refund_processed' : 'partial_refund',
      stripeRefundId,
      status:        item.refundStatus,
      quantity:      qty,
      amount:        refundTotal,
      note:          'Automatic refund on cancel/return',
      by:            actorId,
    });

    return { success: true, stripeRefundId, refundedAmount: refundTotal };
  } catch (err) {
    console.error('triggerItemRefund error:', err);
    item.refundStatus = 'failed';
    pushUniqueHistory(order, 'Refund Failed', `Auto-refund failed for ${item.name}: ${err.message}`);
    return { success: false, error: err.message };
  }
}
