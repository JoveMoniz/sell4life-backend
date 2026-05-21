// ======================================================
// ORDER LOGIC (ENTERPRISE STRUCTURE)
// CLEAN SEPARATED CONCERNS + PARTIAL SUPPORT
// ======================================================

// ======================================================
// FULFILLMENT STATUS
// ======================================================

export const FULFILLMENT_STATUSES = [
  'Pending',
  'Processing',
  'Shipped',
  'Delivered',

  'Cancel Requested',
  'Cancelled',
  'Returned',
];

// ======================================================
// RETURN STATUS
// ======================================================

export const RETURN_STATUSES = [
  'none',

  'requested',
  'approved',
  'rejected',

  'partially_returned',
  'returned',
];

// ======================================================
// REFUND STATUS
// ======================================================

export const REFUND_STATUSES = [
  'none',

  'requested',
  'approved',

  'scheduled',
  'processing',

  'partially_refunded',
  'processed',

  'failed',
  'cancelled',
];

// ======================================================
// GLOBAL ORDER STATES (DERIVED ONLY)
// ======================================================

export const GLOBAL_ORDER_STATES = [
  'Pending',
  'Processing',
  'Shipped',
  'Delivered',

  'Partially Delivered',

  'Cancel Requested',
  'Cancelled',

  'Return Requested',
  'Return Approved',
  'Partially Returned',
  'Returned',

  'Refund Requested',
  'Refund Scheduled',

  'Partially Refunded',
  'Refunded',
];
// ======================================================
// STATUS TRANSITIONS (FULFILLMENT ONLY)
// ======================================================

export function getAllowedTransitions(role) {
  const admin = {
    Pending: ['Processing', 'Cancelled', 'Cancel Requested'],

    Processing: ['Shipped', 'Cancelled', 'Cancel Requested'],

    Shipped: ['Delivered'],

    Delivered: [],

    'Cancel Requested': ['Cancelled', 'Processing'],

    Cancelled: [],
  };

  const vendor = {
    Pending: ['Processing'],

    Processing: ['Shipped'],

    Shipped: ['Delivered'],

    Delivered: [],

    'Cancel Requested': ['Cancelled'],

    Cancelled: [],
  };

  return role === 'admin' ? admin : vendor;
}

// ======================================================
// LEGACY ORDER STATUS VALIDATION
// TEMP SUPPORT FOR OLD ROUTES
// ======================================================

export function canUpdateStatus(order, newStatus, role) {
  if (!order) {
    return {
      ok: false,
      error: 'Order not found',
    };
  }

  const currentStatus = order.status || 'Pending';

  if (currentStatus === 'Cancelled') {
    return {
      ok: false,
      error: 'Cancelled order cannot be updated',
    };
  }

  const rules = getAllowedTransitions(role);

  if (!rules[currentStatus]?.includes(newStatus)) {
    return {
      ok: false,
      error: `Invalid transition from ${currentStatus} to ${newStatus}`,
    };
  }

  return { ok: true };
}

// ======================================================
// ITEM STATUS VALIDATION
// ======================================================

export function canUpdateItemStatus(item, newStatus, role) {
  if (!item) {
    return {
      ok: false,
      error: 'Item not found',
    };
  }

  if (item.status === 'Cancelled') {
    return {
      ok: false,
      error: 'Cancelled item cannot be updated',
    };
  }

  const rules = getAllowedTransitions(role);

  if (!rules[item.status]?.includes(newStatus)) {
    return {
      ok: false,
      error: `Invalid transition from ${item.status} to ${newStatus}`,
    };
  }

  return { ok: true };
}

// ======================================================
// CUSTOMER CANCEL REQUEST
// ======================================================

export function canRequestCancel(order) {
  if (!order) {
    return {
      ok: false,
      error: 'Order not found',
    };
  }

  const items = Array.isArray(order.items) ? order.items : [];

  if (!items.length) {
    return {
      ok: false,
      error: 'No order items found',
    };
  }

  const allowed = items.every((item) =>
    ['Pending', 'Processing', 'Cancel Requested'].includes(item.status)
  );

  if (!allowed) {
    return {
      ok: false,
      error: 'Order can no longer be cancelled',
    };
  }

  const alreadyRequested = items.every((item) => item.status === 'Cancel Requested');

  if (alreadyRequested) {
    return {
      ok: false,
      error: 'Cancel already requested',
    };
  }

  return { ok: true };
}

