// ======================================================
// ORDER HISTORY
// SINGLE SOURCE OF TRUTH
// ======================================================

export function pushUniqueHistory(order, status, note = '', date = new Date()) {
  if (!order.statusHistory) {
    order.statusHistory = [];
  }

  const last = order.statusHistory[order.statusHistory.length - 1];

  if (last && last.status === status) {
    return false;
  }

  order.statusHistory.push({
    status,
    note,
    date,
  });

  return true;
}

// ======================================================
// ITEM HISTORY
// SINGLE SOURCE OF TRUTH
// ======================================================

export function pushItemHistory(item, event = {}) {
  if (!item.returnHistory) {
    item.returnHistory = [];
  }

  item.returnHistory.push({
    type: event.type || '',
    stripeRefundId: event.stripeRefundId || '',
    status: event.status || '',
    quantity: Number(event.quantity || 0),
    amount: Number(event.amount || 0),
    note: event.note || '',
    by: event.by || undefined,
    at: event.at || new Date(),
    metadata: event.metadata || {},
  });

  return true;
}

// ======================================================
// VENDOR HISTORY
// SINGLE SOURCE OF TRUTH
// ======================================================

export function pushVendorHistory(vendorOrder, event = {}) {
  if (!vendorOrder.history) {
    vendorOrder.history = [];
  }

  vendorOrder.history.push({
    type: event.type || '',
    status: event.status || '',
    note: event.note || '',
    amount: Number(event.amount || 0),
    by: event.by || undefined,
    at: event.at || new Date(),
    metadata: event.metadata || {},
  });

  return true;
}

// ======================================================
// PAYMENT HISTORY
// SINGLE SOURCE OF TRUTH
// ======================================================

export function pushPaymentHistory(order, event = {}) {
  if (!order.paymentHistory) {
    order.paymentHistory = [];
  }

  order.paymentHistory.push({
    type: event.type || '',
    status: event.status || '',
    amount: Number(event.amount || 0),
    stripePaymentIntentId: event.stripePaymentIntentId || '',
    stripeRefundId: event.stripeRefundId || '',
    note: event.note || '',
    by: event.by || undefined,
    at: event.at || new Date(),
    metadata: event.metadata || {},
  });

  return true;
}

// ======================================================
// SYSTEM HISTORY
// SINGLE SOURCE OF TRUTH
// ======================================================

export function pushSystemHistory(order, event = {}) {
  if (!order.systemHistory) {
    order.systemHistory = [];
  }

  order.systemHistory.push({
    type: event.type || '',
    status: event.status || '',
    note: event.note || '',
    at: event.at || new Date(),
    metadata: event.metadata || {},
  });

  return true;
}

// ======================================================
// ADMIN HISTORY
// SINGLE SOURCE OF TRUTH
// ======================================================

export function pushAdminHistory(order, event = {}) {
  if (!order.adminHistory) {
    order.adminHistory = [];
  }

  order.adminHistory.push({
    type: event.type || '',
    status: event.status || '',
    note: event.note || '',
    by: event.by || undefined,
    at: event.at || new Date(),
    metadata: event.metadata || {},
  });

  return true;
}
