// ======================================================
// REFUND WORKER (FINAL CLEAN VERSION)
// ======================================================

import Order from '../models/order.js';
import stripe from '../config/stripe.js';

export function startRefundWorker() {
  const REFUND_DELAY_MS = Number(process.env.REFUND_DELAY_MS || 60000);

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
          if (!order.paymentIntentId) {
            console.log('❌ Missing paymentIntentId');
            continue;
          }

          if (order.paymentStatus !== 'refund_scheduled') {
            console.log('⚠ Skipping invalid paymentStatus:', order.paymentStatus);
            continue;
          }

          console.log('🚀 Sending refund to Stripe...');

          const refund = await stripe.refunds.create({
            payment_intent: order.paymentIntentId,
          });

          console.log('✅ Stripe refund SUCCESS:', refund.id);

          // ============================
          // UPDATE ORDER
          // ============================

          order.paymentStatus = 'refunded';
          order.refundStatus = 'processed';
          order.refundedAt = new Date();
          order.refundScheduledAt = null;

          // ============================
          // HISTORY (NO DUPLICATE)
          // ============================

          const alreadyRefunded = order.statusHistory?.some((h) => h.status === 'Refunded');

          if (!alreadyRefunded) {
            order.statusHistory.push({
              status: 'Refunded',
              note: 'Processed by worker',
              date: new Date(),
            });
          }

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
