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
import { mailOrderShipped, mailOrderDelivered } from '../utils/email.js';
import { getDerivedVendorStatus } from '../utils/orderLogic.js';

// CJ statuses that mean "still in flight" — anything else (SHIPPED,
// DELIVERED, CANCELLED) is either terminal or handled by the mapping
// below, so items in those CJ states don't need to keep being polled.
const CJ_IN_FLIGHT = new Set(['CREATED', 'UNPAID', 'PENDING', 'PROCESSING', 'UNSHIPPED']);

// Never touch an item outside these buyer-facing states — an active
// cancel/return flow (or an item already Delivered) must never be
// overwritten by an out-of-band CJ update. 'Shipped' IS included: the
// DELIVERED-transition logic below only fires when item.status is already
// 'Shipped', so excluding it here would mean the query above never even
// surfaces a shipped item again — CJ reporting DELIVERED would then have
// no in-flight item left to apply it to, silently and permanently.
export const TOUCHABLE_STATUSES = new Set(['Pending', 'Processing', 'Shipped']);

export async function notifyBuyerShipped(order, item, vendor, trackNum, carrierStr) {
  // Mirrors vendor.js's PATCH /orders/:id/items/:itemId/tracking route —
  // same two side effects (email + in-app message) a vendor's manual
  // "Save & Notify Buyer" action triggers, so the buyer experience is
  // identical whether a human or this sync flipped the tracking info.
  // Returns per-step results so a caller can surface real failures instead
  // of them only ever reaching a server log nobody's watching.
  const result = { emailSent: false, emailError: null, messageSent: false, messageError: null };

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
      result.emailSent = true;
    } else {
      result.emailError = 'buyer has no email on file';
    }
  } catch (e) {
    console.error('[cj-order-status-sync] shipped email error:', e.message);
    result.emailError = e.message;
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
    result.messageSent = true;
  } catch (e) {
    console.error('[cj-order-status-sync] shipped message error:', e.message);
    result.messageError = e.message;
  }

  return result;
}

