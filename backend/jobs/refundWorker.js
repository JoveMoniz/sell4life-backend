// ======================================================
// REFUND WORKER (FINAL CLEAN VERSION)
// ======================================================
import { pushUniqueHistory } from '../utils/historyLogic.js';
import { getDerivedOrderStatus } from '../utils/orderLogic.js';

import Order from '../models/order.js';
import stripe from '../config/stripe.js';

export function startRefundWorker() {
  const START_TIME = new Date('2026-04-25T21:00:00Z');

  setInterval(async () => {
    const now = new Date();

    console.log('⏱ Worker tick:', now.toISOString());

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
