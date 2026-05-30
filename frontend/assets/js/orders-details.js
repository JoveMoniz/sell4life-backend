// =====================================================
// Order Details — per-item return support
// =====================================================

console.log('orders-details.js running');

const API = window.API_BASE || '';

/* ======================================================
   AUTH FETCH
====================================================== */
function authFetch(url, opts = {}) {
  const token = localStorage.getItem('s4l_token');
  const headers = { ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...opts, credentials: 'include', headers });
}

/* ======================================================
   BADGE HELPERS
====================================================== */
const RETURN_BADGE = {
  requested:          { label: 'Return Requested',    color: '#b45309', bg: '#fef3c7' },
  approved:           { label: 'Return Approved',     color: '#1d4ed8', bg: '#dbeafe' },
  rejected:           { label: 'Return Rejected',     color: '#b91c1c', bg: '#fee2e2' },
  partially_returned: { label: 'Partially Returned',  color: '#c2410c', bg: '#ffedd5' },
  returned:           { label: 'Returned',            color: '#15803d', bg: '#dcfce7' },
};

const REFUND_BADGE = {
  scheduled:          { label: 'Refund Scheduled',   color: '#1d4ed8', bg: '#dbeafe' },
  processing:         { label: 'Refund Processing',  color: '#6d28d9', bg: '#ede9fe' },
  processed:          { label: 'Refunded ✓',         color: '#15803d', bg: '#dcfce7' },
  partially_refunded: { label: 'Partially Refunded', color: '#c2410c', bg: '#ffedd5' },
  failed:             { label: 'Refund Failed',      color: '#b91c1c', bg: '#fee2e2' },
};

function returnBadge(status) {
  const b = RETURN_BADGE[status];
  if (!b) return '';
  return `<span class="item-badge" style="background:${b.bg};color:${b.color};padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:600">${b.label}</span>`;
}

function refundBadge(status) {
  const b = REFUND_BADGE[status];
  if (!b) return '';
  return `<span class="item-badge" style="background:${b.bg};color:${b.color};padding:2px 8px;border-radius:12px;font-size:0.75rem;font-weight:600">${b.label}</span>`;
}

function canRequestReturn(item) {
  return (
    item.status === 'Delivered' &&
    !['requested', 'approved', 'partially_returned', 'returned'].includes(item.returnStatus)
  );
}

function canRequestCancel(item) {
  return ['Pending', 'Processing'].includes(item.status);
}

function formatHistoryStatus(status) {
  const map = {
    'Cancel Requested': 'Cancel requested',
    'Return Requested': 'Return requested',
    'Return Approved':  'Return approved ✅',
    'Return Rejected':  'Return rejected ❌',
    Returned:           'Item returned',
    Cancelled:          'Order cancelled',
    Refunded:           'Refund issued 💸',
  };
  return map[status] || status;
}

/* ======================================================
   BUILD ITEM HTML
====================================================== */
function buildItemHTML(item) {
  const qty   = Number(item.quantity ?? 1);
  const price = Number(item.price ?? 0);
  const line  = qty * price;
  const img   = typeof item.image === 'string'
    ? item.image
    : '/assets/images/products/sell4life-placeholder.png';

  const returnedQty  = Number(item.returnQuantity || 0);
  const refundedQty  = Number(item.refundedQuantity || 0);
  const requestedQty = Number(item.returnRequestedQuantity || 0);

  const badges = [
    returnBadge(item.returnStatus),
    refundBadge(item.refundStatus),
  ].filter(Boolean).join(' ');

  const quantityDetail = [
    requestedQty  > 0 ? `${requestedQty} requested`  : '',
    returnedQty   > 0 ? `${returnedQty} returned`    : '',
    refundedQty   > 0 ? `${refundedQty} refunded`    : '',
  ].filter(Boolean).join(' · ');

  const cancelBtn = canRequestCancel(item) ? `
    <button class="btn-cancel-item" data-item-id="${item._id}"
      style="margin-top:8px;font-size:0.8rem;padding:4px 10px;cursor:pointer;background:#fee2e2;border:1px solid #fca5a5;border-radius:4px;color:#b91c1c">
      Cancel this item
    </button>` : '';

  const returnForm = canRequestReturn(item) ? `
    <button class="btn-show-return-form" data-item-id="${item._id}"
      style="margin-top:8px;font-size:0.8rem;padding:4px 10px;cursor:pointer">
      Return this item
    </button>
    <div class="item-return-form" id="return-form-${item._id}" style="display:none;margin-top:10px;padding:10px;border:1px solid #e5e7eb;border-radius:6px">
      <label style="display:block;margin-bottom:6px;font-size:0.85rem">
        Quantity to return:
        <select class="return-qty-sel" style="margin-left:6px">
          ${Array.from({ length: qty }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join('')}
        </select>
      </label>
      <label style="display:block;margin-bottom:8px;font-size:0.85rem">
        Reason (optional):
        <input class="return-reason-inp" type="text" placeholder="e.g. wrong size"
          style="display:block;width:100%;margin-top:4px;padding:6px;border:1px solid #d1d5db;border-radius:4px;box-sizing:border-box" />
      </label>
      <div style="display:flex;gap:8px">
        <button class="btn-submit-return" data-item-id="${item._id}"
          style="padding:6px 14px;background:#111;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.85rem">
          Submit Request
        </button>
        <button class="btn-cancel-return-form" data-item-id="${item._id}"
          style="padding:6px 14px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;font-size:0.85rem">
          Cancel
        </button>
      </div>
    </div>
  ` : '';

  return `
    <div class="order-item" data-item-id="${item._id}">
      <img class="order-thumb"
        src="${img}"
        alt="${item.name || 'Product'}"
        onerror="this.src='/assets/images/products/sell4life-placeholder.png'">

      <div class="order-info" style="flex:1">
        <div class="order-name">${item.name || 'Unnamed product'}</div>
        <div class="order-qty">${qty} × £${price.toFixed(2)}</div>
        ${badges ? `<div style="margin-top:4px;display:flex;flex-wrap:wrap;gap:4px">${badges}</div>` : ''}
        ${quantityDetail ? `<div style="font-size:0.75rem;color:#6b7280;margin-top:2px">${quantityDetail}</div>` : ''}
        ${cancelBtn}
        ${returnForm}
      </div>

      <div class="order-line-price">£${line.toFixed(2)}</div>
    </div>
  `;
}

