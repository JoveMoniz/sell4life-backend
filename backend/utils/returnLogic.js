// ======================================================
// RETURN LOGIC
// ITEM-LEVEL PARTIAL RETURNS / PARTIAL REFUNDS FOUNDATION
// ======================================================

import { pushUniqueHistory, pushItemHistory } from './historyLogic.js';
import { getDerivedOrderStatus } from './orderLogic.js';

// ======================================================
// FIND HELPERS
// ======================================================

export function findOrderItem(order, itemId) {
  if (!order || !Array.isArray(order.items)) return null;

  return order.items.find((item) => String(item._id) === String(itemId));
}

export function findVendorItems(order, vendorId) {
  if (!order || !Array.isArray(order.items)) return [];

  return order.items.filter((item) => String(item.vendorId) === String(vendorId));
}

// ======================================================
// RETURN REQUEST VALIDATION
// ======================================================

export function validateReturnRequest(order, item, quantity) {
  if (!order) {
    return { ok: false, error: 'Order not found' };
  }

  if (!item) {
    return { ok: false, error: 'Item not found' };
  }

  if (!['paid', 'partially_refunded', 'refund_scheduled'].includes(order.paymentStatus)) {
    return { ok: false, error: 'Only paid orders can be returned' };
  }

  if (item.status !== 'Delivered') {
    return { ok: false, error: 'Item can only be returned after delivery' };
  }

  const requestedQty = Number(quantity);

  if (!Number.isInteger(requestedQty) || requestedQty <= 0) {
    return { ok: false, error: 'Return quantity must be a positive whole number' };
  }

  const purchasedQty = Number(item.quantity || 0);
  const alreadyReturnedQty = Number(item.returnQuantity || 0);
  const alreadyRequestedQty = Number(item.returnRequestedQuantity || 0);
  const alreadyRefundedQty = Number(item.refundedQuantity || 0);

  if (requestedQty > purchasedQty) {
    return { ok: false, error: 'Return quantity cannot exceed purchased quantity' };
  }

  if (alreadyRefundedQty >= purchasedQty) {
    return { ok: false, error: 'Item already refunded' };
  }

  if (item.refundStatus === 'processed') {
    return { ok: false, error: 'Refund already processed for this item' };
  }

  if (['requested', 'approved'].includes(item.returnStatus)) {
    return { ok: false, error: 'Return already in progress for this item' };
  }

  const availableQty = purchasedQty - alreadyReturnedQty - alreadyRequestedQty;

  if (requestedQty > availableQty) {
    return {
      ok: false,
      error: `Only ${availableQty} item(s) available to return`,
    };
  }

  return { ok: true };
}

// ======================================================
// APPLY RETURN REQUEST
// ======================================================

export function applyReturnRequest(order, item, quantity, reason, userId) {
  const requestedQty = Number(quantity);

  item.returnStatus = 'requested';

  item.returnRequestedQuantity = Number(item.returnRequestedQuantity || 0) + requestedQty;

  item.returnReason = reason || '';
  item.returnRequestedAt = new Date();

  pushItemHistory(item, {
    type: 'return_requested',
    status: 'requested',
    quantity: requestedQty,
    amount: Number(item.price || 0) * requestedQty,
    note: reason || 'Return requested',
    by: userId,
    at: new Date(),
  });

  order.returnRequestedAt = new Date();

  pushUniqueHistory(
    order,
    'Return Requested',
    `Return requested for ${item.name} x${requestedQty}`
  );

  order.status = getDerivedOrderStatus(order);

  return order;
}

// ======================================================
// RETURN APPROVAL VALIDATION
// ======================================================

export function validateReturnApproval(order, item, quantity) {
  if (!order) {
    return { ok: false, error: 'Order not found' };
  }

  if (!item) {
    return { ok: false, error: 'Item not found' };
  }

  if (item.returnStatus !== 'requested') {
    return { ok: false, error: 'No active return request for this item' };
  }

  const approvedQty = Number(quantity || item.returnRequestedQuantity || 0);

  if (!Number.isInteger(approvedQty) || approvedQty <= 0) {
    return { ok: false, error: 'Approved quantity must be a positive whole number' };
  }

  if (approvedQty > item.returnRequestedQuantity) {
    return {
      ok: false,
      error: 'Approved quantity cannot exceed requested quantity',
    };
  }

  return { ok: true };
}

// ======================================================
// APPLY RETURN APPROVAL
// ======================================================

export function applyReturnApproval(order, item, quantity, adminOrVendorId) {
  const approvedQty = Number(quantity || item.returnRequestedQuantity || 0);

  item.returnStatus = 'approved';

  item.returnApprovedQuantity = Number(item.returnApprovedQuantity || 0) + approvedQty;

  item.returnApprovedAt = new Date();
  item.returnApprovedBy = adminOrVendorId;

  pushItemHistory(item, {
    type: 'return_approved',
    status: 'approved',
    quantity: approvedQty,
    amount: Number(item.price || 0) * approvedQty,
    note: `Return approved for ${approvedQty} item(s)`,
    by: adminOrVendorId,
    at: new Date(),
  });

  order.returnApprovedAt = new Date();

  pushUniqueHistory(order, 'Return Approved', `Return approved for ${item.name} x${approvedQty}`);

  order.status = getDerivedOrderStatus(order);

  return order;
}

