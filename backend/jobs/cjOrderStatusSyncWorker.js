// ======================================================
// CJ ORDER STATUS SYNC WORKER
// createOrder() (cjdropshipping.js) only ever captures a one-time
// snapshot of an order's status at the moment it's auto-created on
// CJ when a buyer pays — item.cjOrderStatus then sits frozen forever,
// even once CJ actually ships/delivers it. This worker periodically
// refreshes real status/tracking for any item still short of that,
// and writes into the SAME buyer-facing trackingNumber/carrier/status
// fields the vendor's manual "Save & Notify Buyer" tracking form uses
// — so both the vendor and buyer order pages pick it up automatically,
// no frontend changes needed.
// ======================================================
import Vendor from '../models/vendor.js';
import User from '../models/user.js';
import Product from '../models/product.js';
import Order from '../models/order.js';
import Conversation from '../models/conversation.js';
import { decryptCredential } from '../utils/shippingProviders/registry.js';
import { getOrderStatusBatch } from '../utils/shippingProviders/cjdropshipping.js';
import { pushUniqueHistory } from '../utils/historyLogic.js';
import { mailOrderShipped } from '../utils/email.js';

// CJ statuses that mean "still in flight" — anything else (SHIPPED,
// DELIVERED, CANCELLED) is either terminal or handled by the mapping
// below, so items in those CJ states don't need to keep being polled.
const CJ_IN_FLIGHT = new Set(['CREATED', 'UNPAID', 'PENDING', 'PROCESSING', 'UNSHIPPED']);

// Never touch an item outside these buyer-facing states — an active
// cancel/return flow (or an item already Shipped/Delivered) must never
// be overwritten by an out-of-band CJ update.
const TOUCHABLE_STATUSES = new Set(['Pending', 'Processing']);

async function notifyBuyerShipped(order, item, vendor, trackNum, carrierStr) {
  // Mirrors vendor.js's PATCH /orders/:id/items/:itemId/tracking route —
  // same two side effects (email + in-app message) a vendor's manual
  // "Save & Notify Buyer" action triggers, so the buyer experience is
  // identical whether a human or this sync flipped the tracking info.
  try {
    const buyer = await User.findById(order.user).lean();
    if (buyer?.email) {
      await mailOrderShipped({
        to: buyer.email,
        orderRef: order.shortId || String(order._id).slice(-8).toUpperCase(),
        trackingNumber: trackNum,
        carrier: carrierStr,
        storeName: vendor.storeName,
      });
    }
  } catch (e) {
    console.error('[cj-order-status-sync] shipped email error:', e.message);
  }

  try {
    let convo = await Conversation.findOne({ buyer: order.user, vendor: vendor._id, product: item.productId });
    if (!convo) {
      const product = await Product.findById(item.productId).select('name slug').lean();
      const buyerUser = await User.findById(order.user).select('name username').lean();
      convo = new Conversation({
        product:     item.productId,
        productName: product?.name || item.name || 'Product',
        productSlug: product?.slug || '',
        buyer:       order.user,
        buyerName:   buyerUser?.name || buyerUser?.username || 'Buyer',
        vendor:      vendor._id,
        vendorName:  vendor.storeName || 'Seller',
      });
    }
    convo.messages.push({
      sender:     vendor.userId,
      senderRole: 'vendor',
      body:       `📦 Shipped — tracking ${trackNum}${carrierStr ? ` via ${carrierStr}` : ''}`,
    });
    convo.unreadBuyer += 1;
    convo.lastMessageAt = new Date();
    await convo.save();
  } catch (e) {
    console.error('[cj-order-status-sync] shipped message error:', e.message);
  }
}