// ======================================================
// RETURN REQUEST VALIDATION (ITEM LEVEL)
// ======================================================

export function canRequestItemReturn(item) {
  if (!item) {
    return {
      ok: false,
      error: 'Item not found',
    };
  }

  if (item.status !== 'Delivered') {
    return {
      ok: false,
      error: 'Return allowed only after delivery',
    };
  }

  if (['requested', 'approved', 'partially_returned', 'returned'].includes(item.returnStatus)) {
    return {
      ok: false,
      error: 'Return already in progress',
    };
  }

  return { ok: true };
}

// ======================================================
// REFUND VALIDATION (ITEM LEVEL)
// ======================================================

export function canRefundItem(item, { force = false } = {}) {
  if (!item) {
    return {
      ok: false,
      error: 'Item not found',
    };
  }

  if (!['approved', 'partially_returned', 'returned'].includes(item.returnStatus)) {
    return {
      ok: false,
      error: 'Item not eligible for refund',
    };
  }

  if (['processing', 'processed'].includes(item.refundStatus)) {
    return {
      ok: false,
      error: 'Refund already processed',
    };
  }

  if (force) {
    return { ok: true };
  }

  return { ok: true };
}

// ======================================================
// LEGACY ORDER REFUND VALIDATION
// TEMP SUPPORT FOR OLD ADMIN ROUTES
// ======================================================

export function canRefund(order, { force = false } = {}) {
  if (!order) {
    return {
      ok: false,
      error: 'Order not found',
    };
  }

  // =========================================
  // BLOCK ALREADY REFUNDED
  // =========================================

  if (order.paymentStatus === 'refunded') {
    return {
      ok: false,
      error: 'Order already refunded',
    };
  }

  // =========================================
  // BLOCK SCHEDULED REFUNDS
  // =========================================

  if (
    order.paymentStatus === 'refund_scheduled' ||
    order.refundStatus === 'scheduled' ||
    order.refundScheduledAt
  ) {
    return {
      ok: false,
      error: 'Refund already scheduled',
    };
  }

  if (force) {
    return { ok: true };
  }

  const status = getDerivedOrderStatus(order);

  if (!['Cancelled', 'Returned', 'Partially Returned'].includes(status)) {
    return {
      ok: false,
      error: 'Order not eligible for refund',
    };
  }

  return { ok: true };
}

// ======================================================
// DERIVED ITEM RETURN STATE
// ======================================================

export function getDerivedItemReturnState(item) {
  if (!item) return 'none';

  const qty = item.quantity || 0;
  const returned = item.returnQuantity || 0;
  const refunded = item.refundedQuantity || 0;

  if (refunded >= qty && qty > 0) {
    return 'refunded';
  }

  if (refunded > 0 && refunded < qty) {
    return 'partially_refunded';
  }

  if (returned >= qty && qty > 0) {
    return 'returned';
  }

  if (returned > 0 && returned < qty) {
    return 'partially_returned';
  }

  return item.returnStatus || 'none';
}

// ======================================================
// DERIVED VENDOR STATUS
// ======================================================

export function getDerivedVendorStatus(vendorOrder, items = []) {
  if (!vendorOrder) return 'Pending';

  const vendorItems = items.filter(
    (item) => String(item.vendorId) === String(vendorOrder.vendorId)
  );

  if (!vendorItems.length) {
    return vendorOrder.status || 'Pending';
  }

  const fulfillmentStatuses = vendorItems.map((i) => i.status);

  const returnStatuses = vendorItems.map((i) => i.returnStatus);

  const refundStatuses = vendorItems.map((i) => i.refundStatus);

  // ====================================================
  // RETURN STATES
  // Must come before fulfillment
  // ====================================================

  if (returnStatuses.some((s) => s === 'requested')) {
    return 'Return Requested';
  }

  if (returnStatuses.some((s) => s === 'approved')) {
    return 'Return Approved';
  }

  if (returnStatuses.some((s) => s === 'partially_returned')) {
    return 'Partially Returned';
  }

  if (returnStatuses.length > 0 && returnStatuses.every((s) => s === 'returned')) {
    return 'Returned';
  }

  // =========================================
  // CANCEL / RETURN STATES
  // =========================================

  if (fulfillmentStatuses.some((s) => s === 'Cancel Requested')) {
    return 'Cancel Requested';
  }

  if (returnStatuses.some((s) => s === 'requested')) {
    return 'Return Requested';
  }

  if (returnStatuses.some((s) => s === 'approved')) {
    return 'Return Approved';
  }

  if (fulfillmentStatuses.every((s) => s === 'Cancelled')) {
    return 'Cancelled';
  }

  // ====================================================
  // FULFILLMENT STATES
  // ====================================================

  if (fulfillmentStatuses.length > 0 && fulfillmentStatuses.every((s) => s === 'Delivered')) {
    return 'Delivered';
  }

  if (fulfillmentStatuses.some((s) => s === 'Delivered')) {
    return 'Partially Delivered';
  }

  if (fulfillmentStatuses.some((s) => s === 'Shipped')) {
    return 'Shipped';
  }

  if (fulfillmentStatuses.some((s) => s === 'Processing')) {
    return 'Processing';
  }

  return 'Pending';
}
// ======================================================
// DERIVED GLOBAL ORDER STATUS
// ======================================================