// ======================================================
// RETURN REJECTION VALIDATION
// ======================================================

export function validateReturnRejection(order, item) {
  if (!order) {
    return { ok: false, error: 'Order not found' };
  }

  if (!item) {
    return { ok: false, error: 'Item not found' };
  }

  if (item.returnStatus !== 'requested') {
    return { ok: false, error: 'No active return request to reject' };
  }

  return { ok: true };
}

// ======================================================
// APPLY RETURN REJECTION
// ======================================================

export function applyReturnRejection(order, item, reason, adminOrVendorId) {
  item.returnStatus = 'rejected';
  item.returnRejectedBy = adminOrVendorId;
  item.returnRejectionReason = reason || 'Return rejected';

  pushItemHistory(item, {
    type: 'return_rejected',
    status: 'rejected',
    quantity: Number(item.returnRequestedQuantity || 0),
    amount: 0,
    note: reason || 'Return rejected',
    by: adminOrVendorId,
    at: new Date(),
  });

  item.returnRequestedQuantity = 0;

  pushUniqueHistory(order, 'Return Rejected', `Return rejected for ${item.name}`);

  order.status = getDerivedOrderStatus(order);

  return order;
}

// ======================================================
// MARK ITEM AS RETURNED VALIDATION
// ======================================================

export function validateMarkItemReturned(order, item, quantity) {
  if (!order) {
    return { ok: false, error: 'Order not found' };
  }

  if (!item) {
    return { ok: false, error: 'Item not found' };
  }

  if (item.returnStatus !== 'approved') {
    return { ok: false, error: 'Return must be approved first' };
  }

  const returnedQty = Number(quantity || item.returnApprovedQuantity || 0);

  if (!Number.isInteger(returnedQty) || returnedQty <= 0) {
    return { ok: false, error: 'Returned quantity must be a positive whole number' };
  }

  if (returnedQty > item.returnApprovedQuantity) {
    return {
      ok: false,
      error: 'Returned quantity cannot exceed approved quantity',
    };
  }

  return { ok: true };
}

// ======================================================
// APPLY MARK ITEM RETURNED
// ======================================================

export function applyMarkItemReturned(order, item, quantity, condition, adminOrVendorId) {
  const returnedQty = Number(quantity || item.returnApprovedQuantity || 0);

  item.returnQuantity = Number(item.returnQuantity || 0) + returnedQty;

  item.returnRequestedQuantity = 0;
  item.returnApprovedQuantity = 0;

  const purchasedQty = Number(item.quantity || 0);

  if (item.returnQuantity >= purchasedQty) {
    item.returnStatus = 'returned';
  } else {
    item.returnStatus = 'partially_returned';
  }

  item.returnedCondition = condition || 'not_returned';
  item.returnedAt = new Date();

  pushItemHistory(item, {
    type: 'returned',
    status: item.returnStatus,
    quantity: returnedQty,
    amount: Number(item.price || 0) * returnedQty,
    note: `Item returned in condition: ${item.returnedCondition}`,
    by: adminOrVendorId,
    at: new Date(),
  });

  order.returnedAt = new Date();

  pushUniqueHistory(
    order,
    item.returnStatus === 'returned' ? 'Returned' : 'Partially Returned',

    `${item.name} returned x${returnedQty}`
  );

  order.status = getDerivedOrderStatus(order);

  return order;
}

// ======================================================
// REFUND AMOUNT CALCULATION FOUNDATION
// ======================================================

export function calculateItemRefundAmount(item, quantity) {
  const qty = Number(quantity || 0);
  const price = Number(item.price || 0);

  const itemSubtotal = price * qty;

  const tax = Number(item.taxAmount || 0);
  const shipping = Number(item.shippingAmount || 0);
  const discount = Number(item.discountAmount || 0);
  const platformFee = Number(item.platformFeeAmount || 0);

  return {
    subtotal: itemSubtotal,
    tax,
    shipping,
    discount,
    platformFee,
    total: Math.max(0, itemSubtotal + tax + shipping - discount),
  };
}

// ======================================================
// REFUND VALIDATION FOUNDATION
// ======================================================

export function validateItemRefund(order, item, quantity) {
  if (!order) {
    return { ok: false, error: 'Order not found' };
  }

  if (!item) {
    return { ok: false, error: 'Item not found' };
  }

  if (!['paid', 'partially_refunded', 'refunded'].includes(order.paymentStatus)) {
    return { ok: false, error: 'Only paid orders can be refunded' };
  }

  if (!['partially_returned', 'returned'].includes(item.returnStatus)) {
    return { ok: false, error: 'Item must be returned before refund' };
  }

  if (['processing', 'processed'].includes(item.refundStatus)) {
    return { ok: false, error: 'Refund already processing or processed' };
  }

  const refundQty = Number(quantity || 0);

  if (!Number.isInteger(refundQty) || refundQty <= 0) {
    return { ok: false, error: 'Refund quantity must be a positive whole number' };
  }

  const refundableQty = Number(item.returnQuantity || 0) - Number(item.refundedQuantity || 0);

  if (refundQty > refundableQty) {
    return {
      ok: false,
      error: `Only ${refundableQty} item(s) available to refund`,
    };
  }

  return { ok: true };
}
