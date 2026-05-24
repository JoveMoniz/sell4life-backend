// ======================================================
// VENDOR ORDER DETAILS — per-item return processing
// ======================================================

console.log('vendor-order-details loaded');

function authFetch(url, opts = {}) {
  const token = localStorage.getItem('s4l_token');
  const headers = { ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...opts, credentials: 'include', headers });
}

let timerInterval;

const params = new URLSearchParams(window.location.search);
const orderId = params.get('id');
const container = document.getElementById('vendor-order-details');

if (!container || !orderId) {
  if (container) container.innerHTML = '<p>Invalid access</p>';
  throw new Error('Missing order ID');
}

/* ======================================================
   BADGE CONFIGS
====================================================== */
const RETURN_BADGE = {
  requested:          { label: 'Return Requested',   color: '#b45309', bg: '#fef3c7' },
  approved:           { label: 'Return Approved',    color: '#1d4ed8', bg: '#dbeafe' },
  rejected:           { label: 'Return Rejected',    color: '#b91c1c', bg: '#fee2e2' },
  partially_returned: { label: 'Partially Returned', color: '#c2410c', bg: '#ffedd5' },
  returned:           { label: 'Returned',           color: '#15803d', bg: '#dcfce7' },
};

const REFUND_BADGE = {
  scheduled:          { label: 'Refund Scheduled',   color: '#1d4ed8', bg: '#dbeafe' },
  processing:         { label: 'Refund Processing',  color: '#6d28d9', bg: '#ede9fe' },
  processed:          { label: 'Refunded ✓',         color: '#15803d', bg: '#dcfce7' },
  partially_refunded: { label: 'Partially Refunded', color: '#c2410c', bg: '#ffedd5' },
  failed:             { label: 'Refund Failed',      color: '#b91c1c', bg: '#fee2e2' },
};

function badge(map, status) {
  const b = map[status];
  if (!b) return '';
  return `<span style="background:${b.bg};color:${b.color};padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:600">${b.label}</span>`;
}

/* ======================================================
   LABELS
====================================================== */
function getVendorLabel(type) {
  const map = {
    Processing:       'Start Processing',
    Shipped:          'Mark Shipped',
    Delivered:        'Mark Delivered',
    'Return Approved': 'Approve Return',
    'Return Rejected': 'Reject Return',
    Returned:         'Mark Returned',
    Cancelled:        'Cancel Order',
    'Cancel Approved': 'Approve Cancellation',
  };
  return map[type] || type;
}

/* ======================================================
   PAYMENT LABEL
====================================================== */
function getPaymentLabel(paymentStatus) {
  switch ((paymentStatus || '').toLowerCase()) {
    case 'paid':                return 'Paid';
    case 'refund_scheduled':    return 'Refund Scheduled';
    case 'refunded':            return 'Refunded';
    case 'partially_refunded':  return 'Partially Refunded';
    case 'failed':              return 'Failed';
    default:                    return 'Pending';
  }
}

/* ======================================================
   DISPLAY STATUS
====================================================== */
function getDisplayStatus(order) {
  const payment = (order.paymentStatus || '').toLowerCase();
  if (payment === 'refunded') return `${order.status} • Refunded`;
  return order.status;
}

/* ======================================================
   BUILD ORDER-LEVEL ACTIONS (no itemId)
====================================================== */
function buildOrderActions(actions, id, vendorPayment) {
  if (!['paid', 'partially_refunded', 'refund_scheduled'].includes(vendorPayment)) {
    return '<p>Payment not completed.</p>';
  }
  if (vendorPayment === 'refund_scheduled') return '<p>Refund in progress. No actions available.</p>';
  if (vendorPayment === 'refunded') return '<p>Order fully refunded.</p>';

  const buttons = actions.map(a => `
    <button class="vendor-order-btn"
      data-type="${a.type}"
      data-order-id="${id}"
      style="padding:8px 16px;margin-right:8px;margin-bottom:8px;cursor:pointer;border-radius:4px;border:1px solid #d1d5db">
      ${getVendorLabel(a.type)}
    </button>
  `).join('');

  return buttons || '<p>No actions available</p>';
}

