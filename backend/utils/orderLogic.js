// ======================================================
// ORDER LOGIC (CLEAN – SEPARATED CONCERNS)
// ======================================================

// ------------------------------------------------------
// STATUS TRANSITIONS (FULFILLMENT ONLY)
// ------------------------------------------------------

export function getAllowedTransitions(role) {
  const admin = {
    Pending: ['Processing', 'Cancelled', 'Cancel Requested'],
    Processing: ['Shipped', 'Cancelled', 'Cancel Requested'],
    Shipped: ['Delivered'],

    Delivered: ['Return Requested', 'Refund Requested'],

    'Return Requested': ['Return Approved', 'Return Rejected'],
    'Return Approved': ['Returned'],
    'Return Rejected': [],

    Returned: [], // ✅ END STATE (refund handled separately)

    'Refund Requested': ['Cancelled'], // goodwill path

    'Cancel Requested': ['Cancelled', 'Processing'],

    Cancelled: [],
  };

  const vendor = {
    Pending: ['Processing'],
    Processing: ['Shipped'],
    Shipped: ['Delivered'],

    Delivered: ['Return Requested', 'Refund Requested'],

    'Return Requested': ['Return Approved', 'Return Rejected'],
    'Return Approved': ['Returned'],
    'Return Rejected': [],

    Returned: [],

    'Refund Requested': [],

    'Cancel Requested': ['Cancelled'],

    Cancelled: [],
  };

  return role === 'admin' ? admin : vendor;
}

// ------------------------------------------------------
// STATUS UPDATE VALIDATION
// ------------------------------------------------------

export function canUpdateStatus(order, newStatus, role) {
  if (order.status === 'Cancelled') {
    return { ok: false, error: 'Final state – no changes allowed' };
  }

  if (order.paymentStatus === 'refunded') {
    return { ok: false, error: 'Cannot update refunded order' };
  }

  const rules = getAllowedTransitions(role);

  if (!rules[order.status]?.includes(newStatus)) {
    return {
      ok: false,
      error: `Invalid transition from ${order.status} to ${newStatus}`,
    };
  }

  return { ok: true };
}

// ------------------------------------------------------
// CUSTOMER CANCEL REQUEST
// ------------------------------------------------------

export function canRequestCancel(order) {
  const statuses = order.vendorOrders?.map((v) => v.status) || [];

  if (!statuses.length) {
    return { ok: false, error: 'Invalid order' };
  }

  const allowed = statuses.every((s) => ['Pending', 'Processing'].includes(s));

  if (!allowed) {
    return { ok: false, error: 'Cannot cancel this order' };
  }

  if (statuses.every((s) => s === 'Cancel Requested')) {
    return { ok: false, error: 'Cancel already requested' };
  }

  return { ok: true };
}

// ------------------------------------------------------
// CUSTOMER RETURN REQUEST (STRICT + FINAL)
// ------------------------------------------------------

export function canRequestReturn(order) {
  const statuses = order.vendorOrders?.map((v) => v.status) || [];

  if (!statuses.length) {
    return { ok: false, error: 'Invalid order' };
  }

  // must be fully delivered
  const delivered = statuses.every((s) => s === 'Delivered');

  if (!delivered) {
    return { ok: false, error: 'Return only after delivery' };
  }

  // 🔥 HISTORY CHECK (THIS IS THE REAL FIX)
  const history = order.statusHistory || [];

  const alreadyRequested = history.some((h) => h.status === 'Return Requested');
  const alreadyRejected = history.some((h) => h.status === 'Return Rejected');
  const alreadyApproved = history.some((h) => h.status === 'Return Approved');
  const alreadyReturned = history.some((h) => h.status === 'Returned');

  if (alreadyRequested || alreadyRejected || alreadyApproved || alreadyReturned) {
    return { ok: false, error: 'Return already processed' };
  }

  return { ok: true };
}

// ------------------------------------------------------
// ADMIN REFUND VALIDATION (PAYMENT BASED)
// ------------------------------------------------------

export function canRefund(order, { force = false } = {}) {
  if (order.paymentStatus !== 'paid' && order.paymentStatus !== 'refund_scheduled') {
    return { ok: false, error: 'Only paid orders can be refunded' };
  }

  if (order.paymentStatus === 'refunded') {
    return { ok: false, error: 'Already refunded' };
  }

  if (force) {
    return { ok: true };
  }

  if (!['Cancelled', 'Returned'].includes(order.status)) {
    return {
      ok: false,
      error: 'Refund allowed only after cancel or return',
    };
  }

  return { ok: true };
}

// ------------------------------------------------------
// DERIVED ORDER STATUS (GLOBAL VIEW)
// ------------------------------------------------------

export function getDerivedOrderStatus(order) {
  const statuses = Array.isArray(order.vendorOrders)
    ? order.vendorOrders.map((vo) => vo.status)
    : [];

  if (!statuses.length) return order.status;

  // 🔥 priority states (requests first)
  if (statuses.some((s) => s === 'Cancel Requested')) return 'Cancel Requested';
  if (statuses.some((s) => s === 'Return Requested')) return 'Return Requested';

  // 🔥 approval stage
  if (statuses.some((s) => s === 'Return Approved')) return 'Return Approved';

  // 🔥 rejection DOES NOT become a visible state
  if (statuses.some((s) => s === 'Return Rejected')) return 'Delivered';

  // 🔥 final states
  if (statuses.every((s) => s === 'Cancelled')) return 'Cancelled';
  if (statuses.every((s) => s === 'Returned')) return 'Returned';

  // 🔥 normal flow
  if (statuses.every((s) => s === 'Delivered')) return 'Delivered';
  if (statuses.some((s) => s === 'Shipped')) return 'Shipped';
  if (statuses.some((s) => s === 'Processing')) return 'Processing';

  return order.status || 'Pending';
}
