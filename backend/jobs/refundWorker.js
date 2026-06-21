// ======================================================
// REFUND WORKER (FINAL CLEAN VERSION)
// ======================================================
import { pushUniqueHistory, pushItemHistory } from '../utils/historyLogic.js';
import { getDerivedOrderStatus } from '../utils/orderLogic.js';

import Order from '../models/order.js';
import stripe from '../config/stripe.js';

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
        const amount = Number(item.goodwillRefundAmount || 0);

        if (amount <= 0 || !order.paymentIntentId) {
          throw new Error('Invalid goodwill refund amount or missing payment intent');
        }

        console.log('🎁 Processing goodwill refund:', item._id, amount);

        const stripeRefund = await stripe.refunds.create({
          payment_intent: order.paymentIntentId,
          amount: Math.round(amount * 100),
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
          note: 'Goodwill refund processed (24h review window elapsed)',
        });

        pushUniqueHistory(order, 'Goodwill Refund Processed', `Goodwill refund of £${amount.toFixed(2)} processed for ${item.name}`);
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