export function getDerivedOrderStatus(order) {
  if (!order) return 'Pending';

  const items = Array.isArray(order.items) ? order.items : [];

  const vendorOrders = Array.isArray(order.vendorOrders) ? order.vendorOrders : [];

  // ====================================================
  // FALLBACK FOR OLD ORDERS
  // ====================================================

  const hasRealItemStatuses = items.some((item) => item.status && item.status !== 'Pending');

  if (!hasRealItemStatuses && vendorOrders.length) {
    const vendorStatuses = vendorOrders.map((v) => v.status);

    if (vendorStatuses.some((s) => s === 'Cancel Requested')) {
      return 'Cancel Requested';
    }

    if (vendorStatuses.some((s) => s === 'Return Requested')) {
      return 'Return Requested';
    }

    if (vendorStatuses.every((s) => s === 'Cancelled')) {
      return 'Cancelled';
    }

    if (vendorStatuses.every((s) => s === 'Returned')) {
      return 'Returned';
    }

    if (vendorStatuses.every((s) => s === 'Delivered')) {
      return 'Delivered';
    }

    if (vendorStatuses.some((s) => s === 'Shipped')) {
      return 'Shipped';
    }

    if (vendorStatuses.some((s) => s === 'Processing')) {
      return 'Processing';
    }
  }

  if (!items.length) {
    return order.status || 'Pending';
  }

  const fulfillmentStatuses = items.map((item) => item.status);

  const returnStatuses = items.map((item) => item.returnStatus);

  const refundStatuses = items.map((item) => item.refundStatus);

  // ====================================================
  // FINAL STATES FIRST
  // ====================================================

  // FULLY RETURNED
  if (returnStatuses.length > 0 && returnStatuses.every((s) => s === 'returned')) {
    return 'Returned';
  }

  // PARTIALLY RETURNED
  if (returnStatuses.some((s) => ['partially_returned', 'returned'].includes(s))) {
    return 'Partially Returned';
  }

  // FULLY CANCELLED
  if (fulfillmentStatuses.every((s) => s === 'Cancelled')) {
    return 'Cancelled';
  }

  // ====================================================
  // TRANSITIONAL STATES
  // ====================================================

  // RETURN APPROVED
  if (returnStatuses.some((s) => s === 'approved')) {
    return 'Return Approved';
  }

  // RETURN REQUESTED
  if (returnStatuses.some((s) => s === 'requested')) {
    return 'Return Requested';
  }

  // CANCEL REQUESTED
  if (fulfillmentStatuses.some((s) => s === 'Cancel Requested')) {
    return 'Cancel Requested';
  }

  // ====================================================
  // FULFILLMENT FLOW
  // ====================================================

  // FULLY DELIVERED
  if (fulfillmentStatuses.every((s) => s === 'Delivered')) {
    return 'Delivered';
  }

  // PARTIALLY DELIVERED
  if (fulfillmentStatuses.some((s) => s === 'Delivered')) {
    return 'Partially Delivered';
  }

  // SHIPPED
  if (fulfillmentStatuses.some((s) => s === 'Shipped')) {
    return 'Shipped';
  }

  // PROCESSING
  if (fulfillmentStatuses.some((s) => s === 'Processing')) {
    return 'Processing';
  }

  // DEFAULT
  return 'Pending';
}

// ======================================================
// PAYMENT STATUS DERIVATION
// ======================================================

