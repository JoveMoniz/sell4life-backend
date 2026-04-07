// ======================================================
// ORDER LOGIC (SINGLE SOURCE OF TRUTH)
// ======================================================

// ------------------------------------------------------
// STATUS TRANSITIONS
// ------------------------------------------------------

export function getAllowedTransitions(role) {
  const admin = {
    Pending: ['Processing', 'Cancelled', 'Cancel Requested'],
    Processing: ['Shipped', 'Cancelled', 'Cancel Requested'],
    Shipped: ['Delivered'],

    Delivered: ['Return Requested', 'Refund Requested'],

    'Return Requested': ['Return Approved', 'Cancelled'],
    'Return Approved': ['Returned'],

    Returned: ['Refund Scheduled'],

    'Refund Scheduled': ['Cancelled', 'Returned'], // cancel or proceed

    'Refund Requested': ['Cancelled'], // goodwill path

    'Cancel Requested': ['Cancelled', 'Processing'],

    Cancelled: [],
  };

  const vendor = {
    Pending: ['Processing'],
    Processing: ['Shipped'],
    Shipped: ['Delivered'],

    Delivered: ['Return Requested', 'Refund Requested'],

    'Return Requested': ['Return Approved'],
    'Return Approved': ['Returned'],

    Returned: ['Refund Scheduled'],

    'Refund Scheduled': ['Returned'],

    'Refund Requested': [],

    'Cancel Requested': ['Cancelled'], // 🔥 ADD THIS

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
  if (order.paymentStatus !== 'paid') {
    return { ok: false, error: 'Cannot update unpaid or refunded order' };
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
  if (!['Pending', 'Processing'].includes(order.status)) {
    return { ok: false, error: 'Cannot cancel this order' };
  }

  if (order.status === 'Cancel Requested') {
    return { ok: false, error: 'Cancel already requested' };
  }

  return { ok: true };
}

// ------------------------------------------------------
// CUSTOMER RETURN REQUEST
// ------------------------------------------------------

export function canRequestReturn(order) {
  if (order.status !== 'Delivered') {
    return { ok: false, error: 'Return only after delivery' };
  }

  if (order.status === 'Return Requested') {
    return { ok: false, error: 'Return already requested' };
  }

  return { ok: true };
}
// ------------------------------------------------------
// ADMIN REFUND VALIDATION
// ------------------------------------------------------

export function canRefund(order, { force = false } = {}) {
  if (order.paymentStatus !== 'paid') {
    return { ok: false, error: 'Only paid orders can be refunded' };
  }

  if (order.paymentStatus === 'refunded') {
    return { ok: false, error: 'Already refunded' };
  }

  if (force) {
    return { ok: true };
  }

  // ✅ NORMAL PATHS
  if (!['Cancelled', 'Refund Scheduled', 'Refund Requested'].includes(order.status)) {
    return {
      ok: false,
      error: 'Refund not allowed in current state',
    };
  }

  return { ok: true };
}
