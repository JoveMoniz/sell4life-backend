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
import cjProvider from '../utils/shippingProviders/cjdropshipping.js';
import { decryptCredential } from '../utils/shippingProviders/registry.js';

const router = express.Router();

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

if (!WEBHOOK_SECRET) {
  console.warn('⚠ STRIPE_WEBHOOK_SECRET is missing (dev mode)');
}

/* ======================================================
   STRIPE WEBHOOK
====================================================== */

router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!WEBHOOK_SECRET) {
    console.error('❌ Refusing webhook: STRIPE_WEBHOOK_SECRET is not configured');
    return res.status(503).send('Webhook not configured');
  }

  const signature = req.headers['stripe-signature'];

  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, WEBHOOK_SECRET);
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
      const vendorFreeReturnsCache = {};

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
        // Must match the same check used when the PaymentIntent amount was
        // calculated (orders.js) — otherwise a shipIncluded product ends up
        // with a non-zero shippingCost stamped on the order even though
        // nothing was actually charged for shipping.
        const shippingCost = product.shipIncluded ? 0 : Number(product.shippingCost || 0);
        const subtotal = price * quantity;

        // Resolve free-returns: product-level override wins, else the vendor's store default
        let freeReturns;
        if (typeof product.freeReturns === 'boolean') {
          freeReturns = product.freeReturns;
        } else {
          const vendorIdStr = String(product.vendor);
          if (!(vendorIdStr in vendorFreeReturnsCache)) {
            const v = await Vendor.findById(product.vendor).select('freeReturns');
            vendorFreeReturnsCache[vendorIdStr] = !!v?.freeReturns;
          }
          freeReturns = vendorFreeReturnsCache[vendorIdStr];
        }

        // Resolve the actual variant sub-document the buyer selected (if any),
        // so its attributes (color/size etc.) can be stamped on the order item —
        // the same match is reused below for the CJ auto-order vid lookup.
        const matchedVariant = raw.variantSku
          ? (product.variants || []).find(v => v.sku && v.sku.trim() === String(raw.variantSku).trim())
          : null;

        items.push({
          productId: product._id,
          vendorId: product.vendor,
          variantSku: raw.variantSku || '',
          attributes: matchedVariant?.attributes || {},
          name: product.name || 'Unknown Product',
          price,
          quantity,
          subtotal,
          shippingCost,
          freeReturns,
          supplier: product.supplier || '',
          supplierUrl: product.supplierUrl || '',
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

      let shippingAddress;
      try {
        shippingAddress = paymentIntent.metadata.shippingAddress
          ? JSON.parse(paymentIntent.metadata.shippingAddress)
          : undefined;
      } catch (_) {
        shippingAddress = undefined;
      }

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
        shippingAddress,
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

      // Recalculate HMRC threshold for each vendor in this order (non-blocking)
      (async () => {
        try {
          const { recalcHmrcStatus } = await import('../utils/hmrcThreshold.js');
          const vendorIds = [...new Set(items.map(i => String(i.vendorId)))];
          for (const vid of vendorIds) {
            await recalcHmrcStatus(vid);
          }
        } catch (err) {
          console.warn('[hmrc] Threshold recalc failed:', err.message);
        }
      })();

      // Auto-create matching orders on CJ (unpaid — payType "3") for any
      // CJ-sourced item belonging to a professional vendor with CJ
      // credentials connected. Never blocks order confirmation — failures
      // are recorded on the item so the vendor can place it manually.
      (async () => {
        if (!shippingAddress) return;
        try {
          const vendorCache = {};
          let changed = false;

          for (const item of order.items) {
            try {
              const vendorIdStr = String(item.vendorId);
              if (!(vendorIdStr in vendorCache)) {
                vendorCache[vendorIdStr] = await Vendor.findById(item.vendorId).lean();
              }
              const vendor = vendorCache[vendorIdStr];
              if (!vendor || vendor.type !== 'professional') continue;

              const rawCred = vendor.supplierCredentials?.cjdropshipping;
              if (!rawCred) continue;

              const product = await Product.findById(item.productId).select('variants').lean();
              const variants = product?.variants || [];
              const matched = variants.find(v => v.sku && item.variantSku && v.sku.trim() === item.variantSku.trim());
              // Only fall back to "any variant with a cjVid" when there's genuinely
              // no choice to get wrong (0 or 1 variants total). For a real
              // multi-variant product, guessing risks shipping the wrong
              // color/size — skip and flag it for manual ordering instead.
              const vid = matched?.cjVid || (variants.length <= 1 ? variants.find(v => v.cjVid)?.cjVid : null);
              if (!vid) {
                if (variants.length > 1 && !matched) {
                  item.cjOrderStatus = 'failed';
                  item.cjOrderError = 'Could not match the ordered variant to a CJ product — place this order manually';
                  changed = true;
                }
                continue; // not a CJ-sourced item, or ambiguous variant match
              }

              const credential = decryptCredential(rawCred);
              const result = await cjProvider.createOrder({
                orderNumber: `${order.shortId || order._id}-${item._id}`,
                vid,
                quantity: item.quantity,
                destinationCountry: shippingAddress.country || 'GB',
                address: shippingAddress,
              }, credential);

              if (result?.error) {
                item.cjOrderStatus = 'failed';
                item.cjOrderError = result.error;
                console.warn(`[cj-auto-order] failed for item ${item._id}:`, result.error);
              } else {
                item.cjOrderId = result.orderId || '';
                item.cjOrderNumber = result.orderNumber || '';
                item.cjOrderStatus = result.status || 'CREATED';
                item.cjOrderCreatedAt = new Date();
                console.log(`[cj-auto-order] created for item ${item._id}: ${result.orderId}`);
              }
              changed = true;
            } catch (itemErr) {
              console.warn('[cj-auto-order] item error:', itemErr.message);
            }
          }

          if (changed) {
            order.markModified('items');
            await order.save();
          }
        } catch (err) {
          console.warn('[cj-auto-order] failed:', err.message);
        }
      })();

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
              shippingAddress: shippingAddress
                ? [shippingAddress.name, shippingAddress.address1, shippingAddress.address2, shippingAddress.city, shippingAddress.county, shippingAddress.postcode]
                    .filter(Boolean).join(', ')
                : '',
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
    /* ======================================================
       CONNECTED ACCOUNT UPDATED (vendor payout status)
    ====================================================== */
    if (event.type === 'account.updated') {
      const account = event.data.object;
      const vendor = await Vendor.findOne({ stripeAccountId: account.id });

      if (vendor) {
        const payoutEnabled = !!account.payouts_enabled;
        if (vendor.payoutEnabled !== payoutEnabled) {
          vendor.payoutEnabled = payoutEnabled;
          await vendor.save();
          console.log(`🏦 Vendor ${vendor._id} payoutEnabled -> ${payoutEnabled}`);
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