// Same shape as notifyBuyerShipped, for the Delivered transition — called
// from both this worker and vendor.js's manual "mark Delivered" route
// (dynamic-imported there, same way adminOrders.js already imports
// processCjOrderStatusSync), so there's one source of truth for what
// "notify the buyer their item was delivered" actually does.
export async function notifyBuyerDelivered(order, item, vendor) {
  const result = { emailSent: false, emailError: null, messageSent: false, messageError: null };

  try {
    const buyer = await User.findById(order.user).lean();
    if (buyer?.email) {
      await mailOrderDelivered({
        to: buyer.email,
        orderRef: order.shortId || String(order._id).slice(-8).toUpperCase(),
        storeName: vendor.storeName,
      });
      result.emailSent = true;
    } else {
      result.emailError = 'buyer has no email on file';
    }
  } catch (e) {
    console.error('[order-delivered] email error:', e.message);
    result.emailError = e.message;
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
      body:       `✅ Delivered — "${item.name}" has arrived`,
    });
    convo.unreadBuyer += 1;
    convo.lastMessageAt = new Date();
    await convo.save();
    result.messageSent = true;
  } catch (e) {
    console.error('[order-delivered] message error:', e.message);
    result.messageError = e.message;
  }

  return result;
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

    const touchedOrders = new Set();

    // Queried one cjOrderId at a time, deliberately NOT batched. CJ's
    // getOrderDetailBatch DOES resolve our stored cjOrderId correctly, but
    // echoes back a different internal numeric id in each result's own
    // `orderId` field — so matching results back to requests by that field
    // (the natural way to consume a batch response) silently drops every
    // item, 100% of the time, no matter how many orders are in flight.
    // Confirmed directly against CJ's own dashboard on 2026-08-24: a stored
    // cjOrderId that's genuinely "Dispatched" on CJ's side still came back
    // from the batched call as an unmatched/dropped entry. Querying one id
    // per call means whatever CJ returns MUST belong to that id, sidestepping
    // the mismatch entirely — the throttled 1 req/sec limit makes this fine
    // at the order volumes this worker actually deals with.
    for (const [cjOrderId, { order, item }] of byOrderId) {
      let batchResult;
      try {
        batchResult = await getOrderStatusBatch([cjOrderId], credential);
      } catch (err) {
        summary.errors++;
        summary.details.push({ vendorId: String(vendor._id), storeName: vendor.storeName, orderId: String(order._id), error: 'getOrderStatusBatch failed: ' + err.message });
        continue;
      }
      if (batchResult?.error) {
        summary.errors++;
        summary.details.push({ vendorId: String(vendor._id), storeName: vendor.storeName, orderId: String(order._id), error: batchResult.error });
        continue;
      }
      const { results, warnings } = batchResult;
      if (warnings?.length) {
        summary.errors += warnings.length;
        summary.details.push({ vendorId: String(vendor._id), storeName: vendor.storeName, orderId: String(order._id), error: warnings.join(' | ') });
      }
      const s = results?.[0];
      if (!s) continue; // CJ genuinely has nothing to report for this order yet
      summary.itemsChecked++;

      try {
        // Track this in-memory change so it still gets saved even when
        // nothing below crosses a buyer-facing status transition — previously
        // a cjOrderStatus refresh (e.g. CREATED -> PENDING, still no buyer-
        // visible change) was silently dropped because only a status
        // transition added the order to touchedOrders.
        if (s.orderStatus && s.orderStatus !== item.cjOrderStatus) {
          item.cjOrderStatus = s.orderStatus;
          touchedOrders.add(order);
        }
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

        // item.status !== 'Shipped' guard: now that Shipped items stay
        // pollable (so a later DELIVERED can still land), CJ will keep
        // reporting SHIPPED on every tick for an item still in transit —
        // without this it'd re-touch/re-save the order every poll for
        // no real change.
        if (s.orderStatus === 'SHIPPED' && s.trackNumber && item.status !== 'Shipped') {
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
            const notifyResult = await notifyBuyerShipped(order, item, vendor, s.trackNumber, s.trackingProvider || '');
            if (notifyResult.emailError || notifyResult.messageError) {
              summary.details.push({
                vendorId: String(vendor._id), storeName: vendor.storeName, orderId: String(order._id),
                error: `Shipped notification partially failed — email: ${notifyResult.emailError || 'ok'}, message: ${notifyResult.messageError || 'ok'}`,
              });
            }
          }
          continue;
        }

        if (s.orderStatus === 'DELIVERED' && item.status === 'Shipped') {
          item.status = 'Delivered';
          item.deliveredAt = new Date();
          pushUniqueHistory(order, 'Delivered', 'CJ tracking sync — supplier reports this item delivered');
          touchedOrders.add(order);
          summary.updated++;

          const notifyResult = await notifyBuyerDelivered(order, item, vendor);
          if (notifyResult.emailError || notifyResult.messageError) {
            summary.details.push({
              vendorId: String(vendor._id), storeName: vendor.storeName, orderId: String(order._id),
              error: `Delivered notification partially failed — email: ${notifyResult.emailError || 'ok'}, message: ${notifyResult.messageError || 'ok'}`,
            });
          }
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
        // order.vendorOrders[].status is a separately-stored field the
        // buyer's order-detail page reads for its per-vendor badge — it's
        // NOT derived on the fly like the item/order status, so an item
        // status change above (Processing/Shipped/Delivered) is invisible
        // to the buyer until this is explicitly recomputed and saved too.
        const vendorOrder = order.vendorOrders.find(vo => String(vo.vendorId) === String(vendor._id));
        if (vendorOrder) {
          const vendorItems = order.items.filter(i => String(i.vendorId) === String(vendor._id));
          vendorOrder.status = getDerivedVendorStatus(vendorOrder, vendorItems);
        }
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
