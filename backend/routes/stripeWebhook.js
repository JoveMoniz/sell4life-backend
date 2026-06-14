// ======================================================
// SELL4LIFE – STRIPE WEBHOOK (HARDENED VERSION)
// ======================================================
import { pushUniqueHistory } from '../utils/historyLogic.js';
import { mailOrderConfirmation, mailNewOrderVendor, mailRefundConfirmed } from '../utils/email.js';
import express from 'express';
import stripe from '../config/stripe.js';
import Order from '../models/order.js';
import Product from '../models/product.js';
import Vendor from '../models/vendor.js';

const router = express.Router();

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
  console.warn('⚠ STRIPE_WEBHOOK_SECRET is missing (dev mode)');
}

/* ======================================================
   STRIPE WEBHOOK
====================================================== */

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const signature = req.headers['stripe-signature'];

  let event;

  try {
    if (WEBHOOK_SECRET) {
      event = stripe.webhooks.constructEvent(req.body, signature, WEBHOOK_SECRET);
    } else {
      event = JSON.parse(req.body.toString());
    }
  } catch (err) {
    console.error('❌ Webhook verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    console.log('🔥 Stripe event:', event.type);

    /* ======================================================
       PAYMENT SUCCESS
    ====================================================== */

    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object;

      console.log('📦 FULL METADATA:', paymentIntent.metadata);

      // -----------------------------
      // SAFE METADATA PARSING
      // -----------------------------
      let rawItems = [];

      try {
        rawItems = JSON.parse(paymentIntent.metadata.items || '[]');
      } catch (e) {
        console.error('❌ Invalid metadata JSON:', paymentIntent.metadata.items);
        throw new Error('Invalid metadata format');
      }

      const userId = paymentIntent.metadata.userId;

      if (!userId) {
        throw new Error('Missing userId in metadata');
      }

      if (!rawItems.length) {
        console.error('❌ CRITICAL: No items in metadata');
        throw new Error('Missing items metadata');
      }

      const items = [];

      // -----------------------------
      // BUILD ITEMS FROM DATABASE
      // -----------------------------
      for (const raw of rawItems) {
        const product = await Product.findOne({
          _id: raw.productId,
          active: true,
          archived: { $ne: true },
        });

        if (!product) {
          throw new Error(`Product not found: ${raw.productId}`);
        }

        const quantity = Number(raw.quantity);
        if (!Number.isFinite(quantity) || quantity <= 0) {
          throw new Error('Invalid quantity');
        }
        const price = Number(product.price);
        const shippingCost = Number(product.shippingCost || 0);
        const subtotal = price * quantity;

        items.push({
          productId: product._id,
          vendorId: product.vendor,
          name: product.name || 'Unknown Product',
          price,
          quantity,
          subtotal,
          shippingCost,
          image: product.images?.[0] || '/assets/images/products/sell4life-placeholder.png',
        });
      }

      // -----------------------------
      // PREVENT DUPLICATES
      // -----------------------------
      const existingOrder = await Order.findOne({
        paymentIntentId: paymentIntent.id,
      });

      if (existingOrder) {
        console.log('⚠ Order already exists:', existingOrder._id);
        return res.json({ received: true });
      }

      // -----------------------------
      // UPDATE INVENTORY
      // -----------------------------
      for (const item of items) {
        const product = await Product.findById(item.productId);

        if (product.trackInventory) {
          if (product.stock < item.quantity) {
            throw new Error(`${product.name} out of stock`);
          }
          product.stock -= item.quantity;
        }

        product.salesCount = (product.salesCount || 0) + item.quantity;
        await product.save();
      }

      // -----------------------------
      // VENDOR SPLIT
      // -----------------------------
      const vendorMap = {};

      for (const item of items) {
        const v = item.vendorId.toString();
        if (!vendorMap[v]) vendorMap[v] = [];
        vendorMap[v].push(item);
      }

      const vendorOrders = Object.keys(vendorMap).map((vendorId) => {
        const list = vendorMap[vendorId];
        const subtotal  = list.reduce((s, i) => s + i.subtotal, 0);
        const shipping  = list.reduce((s, i) => s + Number(i.shippingCost || 0), 0);

        return {
          vendorId,
          items: list,
          subtotal,
          shipping,
          tax: 0,
          total: subtotal + shipping,
          status: 'Pending',
        };
      });

      // -----------------------------
      // CREATE ORDER
      // -----------------------------
      const orderSubtotal = items.reduce((s, i) => s + i.subtotal, 0);
      const orderShipping = Number(paymentIntent.metadata.shipping || 0);

      const order = await Order.create({
        user: userId,
        items,
        vendorOrders,
        subtotal: orderSubtotal,
        shippingAmount: orderShipping,
        total: paymentIntent.amount / 100,
        status: 'Pending',
        paymentStatus: 'paid',
        paymentIntentId: paymentIntent.id,
        statusHistory: [],
      });

      pushUniqueHistory(order, 'Pending', 'Payment successful');

      // Fetch actual Stripe fee from balance transaction
      try {
        const chargeId = paymentIntent.latest_charge;
        if (chargeId) {
          const charge = await stripe.charges.retrieve(chargeId);
          if (charge.balance_transaction) {
            const balanceTxn = await stripe.balanceTransactions.retrieve(charge.balance_transaction);
            order.stripeFeeAmount = Number((balanceTxn.fee / 100).toFixed(2));
          }
        }
      } catch (feeErr) {
        // Non-fatal — fall back to estimate at display time
        console.warn('Could not retrieve Stripe fee:', feeErr.message);
      }

      await order.save();

      console.log('🎉 Order created:', order._id);

      // Fire emails (non-blocking)
      (async () => {
        try {
          console.log('[email] Starting email dispatch for order:', order._id);
          const User = (await import('../models/user.js')).default;
          const buyer = await User.findById(userId).lean();
          console.log('[email] Buyer found:', buyer ? buyer.email : 'NOT FOUND');
          if (buyer?.email) {
            await mailOrderConfirmation({
              to: buyer.email,
              orderRef: order.shortId || String(order._id).slice(-8).toUpperCase(),
              items: items.map(i => ({ name: i.name, qty: i.quantity, price: i.subtotal })),
              total: order.total,
              shippingAddress: paymentIntent.metadata.shippingAddress || '',
            });
            console.log('[email] Buyer confirmation sent to:', buyer.email);
          }

          const vendorIds = [...new Set(items.map(i => String(i.vendorId)))];
          for (const vid of vendorIds) {
            const vendor = await Vendor.findById(vid).populate('userId', 'email').lean();
            const vendorEmail = vendor?.userId?.email;
            console.log('[email] Vendor email for', vid, ':', vendorEmail || 'NOT FOUND');
            if (vendorEmail) {
              const vendorItems = items.filter(i => String(i.vendorId) === vid);
              await mailNewOrderVendor({
                to: vendorEmail,
                storeName: vendor.storeName || 'Your Store',
                orderRef: order.shortId || String(order._id).slice(-8).toUpperCase(),
                items: vendorItems.map(i => ({ name: i.name, qty: i.quantity })),
              });
              console.log('[email] Vendor notification sent to:', vendorEmail);
            }
          }
        } catch (emailErr) {
          console.warn('[email] Order email failed:', emailErr.message, emailErr.stack);
        }
      })();
    }

    /* ======================================================
   REFUND EVENT
====================================================== */
    if (event.type === 'charge.refunded' || event.type === 'charge.refund.updated') {
      const refund = event.data.object;

      const paymentIntentId = refund.payment_intent;

      console.log('💰 Refund event:', paymentIntentId);

      const order = await Order.findOne({
        paymentIntentId,
      });

      if (!order) {
        console.log('⚠ No order found for refund');
        return res.json({ received: true });
      }

      // =====================================================
      // PREVENT DUPLICATE PROCESSING
      // =====================================================

      if (order.stripeRefundId === refund.id) {
        console.log('⚠ Refund already processed');
        return res.json({ received: true });
      }

      // =====================================================
      // REFUND TOTALS
      // =====================================================

      const refundedAmount = Number(refund.amount || 0) / 100;

      order.refundAmount = Number(order.refundAmount || 0) + refundedAmount;

      const fullyRefunded = Number(order.refundAmount || 0) >= Number(order.total || 0);

      // =====================================================
      // PAYMENT STATE
      // =====================================================

      order.paymentStatus = fullyRefunded ? 'refunded' : 'partially_refunded';

      order.refundStatus = fullyRefunded ? 'processed' : 'partially_refunded';

      order.refundScheduledAt = null;

      order.refundedAt = new Date();

      // =====================================================
      // CLEAR VENDOR REFUND SCHEDULES
      // =====================================================

      order.vendorOrders.forEach((vo) => {
        vo.refundScheduledAt = null;

        if (vo.refundStatus === 'scheduled') {
          vo.refundStatus = fullyRefunded ? 'processed' : 'partially_refunded';
        }

        if (vo.status === 'Refund Scheduled') {
          vo.status = fullyRefunded ? 'Refunded' : 'Partially Refunded';
        }
      });

      // =====================================================
      // CLEAR ITEM REFUND SCHEDULES
      // =====================================================

      order.items.forEach((item) => {
        item.refundScheduledAt = null;

        if (item.refundStatus === 'scheduled') {
          item.refundStatus = fullyRefunded ? 'processed' : 'partially_refunded';
        }
      });

      // =====================================================
      // MARK ARRAYS AS MODIFIED
      // =====================================================

      order.markModified('vendorOrders');
      order.markModified('items');

      // =====================================================
      // HISTORY
      // =====================================================

      const alreadyRefunded = order.statusHistory.some((h) => h.status === 'Refunded');

      if (!alreadyRefunded) {
        pushUniqueHistory(
          order,
          fullyRefunded ? 'Refunded' : 'Partially Refunded',
          'Refund confirmed by Stripe'
        );
      }

      // =====================================================
      // SAVE STRIPE REFUND ID
      // =====================================================

      order.stripeRefundId = refund.id;

      await order.save();

      // Email buyer refund confirmation
      try {
        const buyer = await order.populate('user', 'email').then(o => o.user);
        if (buyer?.email) {
          await mailRefundConfirmed({ to: buyer.email, orderRef: order.shortId || order._id, amount: refundedAmount });
        }
      } catch (emailErr) {
        console.warn('[email] Refund email failed:', emailErr.message);
      }

      console.log('↩ Order refunded:', order._id);
    }
    /* ======================================================
       DISPUTE OPENED
    ====================================================== */
    if (event.type === 'charge.dispute.created') {
      const dispute = event.data.object;
      const paymentIntentId = dispute.payment_intent;

      if (!paymentIntentId) {
        console.warn('⚠ Dispute has no payment_intent:', dispute.id);
      } else {
        const order = await Order.findOne({ paymentIntentId });

        if (!order) {
          console.warn('⚠ No order found for dispute:', dispute.id);
        } else {
          const alreadyRecorded = order.disputes.some(d => d.stripeDisputeId === dispute.id);

          if (!alreadyRecorded) {
            order.disputes.push({
              stripeDisputeId: dispute.id,
              amount:          dispute.amount / 100,
              currency:        (dispute.currency || 'gbp').toUpperCase(),
              reason:          dispute.reason || 'unknown',
              status:          dispute.status,
              evidenceDueBy:   dispute.evidence_details?.due_by
                ? new Date(dispute.evidence_details.due_by * 1000) : null,
              createdAt:       new Date(dispute.created * 1000),
            });
            order.markModified('disputes');
            pushUniqueHistory(order, 'Disputed', `Chargeback opened: ${dispute.reason}`);
            await order.save();
            console.log('⚠ Dispute recorded on order:', order._id);
          }
        }
      }
    }

    /* ======================================================
       DISPUTE UPDATED / CLOSED
    ====================================================== */
    if (event.type === 'charge.dispute.updated' || event.type === 'charge.dispute.closed') {
      const dispute = event.data.object;
      const paymentIntentId = dispute.payment_intent;

      if (paymentIntentId) {
        const order = await Order.findOne({ paymentIntentId });

        if (order) {
          const existing = order.disputes.find(d => d.stripeDisputeId === dispute.id);

          if (existing) {
            existing.status    = dispute.status;
            existing.updatedAt = new Date();

            if (dispute.status === 'lost' || dispute.status === 'won') {
              existing.resolvedAt = new Date();
            }
            order.markModified('disputes');

            if (dispute.status === 'won') {
              pushUniqueHistory(order, 'Dispute Won', 'Chargeback resolved in your favour');
            } else if (dispute.status === 'lost') {
              pushUniqueHistory(order, 'Dispute Lost', 'Chargeback resolved — funds returned to customer');
            }

            await order.save();
            console.log(`⚡ Dispute ${dispute.status} on order:`, order._id);
          }
        }
      }
    }
  } catch (err) {
    console.error('❌ Webhook error:', err);
    return res.status(500).json({ error: 'Webhook failed' });
  }

  res.json({ received: true });
});

export default router;