export async function processCjOrderStatusSync() {
  const summary = { vendorsChecked: 0, itemsChecked: 0, updated: 0, errors: 0, details: [] };

  const vendors = await Vendor.find({
    type: 'professional',
    'supplierCredentials.cjdropshipping': { $exists: true, $ne: null },
  });

  for (const vendor of vendors) {
    let credential;
    try {
      credential = decryptCredential(vendor.supplierCredentials.cjdropshipping);
    } catch (err) {
      summary.errors++;
      summary.details.push({ vendorId: String(vendor._id), storeName: vendor.storeName, error: 'Bad CJ credential: ' + err.message });
      continue;
    }
    summary.vendorsChecked++;

    // Orders with at least one of this vendor's items still CJ-auto-ordered
    // and not yet past Processing — everything else (never CJ-ordered,
    // already Shipped/Delivered, or in a cancel/return state) is excluded
    // at the query level so this worker never has to reason about them.
    const orders = await Order.find({
      'items.vendorId': vendor._id,
      'items.cjOrderId': { $ne: '' },
      'items.status': { $in: Array.from(TOUCHABLE_STATUSES) },
    });

    // Map CJ orderId -> { order, item } for this vendor's in-flight items only.
    const byOrderId = new Map();
    for (const order of orders) {
      for (const item of order.items) {
        if (String(item.vendorId) !== String(vendor._id)) continue;
        if (!item.cjOrderId || !TOUCHABLE_STATUSES.has(item.status)) continue;
        byOrderId.set(item.cjOrderId, { order, item });
      }
    }
    if (!byOrderId.size) continue;

    let statuses;
    try {
      statuses = await getOrderStatusBatch(Array.from(byOrderId.keys()), credential);
    } catch (err) {
      summary.errors++;
      summary.details.push({ vendorId: String(vendor._id), storeName: vendor.storeName, error: 'getOrderStatusBatch failed: ' + err.message });
      continue;
    }
    if (statuses?.error) {
      summary.errors++;
      summary.details.push({ vendorId: String(vendor._id), storeName: vendor.storeName, error: statuses.error });
      continue;
    }

    const touchedOrders = new Set();

    for (const s of statuses) {
      const match = byOrderId.get(s.orderId);
      if (!match) continue;
      const { order, item } = match;
      summary.itemsChecked++;

      try {
        item.cjOrderStatus = s.orderStatus || item.cjOrderStatus;
        if (CJ_IN_FLIGHT.has(s.orderStatus)) {
          if (s.orderStatus === 'PROCESSING' || s.orderStatus === 'UNSHIPPED') {
            if (item.status === 'Pending') {
              item.status = 'Processing';
              pushUniqueHistory(order, 'Processing', 'CJ tracking sync — order is being prepared by the supplier');
              touchedOrders.add(order);
              summary.updated++;
            }
          }
          continue;
        }

        if (s.orderStatus === 'SHIPPED' && s.trackNumber) {
          const wasAlreadyTracked = !!item.trackingNumber;
          item.trackingNumber = s.trackNumber;
          if (s.trackingProvider) item.carrier = s.trackingProvider;
          item.status = 'Shipped';
          item.shippedAt = item.shippedAt || new Date();
          pushUniqueHistory(order, 'Shipped', 'CJ tracking sync — supplier shipped this item');
          touchedOrders.add(order);
          summary.updated++;

          // Only notify the first time this item crosses into Shipped —
          // a re-poll after that would otherwise re-send the email/message
          // on every tick until CJ reports DELIVERED.
          if (!wasAlreadyTracked) {
            await notifyBuyerShipped(order, item, vendor, s.trackNumber, s.trackingProvider || '');
          }
          continue;
        }

        if (s.orderStatus === 'DELIVERED' && item.status === 'Shipped') {
          item.status = 'Delivered';
          item.deliveredAt = new Date();
          pushUniqueHistory(order, 'Delivered', 'CJ tracking sync — supplier reports this item delivered');
          touchedOrders.add(order);
          summary.updated++;
        }
        // CANCELLED on CJ's side is deliberately not mirrored here — that's
        // a vendor/admin decision on our side, not something CJ's status
        // alone should silently trigger against a paid order.
      } catch (err) {
        summary.errors++;
        summary.details.push({ vendorId: String(vendor._id), orderId: String(order._id), itemId: String(item._id), error: err.message });
      }
    }

    for (const order of touchedOrders) {
      try {
        await order.save();
      } catch (err) {
        summary.errors++;
        summary.details.push({ vendorId: String(vendor._id), orderId: String(order._id), error: 'order.save failed: ' + err.message });
      }
    }
  }

  return summary;
}

export function startCjOrderStatusSyncWorker() {
  const INTERVAL_MS = 2 * 60 * 60 * 1000; // every 2 hours

  setInterval(async () => {
    console.log('⏱ CJ order status sync worker tick:', new Date().toISOString());
    try {
      const summary = await processCjOrderStatusSync();
      if (summary.updated > 0) {
        console.log(`📦 CJ order status sync: ${summary.updated} item(s) updated across ${summary.vendorsChecked} vendor(s)`);
      }
      if (summary.errors > 0) {
        console.warn(`⚠ CJ order status sync: ${summary.errors} error(s)`, summary.details.filter(d => d.error));
      }
    } catch (err) {
      console.error('💥 CJ ORDER STATUS SYNC WORKER ERROR:', err.message);
    }
  }, INTERVAL_MS);
}