/* ======================================================
   BUILD PER-ITEM HTML
====================================================== */
function buildItemHTML(item, itemActions, id) {
  const qty      = Number(item.quantity || 1);
  const price    = Number(item.price || 0);
  const reqQty   = Number(item.returnRequestedQuantity || 0);
  const appQty   = Number(item.returnApprovedQuantity || 0);
  const retQty   = Number(item.returnQuantity || 0);
  const refQty   = Number(item.refundedQuantity || 0);

  const STATUS_BADGE = {
    'Pending':          { label: 'Pending',          color: '#92400e', bg: '#fef3c7' },
    'Processing':       { label: 'Processing',       color: '#1d4ed8', bg: '#dbeafe' },
    'Shipped':          { label: 'Shipped',           color: '#6d28d9', bg: '#ede9fe' },
    'Delivered':        { label: 'Delivered',         color: '#15803d', bg: '#dcfce7' },
    'Cancel Requested': { label: 'Cancel Requested', color: '#92400e', bg: '#fef3c7' },
    'Cancelled':        { label: 'Cancelled',         color: '#b91c1c', bg: '#fee2e2' },
  };
  const badges = [
    badge(STATUS_BADGE, item.status || 'Pending'),
    badge(RETURN_BADGE, item.returnStatus),
    badge(REFUND_BADGE, item.refundStatus),
  ].filter(Boolean).join(' ');

  const qtyDetail = [
    reqQty > 0 ? `${reqQty} requested` : '',
    retQty > 0 ? `${retQty} returned`  : '',
    refQty > 0 ? `${refQty} refunded`  : '',
  ].filter(Boolean).join(' · ');

  const actionsHTML = itemActions.map(a => {
    // ── Fulfillment ──────────────────────────────────────
    if (a.type === 'Processing') {
      return `
        <button class="vendor-item-btn"
          data-type="Processing" data-order-id="${id}" data-item-id="${a.itemId}"
          style="margin-top:6px;padding:5px 12px;background:#1d4ed8;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.82rem">
          Start Processing
        </button>`;
    }
    if (a.type === 'Shipped') {
      return `
        <button class="vendor-item-btn"
          data-type="Shipped" data-order-id="${id}" data-item-id="${a.itemId}"
          style="margin-top:6px;padding:5px 12px;background:#6d28d9;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.82rem">
          Mark Shipped
        </button>`;
    }
    if (a.type === 'Delivered') {
      return `
        <button class="vendor-item-btn"
          data-type="Delivered" data-order-id="${id}" data-item-id="${a.itemId}"
          style="margin-top:6px;padding:5px 12px;background:#15803d;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.82rem">
          Mark Delivered
        </button>`;
    }
    // ── Vendor-initiated cancel ───────────────────────────
    if (a.type === 'Vendor Cancel') {
      return `
        <button class="vendor-item-btn vendor-cancel-btn"
          data-type="Vendor Cancel" data-order-id="${id}" data-item-id="${a.itemId}"
          style="margin-top:6px;padding:5px 12px;background:#fff;color:#b91c1c;border:1px solid #b91c1c;border-radius:4px;cursor:pointer;font-size:0.82rem">
          Cancel Item
        </button>`;
    }
    // ── Customer cancel approval ──────────────────────────
    if (a.type === 'Cancel Approved') {
      return `
        <button class="vendor-item-btn"
          data-type="Cancel Approved" data-order-id="${id}" data-item-id="${a.itemId}"
          style="margin-top:6px;padding:5px 12px;background:#b91c1c;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.82rem">
          Approve Cancellation
        </button>`;
    }
    // ── Return handling ───────────────────────────────────
    if (a.type === 'Return Approved') {
      return `
        <button class="vendor-item-btn"
          data-type="Return Approved" data-order-id="${id}" data-item-id="${a.itemId}" data-qty="${reqQty || qty}"
          style="margin-top:6px;padding:5px 12px;background:#1d4ed8;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.82rem">
          Approve Return
        </button>`;
    }
    if (a.type === 'Return Rejected') {
      return `
        <button class="vendor-item-btn"
          data-type="Return Rejected" data-order-id="${id}" data-item-id="${a.itemId}"
          style="margin-top:6px;padding:5px 12px;background:#b91c1c;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.82rem">
          Reject Return
        </button>`;
    }
    if (a.type === 'Returned') {
      const remainingQty = Math.max(1, appQty - retQty) || qty;
      return `
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px">
          <select class="condition-select"
            style="padding:4px 6px;border:1px solid #d1d5db;border-radius:4px;font-size:0.8rem">
            <option value="used">Used</option>
            <option value="good">Good</option>
            <option value="new">New</option>
            <option value="damaged">Damaged</option>
          </select>
          <button class="vendor-item-btn"
            data-type="Returned" data-order-id="${id}" data-item-id="${a.itemId}" data-qty="${remainingQty}"
            style="padding:5px 12px;background:#111;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.82rem">
            Mark Returned
          </button>
        </div>`;
    }
    return '';
  }).join('');

  const img = typeof item.image === 'string'
    ? item.image
    : '/assets/images/products/sell4life-placeholder.png';

  const historyHTML = Array.isArray(item.returnHistory) && item.returnHistory.length
    ? `<details style="margin-top:8px">
        <summary style="font-size:0.75rem;color:#6b7280;cursor:pointer">History (${item.returnHistory.length})</summary>
        <ul style="margin:4px 0 0 0;padding-left:16px;font-size:0.75rem;color:#374151">
          ${item.returnHistory.slice().sort((a, b) => new Date(a.at) - new Date(b.at)).map(h =>
            `<li>${new Date(h.at).toLocaleString()} — ${h.note || h.type}${h.quantity > 0 ? ` ×${h.quantity}` : ''}</li>`
          ).join('')}
        </ul>
      </details>`
    : '';

  return `
    <div class="order-item">
      <img src="${img}" width="60" height="60"
        onerror="this.src='/assets/images/products/sell4life-placeholder.png'" />
      <div style="flex:1">
        <div>${item.name || 'Unnamed product'}</div>
        <div style="font-size:0.85rem;color:#6b7280">Qty: ${qty} × £${price.toFixed(2)}</div>
        ${badges    ? `<div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">${badges}</div>` : ''}
        ${qtyDetail ? `<div style="font-size:0.75rem;color:#9ca3af;margin-top:2px">${qtyDetail}</div>` : ''}
        ${actionsHTML}
        ${historyHTML}
      </div>
      <div class="order-price">£${(qty * price).toFixed(2)}</div>
    </div>`;
}

/* ======================================================
   LOAD ORDER
====================================================== */
async function loadOrder() {
  try {
    const [orderRes, vendorRes] = await Promise.all([
      authFetch(`${API_BASE}/vendor/orders/${orderId}`),
      authFetch(`${API_BASE}/vendor/me`),
    ]);

    if (orderRes.status === 401 || orderRes.status === 403) {
      window.location.href = '/account/signin.html';
      return;
    }
    if (!orderRes.ok) throw new Error('Order not found');

    const order      = await orderRes.json();
    const vendorData = await vendorRes.json();
    const vendor     = vendorData.vendor;

    if (!vendor) { container.innerHTML = '<p>Create your store first</p>'; return; }
    if (vendor.status === 'pending')   { container.innerHTML = '<p>Your store is under review</p>'; return; }
    if (vendor.status === 'suspended') { container.innerHTML = '<p>Your store is suspended</p>'; return; }

    window._currentOrder = order;

    const id        = order._id || order.id;
    const displayId = order.shortId || `S4L-${id.slice(0, 10).toUpperCase()}`;
    const vendorId  = vendor._id;

    const vendorOrder = (order.vendorOrders || []).find(
      vo => String(vo.vendorId) === String(vendorId)
    );

    const vendorRefundScheduledAt = vendorOrder?.refundScheduledAt || order.refundScheduledAt || null;

    const vendorItems = (order.items || []).filter(
      item => String(item.vendorId) === String(vendorId)
    );

    // Derive payment status from this vendor's items only so one vendor's refund
    // doesn't bleed into the other vendor's payment display.
    const orderPayment = (order.paymentStatus || 'pending').toLowerCase();
    const vendorRefundStatuses = vendorItems.map(i => i.refundStatus || 'none');
    const vendorHasReturnedItems = vendorItems.some(i =>
      ['returned', 'partially_returned'].includes(i.returnStatus)
    );
    const paymentStatus = !['paid', 'partially_refunded', 'refunded', 'refund_scheduled'].includes(orderPayment)
      ? orderPayment
      : vendorRefundStatuses.every(s => s === 'processed')
        ? 'refunded'
        : vendorRefundStatuses.some(s => ['processed', 'partially_refunded'].includes(s))
          ? 'partially_refunded'
          : (orderPayment === 'refund_scheduled' && vendorHasReturnedItems)
            ? 'refund_scheduled'
            : 'paid';
    const paymentLabel = getPaymentLabel(paymentStatus);

    const vendorSubtotal = vendorItems.reduce(
      (sum, item) => sum + Number(item.price) * Number(item.quantity), 0
    );
    const vendorShipping = vendorOrder?.shipping
      ?? vendorItems.reduce((sum, item) => sum + Number(item.shippingCost || 0), 0);
    const vendorTotal = vendorSubtotal + vendorShipping;

    // All actions are now per-item — build itemActionsMap only
    const allowed = Array.isArray(order.allowedActions) ? order.allowedActions : [];

    const itemActionsMap = {};
    allowed.forEach(a => {
      if (!a.itemId) return;
      const key = String(a.itemId);
      if (!itemActionsMap[key]) itemActionsMap[key] = [];
      itemActionsMap[key].push(a);
    });

    const vendorStatus = order.status || vendorOrder?.status || 'Unknown';

    container.innerHTML = `
      <div class="order-details-card">
        <h2>Order ${displayId}</h2>

        <div class="order-status">
          <div>Status: <strong>${getDisplayStatus({ ...order, status: vendorStatus, refundScheduledAt: vendorRefundScheduledAt, paymentStatus })}</strong></div>
          <div>Payment: <strong>${paymentLabel}</strong></div>
          ${paymentStatus === 'refund_scheduled' && vendorRefundScheduledAt ? `
            <div class="refund-info">
              <div>Refund scheduled: ${new Date(order.refundScheduledAt).toLocaleString()}</div>
              <div id="refund-timer" data-time="${order.refundScheduledAt}"></div>
            </div>` : ''}
        </div>

        <div class="order-items">
          ${vendorItems.length === 0
            ? '<p>No items for this vendor</p>'
            : vendorItems.map(item =>
                buildItemHTML(item, itemActionsMap[String(item._id)] || [], id)
              ).join('')}
        </div>

        <div class="order-total">
          ${vendorShipping > 0 ? `<div style="font-size:0.88rem;color:#6b7280;font-weight:400;text-align:right;margin-bottom:4px">Items: £${vendorSubtotal.toFixed(2)} + Shipping: £${vendorShipping.toFixed(2)}</div>` : ''}
          Total: £${vendorTotal.toFixed(2)}
        </div>

        <div class="tracking-section">
          <h3 style="margin:0 0 10px;font-size:1rem;color:#111827">Shipping &amp; Tracking</h3>
          ${order.trackingNumber
            ? `<p style="font-size:0.88rem;color:#374151;margin:0 0 8px">Current: <strong>${order.trackingNumber}</strong>${order.carrier ? ` (${order.carrier})` : ''}</p>`
            : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:flex-end">
            <div>
              <label style="display:block;font-size:0.8rem;color:#6b7280;margin-bottom:4px">Tracking number</label>
              <input id="tracking-number" type="text" placeholder="e.g. JD123456789GB"
                value="${order.trackingNumber || ''}"
                style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:0.88rem;width:200px" />
            </div>
            <div>
              <label style="display:block;font-size:0.8rem;color:#6b7280;margin-bottom:4px">Carrier (optional)</label>
              <input id="tracking-carrier" type="text" placeholder="e.g. Royal Mail"
                value="${order.carrier || ''}"
                style="padding:7px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:0.88rem;width:160px" />
            </div>
            <button id="save-tracking-btn" data-order-id="${id}"
              style="padding:7px 16px;background:#0b6b6a;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.88rem;white-space:nowrap">
              Save &amp; Notify Buyer
            </button>
          </div>
          <p id="tracking-msg" style="font-size:0.8rem;margin:8px 0 0;min-height:18px"></p>
        </div>
      </div>`;

    initTimer();
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p>Could not load order</p>';
  }
}

/* ======================================================
   TIMER
====================================================== */
function initTimer() {
  const el = document.getElementById('refund-timer');
  if (!el) return;

  const target = new Date(el.dataset.time).getTime();

  function update() {
    const diff = target - Date.now();
    if (diff <= 0) { el.textContent = 'Refund processing...'; return; }
    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    el.textContent = `Refund in: ${h}h ${m}m ${s}s`;
  }

  update();
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(update, 1000);
}

/* ======================================================
   UPDATE ITEM STATUS (per-item endpoints)
====================================================== */
async function updateItemStatus(oid, itemId, type, qty, condition) {
  let url, body;

  if (['Processing', 'Shipped', 'Delivered'].includes(type)) {
    url  = `${API_BASE}/vendor/orders/${oid}/items/${itemId}/fulfillment`;
    body = { status: type };
  } else if (type === 'Vendor Cancel') {
    url  = `${API_BASE}/vendor/orders/${oid}/items/${itemId}/vendor-cancel`;
    body = {};
  } else if (type === 'Return Approved') {
    url  = `${API_BASE}/vendor/orders/${oid}/items/${itemId}/approve-return`;
    body = { quantity: qty };
  } else if (type === 'Return Rejected') {
    url  = `${API_BASE}/vendor/orders/${oid}/items/${itemId}/reject-return`;
    body = { reason: 'Rejected by vendor' };
  } else if (type === 'Returned') {
    url  = `${API_BASE}/vendor/orders/${oid}/items/${itemId}/mark-returned`;
    body = { quantity: qty, condition };
  } else if (type === 'Cancel Approved') {
    url  = `${API_BASE}/vendor/orders/${oid}/items/${itemId}/approve-cancel`;
    body = {};
  } else {
    throw new Error(`Unknown item action: ${type}`);
  }

  const res = await authFetch(url, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Action failed');
  }
}

/* ======================================================
   UPDATE ORDER STATUS (order-level endpoints)
====================================================== */
async function updateOrderStatus(oid, type) {
  const res = await authFetch(`${API_BASE}/vendor/orders/${oid}/status`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ status: type }),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Update failed');
  }
}

/* ======================================================
   CLICK HANDLER (DELEGATED)
====================================================== */
document.addEventListener('click', async (e) => {
  // Tracking save button
  const trackingBtn = e.target.closest('#save-tracking-btn');
  if (trackingBtn) {
    const oid            = trackingBtn.dataset.orderId;
    const trackingNumber = document.getElementById('tracking-number')?.value.trim();
    const carrier        = document.getElementById('tracking-carrier')?.value.trim();
    const msg            = document.getElementById('tracking-msg');

    if (!trackingNumber) {
      if (msg) { msg.style.color = '#dc2626'; msg.textContent = 'Enter a tracking number first.'; }
      return;
    }

    trackingBtn.disabled = true;
    trackingBtn.textContent = 'Saving…';
    if (msg) msg.textContent = '';

    try {
      const res = await authFetch(`${API_BASE}/vendor/orders/${oid}/tracking`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ trackingNumber, carrier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save tracking');
      if (msg) { msg.style.color = '#15803d'; msg.textContent = 'Saved! Buyer has been notified by email.'; }
      trackingBtn.textContent = 'Saved ✓';
      setTimeout(() => location.reload(), 1500);
    } catch (err) {
      if (msg) { msg.style.color = '#dc2626'; msg.textContent = err.message || 'Save failed'; }
      trackingBtn.disabled = false;
      trackingBtn.textContent = 'Save & Notify Buyer';
    }
    return;
  }

  // Per-item action buttons
  const itemBtn = e.target.closest('.vendor-item-btn');
  if (itemBtn) {
    const type   = itemBtn.dataset.type;
    const oid    = itemBtn.dataset.orderId;
    const itemId = itemBtn.dataset.itemId;
    const qty    = Number(itemBtn.dataset.qty || 1);

    if (type === 'Vendor Cancel') {
      const confirmed = confirm('Cancel this item?\n\nA partial refund will be issued immediately to the customer and cannot be undone.\n\nOnly proceed if you are certain you cannot fulfil this item.');
      if (!confirmed) return;
    }

    let condition = 'used';
    if (type === 'Returned') {
      const wrapper = itemBtn.closest('div');
      const sel = wrapper?.querySelector('.condition-select');
      if (sel) condition = sel.value;
    }

    itemBtn.disabled = true;
    itemBtn.textContent = 'Updating...';

    try {
      await updateItemStatus(oid, itemId, type, qty, condition);
      location.reload();
    } catch (err) {
      alert(err.message || 'Action failed');
      itemBtn.disabled = false;
      itemBtn.textContent = getVendorLabel(type);
    }
    return;
  }

  // Order-level action buttons
  const orderBtn = e.target.closest('.vendor-order-btn');
  if (orderBtn) {
    const type = orderBtn.dataset.type;
    const oid  = orderBtn.dataset.orderId;

    orderBtn.disabled = true;
    orderBtn.textContent = 'Updating...';

    try {
      await updateOrderStatus(oid, type);
      location.reload();
    } catch (err) {
      alert(err.message || 'Action failed');
      orderBtn.disabled = false;
      orderBtn.textContent = getVendorLabel(type);
    }
  }
});

/* ======================================================
   INIT
====================================================== */
loadOrder();

startLiveUpdates(() => {
  loadOrder();
});