/* ======================================================
   LOAD ORDER
====================================================== */
async function loadOrderDetails() {
  const params    = new URLSearchParams(window.location.search);
  const orderId   = params.get('id');
  const container = document.getElementById('order-details');
  const loading   = document.getElementById('order-loading');

  if (!container || !loading) return;

  if (!orderId) {
    loading.textContent = 'Invalid order.';
    return;
  }

  const token = localStorage.getItem('s4l_token');
  if (!token) {
    window.location.href = '/account/signin.html';
    return;
  }

  try {
    const res = await authFetch(`${API}/orders/${orderId}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const order = await res.json();
    loading.style.display = 'none';

    const id        = order.id || order._id;
    const displayId = order.shortId || `S4L-${id.slice(0, 10).toUpperCase()}`;
    const items     = Array.isArray(order.items) ? order.items : [];

    const paymentStatus = order.paymentStatus || 'pending';
    const paymentLabel  =
      paymentStatus === 'paid'                ? 'Paid' :
      paymentStatus === 'refund_scheduled'    ? 'Refund Scheduled' :
      paymentStatus === 'refunded'            ? 'Refunded' :
      paymentStatus === 'partially_refunded'  ? 'Partially Refunded' :
      paymentStatus === 'failed'              ? 'Failed' : 'Unpaid';

    container.innerHTML = `
      <h2 class="order-id">${displayId}</h2>

      <p>Fulfillment: <strong class="order-status">${order.status || '—'}</strong></p>

      <p>Payment:
        <strong class="payment-status ${paymentStatus}">${paymentLabel}</strong>
      </p>

      <p>Date: ${order.createdAt ? new Date(order.createdAt).toLocaleString() : '—'}</p>

      <div class="order-history">
        <h4>Order activity</h4>
        <ul class="order-history-list">
          ${Array.isArray(order.statusHistory)
            ? order.statusHistory.slice()
                .sort((a, b) => {
                  const diff = new Date(b.date) - new Date(a.date);
                  if (diff !== 0) return diff;
                  // Same timestamp: cancel before refund (logical order)
                  const rank = { Cancelled: 0, Refunded: 1, Refund: 2 };
                  const ra = Object.keys(rank).find(k => String(a.status).includes(k));
                  const rb = Object.keys(rank).find(k => String(b.status).includes(k));
                  return (rank[ra] ?? 99) - (rank[rb] ?? 99);
                })
                .map(h => `
                <li>
                  <span class="history-label">${formatHistoryStatus(h.status)}</span>
                  <span class="history-date">${new Date(h.date).toLocaleString()}</span>
                </li>`).join('')
            : ''}
        </ul>
      </div>

      <div class="order-items">
        ${items.length
          ? items.map(buildItemHTML).join('')
          : '<p>No items found.</p>'}
      </div>

      <div class="order-actions-wrapper">
        <button class="order-actions-toggle" id="orderActionsToggle">Actions ▼</button>
        <div class="order-actions-menu" id="orderActionsMenu">
          <button id="requestCancelBtn" style="display:none">Request Cancel</button>
          <button id="requestRefundBtn" style="display:none">Refund Pending Review</button>
          <button id="trackOrderBtn"    style="display:none">Track Order</button>
          <button id="contactVendorBtn" style="display:none">Contact Vendor</button>
          <button id="downloadInvoiceBtn" style="display:none">Download Invoice</button>
          <button id="reportIssueBtn"   style="display:none">Report Issue</button>
        </div>
      </div>

      <div class="order-total"><h3>£${Number(order.total ?? 0).toFixed(2)}</h3></div>
    `;

    setupButtons(order, id);
  } catch (err) {
    console.error('ORDER DETAILS ERROR:', err);
    loading.textContent = 'Failed to load order.';
  }
}

/* ======================================================
   ORDER-LEVEL BUTTONS
====================================================== */
function setupButtons(order, id) {
  // Order-level cancel removed — per-item Cancel buttons shown on each item card instead
}

/* ======================================================
   PER-ITEM RETURN HANDLERS (delegated — added once)
====================================================== */
let _returnHandlerReady = false;

function ensureReturnHandler() {
  if (_returnHandlerReady) return;
  _returnHandlerReady = true;

  document.addEventListener('click', async (e) => {
    // Cancel item
    const cancelItemBtn = e.target.closest('.btn-cancel-item');
    if (cancelItemBtn) {
      if (!confirm('Request cancellation for this item?')) return;
      const itemId  = cancelItemBtn.dataset.itemId;
      const orderId = new URLSearchParams(window.location.search).get('id');
      cancelItemBtn.disabled = true;
      cancelItemBtn.textContent = 'Requesting…';
      try {
        const res = await authFetch(`${API}/orders/${orderId}/items/${itemId}/cancel-request`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
        });
        const data = await res.json();
        if (!res.ok) { alert(data.error || 'Cancel request failed'); return; }
        location.reload();
      } catch (err) {
        alert('Something went wrong. Please try again.');
      } finally {
        cancelItemBtn.disabled = false;
        cancelItemBtn.textContent = 'Cancel this item';
      }
      return;
    }

    // Toggle form
    const showBtn = e.target.closest('.btn-show-return-form');
    if (showBtn) {
      const itemId = showBtn.dataset.itemId;
      const form   = document.getElementById(`return-form-${itemId}`);
      if (form) form.style.display = form.style.display === 'none' ? 'block' : 'none';
      return;
    }

    // Cancel form
    const cancelBtn = e.target.closest('.btn-cancel-return-form');
    if (cancelBtn) {
      const form = document.getElementById(`return-form-${cancelBtn.dataset.itemId}`);
      if (form) form.style.display = 'none';
      return;
    }

    // Submit return request
    const submitBtn = e.target.closest('.btn-submit-return');
    if (!submitBtn) return;

    const itemId  = submitBtn.dataset.itemId;
    const form    = document.getElementById(`return-form-${itemId}`);
    const qty     = Number(form.querySelector('.return-qty-sel').value);
    const reason  = form.querySelector('.return-reason-inp').value.trim();
    const params  = new URLSearchParams(window.location.search);
    const orderId = params.get('id');

    submitBtn.disabled   = true;
    submitBtn.textContent = 'Submitting…';

    try {
      const res = await authFetch(`${API}/orders/${orderId}/items/${itemId}/return-request`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ quantity: qty, reason }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Return request failed'); return; }
      location.reload();
    } catch (err) {
      console.error(err);
      alert('Something went wrong. Please try again.');
    } finally {
      submitBtn.disabled   = false;
      submitBtn.textContent = 'Submit Request';
    }
  });
}

/* ======================================================
   LIVE UPDATE (status only — no full rebuild)
====================================================== */
async function refreshOrderStatus() {
  const params    = new URLSearchParams(window.location.search);
  const orderId   = params.get('id');
  if (!orderId) return;

  try {
    const res = await authFetch(`${API}/orders/${orderId}`);
    if (!res.ok) return;
    const order = await res.json();

    const statusEl  = document.querySelector('.order-status');
    const paymentEl = document.querySelector('.payment-status');

    if (statusEl) statusEl.textContent = order.status;

    if (paymentEl) {
      const payment = (order.paymentStatus || '').toLowerCase();
      const label   =
        payment === 'paid'                ? 'Paid' :
        payment === 'refund_scheduled'    ? 'Refund Scheduled' :
        payment === 'refunded'            ? 'Refunded' :
        payment === 'partially_refunded'  ? 'Partially Refunded' :
        payment === 'failed'              ? 'Failed' : 'Unpaid';
      paymentEl.textContent = label;
      paymentEl.className   = `payment-status ${payment}`;
    }
  } catch (err) {
    console.error('Live update failed:', err);
  }
}

/* ======================================================
   ACTION DROPDOWN
====================================================== */
document.addEventListener('click', (e) => {
  if (e.target.closest('#orderActionsToggle')) {
    const menu = document.getElementById('orderActionsMenu');
    if (menu) menu.classList.toggle('open');
    return;
  }
  const menu = document.getElementById('orderActionsMenu');
  if (menu && !e.target.closest('.order-actions-wrapper')) {
    menu.classList.remove('open');
  }
});

/* ======================================================
   INIT
====================================================== */
ensureReturnHandler();
loadOrderDetails();

startLiveUpdates(() => {
  refreshOrderStatus();
});