export function getDerivedPaymentStatus(order) {
  const items = order.items || [];

  const refundStatuses = items.map((item) => item.refundStatus);

  if (refundStatuses.length && refundStatuses.every((s) => s === 'processed')) {
    return 'refunded';
  }

  if (refundStatuses.some((s) => ['partially_refunded', 'processed'].includes(s))) {
    return 'partially_refunded';
  }

  return order.paymentStatus || 'paid';
}

// ======================================================
// ADMIN ACTIONS
// SINGLE SOURCE OF TRUTH
// ======================================================

export function getAllowedAdminActions(order) {
  const status = getDerivedOrderStatus(order);

  const map = {
    Pending: ['Processing', 'Cancelled'],

    Processing: ['Shipped', 'Cancelled'],

    Shipped: [],

    Delivered: [],

    'Cancel Requested': ['Cancelled'],

    'Return Requested': ['Return Approved', 'Return Rejected'],

    'Return Approved': [],

    'Return Rejected': [],

    Returned: [],

    Cancelled: [],

    Refunded: [],

    'Refund Scheduled': [],

    'Partially Refunded': [],
  };

  return map[status] || [];
}

// ======================================================
// VENDOR ACTIONS
// SINGLE SOURCE OF TRUTH
// ======================================================

export function getAllowedVendorActions(order, vendorId) {
  if (!order || !vendorId) return [];

  const vendorOrder = (order.vendorOrders || []).find(
    (vo) => String(vo.vendorId) === String(vendorId)
  );

  const status = getDerivedVendorStatus(vendorOrder, order.items || []);

  const map = {
    Pending: ['Processing'],
    Processing: ['Shipped'],
    Shipped: ['Delivered'],

    'Return Requested': ['Return Approved', 'Return Rejected'],
    'Return Approved': ['Returned'],

    'Cancel Requested': ['Cancelled'],

    Delivered: [],
    Cancelled: [],
    Returned: [],
    Refunded: [],
    'Refund Scheduled': [],
    'Partially Refunded': [],
  };

  return map[status] || [];
}

export function buildVendorAllowedActions(order, vendorId) {
  if (!order || !vendorId) return [];

  const actions = [];

  const vendorItems = (order.items || []).filter(
    (item) => String(item.vendorId) === String(vendorId)
  );

  const vendorOrder = (order.vendorOrders || []).find(
    (vo) => String(vo.vendorId) === String(vendorId)
  );

  const status = getDerivedVendorStatus(vendorOrder, order.items || []);

  // ====================================================
  // NORMAL FULFILLMENT
  // ====================================================

  if (status === 'Pending') {
    actions.push({ type: 'Processing' });
  }

  if (status === 'Processing') {
    actions.push({ type: 'Shipped' });
  }

  if (status === 'Shipped') {
    actions.push({ type: 'Delivered' });
  }

  // ====================================================
  // RETURN REQUESTED
  // ====================================================

  if (status === 'Return Requested') {
    vendorItems.forEach((item) => {
      if (item.returnStatus === 'requested') {
        actions.push({
          type: 'Return Approved',
          itemId: item._id,
        });

        actions.push({
          type: 'Return Rejected',
          itemId: item._id,
        });
      }
    });
  }

  // ====================================================
  // RETURN APPROVED
  // ====================================================

  if (status === 'Return Approved') {
    vendorItems.forEach((item) => {
      if (item.returnStatus === 'approved') {
        actions.push({
          type: 'Returned',
          itemId: item._id,
        });
      }
    });
  }

  // ====================================================
  // CANCEL REQUESTED
  // ====================================================

  if (status === 'Cancel Requested') {
    actions.push({
      type: 'Cancelled',
    });
  }

  return actions;
}

// ======================================================
// FINAL ORDER CHECK
// SINGLE SOURCE OF TRUTH
// ======================================================

export function isFinalOrder(order) {
  if (order.paymentStatus === 'refunded') {
    return true;
  }

  const status = getDerivedOrderStatus(order);

  return ['Cancelled', 'Refunded', 'Returned', 'Delivered'].includes(status);
}

// ======================================================
// ADMIN LABELS
// SINGLE SOURCE OF TRUTH
// ======================================================

export function getAdminActionLabel(status) {
  const labels = {
    Cancelled: 'Force Cancel',

    'Return Approved': 'Override Approve Return',

    'Return Rejected': 'Override Reject Return',
  };

  return labels[status] || status;
}
