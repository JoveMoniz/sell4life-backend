// ======================================================
// VENDOR ORDER DETAILS (FINAL CLEAN + FULLY ALIGNED)
// ======================================================

console.log('vendor orders loaded');

let currentStatus = 'all';
let currentQuery = '';

let timerInterval; // 👈 HERE

const params = new URLSearchParams(window.location.search);
const orderId = params.get('id');

const container = document.getElementById('vendor-order-details');
const token = localStorage.getItem('s4l_token');

if (!container || !orderId || !token) {
  if (container) container.innerHTML = '<p>Invalid access</p>';
  throw new Error('Invalid access');
}

/* ======================================================
   DISPLAY STATUS (HONEST + FULL STORY)
====================================================== */

function getDisplayStatus(order) {
  const payment = (order.paymentStatus || '').toLowerCase();
  const status = order.status;

  if (status === 'Return Rejected') {
    return 'Delivered • Return Rejected ❌';
  }

  if (payment === 'refunded') {
    return `${status} • Refunded`;
  }

  const isRefundLocked = order.refundScheduledAt && new Date(order.refundScheduledAt) > new Date();

  if (isRefundLocked) {
    return `<p>Refund in progress. No actions available.</p>`;
  }

  if (payment === 'refunded') {
    return `<p>Refund completed.</p>`;
  }

  return status;
}

/* ======================================================
   VENDOR TRANSITIONS (ALIGNED WITH BACKEND)
====================================================== */

function getAllowedTransitions(status) {
  const map = {
    Pending: ['Processing'],
    Processing: ['Shipped'],
    Shipped: ['Delivered'],

    Delivered: [],

    'Return Requested': ['Return Approved', 'Return Rejected'],
    'Return Approved': ['Returned'],
    'Return Rejected': [],

    'Cancel Requested': ['Cancelled'],

    Cancelled: [],
    Returned: [],
  };

  return map[status] || [];
}

/* ======================================================
   LABELS (NO RAW DATABASE TEXT)
====================================================== */

function getVendorLabel(status) {
  const map = {
    Processing: 'Start Processing',
    Shipped: 'Mark Shipped',
    Delivered: 'Mark Delivered',

    'Return Approved': 'Approve Return',
    'Return Rejected': 'Reject Return',

    Returned: 'Mark Returned',
    Cancelled: 'Cancel Order',
  };

  return map[status] || status;
}

/* ======================================================
   PAYMENT LABEL
====================================================== */

function getPaymentLabel(paymentStatus) {
  switch ((paymentStatus || '').toLowerCase()) {
    case 'paid':
      return 'Paid';
    case 'refund_scheduled':
      return 'Refund Scheduled';
    case 'refunded':
      return 'Refunded';
    case 'failed':
      return 'Failed';
    default:
      return 'Pending';
  }
}

/* ======================================================
   ACTION BUILDER (SMART + SAFE)
====================================================== */

function buildActions(order, id) {
  const payment = (order.paymentStatus || '').toLowerCase();

  const isRefundLocked = order.refundScheduledAt && new Date(order.refundScheduledAt) > new Date();

  // 🚫 block unpaid
  if (payment !== 'paid') {
    return `<p>Payment not completed.</p>`;
  }

  // 🚫 block refund flow
  if (payment === 'refund_scheduled' || isRefundLocked) {
    return `<p>Refund in progress. No actions available.</p>`;
  }

  if (payment === 'refunded') {
    return `<p>Refund completed.</p>`;
  }

  // 🚫 return rejected = end for vendor
  if (order.status === 'Return Rejected') {
    return `<p>Return rejected. No further action.</p>`;
  }

  const allowed = getAllowedTransitions(order.status);

  const map = {
    Processing: 'btn-process',
    Cancelled: 'btn-cancel',
    Shipped: 'btn-ship',
    Delivered: 'btn-deliver',
    'Return Approved': 'btn-approve-return',
    'Return Rejected': 'btn-reject-return',
    Returned: 'btn-mark-returned',
  };

  const buttons = allowed
    .map((s) => {
      const cls = map[s] || '';

      // ============================================
      // RETURN ACTIONS NEED ITEM ID
      // ============================================

      let itemId = '';

      if (['Return Approved', 'Return Rejected', 'Returned'].includes(s)) {
        const returnItem = (order.items || []).find(
          (item) => item.returnStatus === 'requested' || item.returnStatus === 'approved'
        );

        itemId = returnItem?._id || '';
      }

      return `
      <button
        class="${cls}"
        data-id="${id}"
        data-item="${itemId}"
        data-label="${s}"
      >
        ${getVendorLabel(s)}
      </button>
    `;
    })
    .join('');

  return buttons || `<p>No actions available</p>`;
}

/* ======================================================
   LOAD ORDER
====================================================== */

async function loadOrder() {
  try {
    const res = await fetch(`${API_BASE}/vendor/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error('Order not found');

    const order = await res.json();

    const id = order._id || order.id;
    const displayId = order.shortId || `S4L-${id.slice(0, 10).toUpperCase()}`;

    const paymentStatus = (order.paymentStatus || 'pending').toLowerCase();
    const paymentLabel = getPaymentLabel(paymentStatus);

    // get vendor id
    const vendorRes = await fetch(`${API_BASE}/vendor/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const vendorData = await vendorRes.json();

    const vendor = vendorData.vendor;

    if (!vendor) {
      container.innerHTML = '<p>Create your store first</p>';
      return;
    }

    if (vendor.status === 'pending') {
      container.innerHTML = '<p>Your store is under review</p>';
      return;
    }

    if (vendor.status === 'suspended') {
      container.innerHTML = '<p>Your store is suspended</p>';
      return;
    }

    const vendorId = vendorData.vendor?._id;

    // =====================================================
    // VENDOR-SCOPED ORDER VIEW
    // =====================================================

    const vendorOrder = (order.vendorOrders || []).find(
      (vo) => String(vo.vendorId) === String(vendorId)
    );

    const vendorStatus = order.status || vendorOrder?.status || 'Unknown';

    const vendorRefundScheduledAt =
      vendorOrder?.refundScheduledAt || order.refundScheduledAt || null;

    const vendorItems = (order.items || []).filter(
      (item) => String(item.vendorId) === String(vendorId)
    );

    const vendorTotal = vendorItems.reduce(
      (sum, item) => sum + Number(item.price) * Number(item.quantity),
      0
    );

    container.innerHTML = `
<div class="order-details-card">

  <h2>Order ${displayId}</h2>

  <div class="order-status">
    <div>
      Status:
      <strong>
  ${getDisplayStatus({
    ...order,
    status: vendorStatus,
    refundScheduledAt: vendorRefundScheduledAt,
  })}
</strong>
    </div>

    ${
      paymentStatus === 'refund_scheduled' && vendorRefundScheduledAt
        ? `
        <div class="refund-info">
          <div>Refund scheduled at: ${new Date(order.refundScheduledAt).toLocaleString()}</div>
          <div id="refund-timer" data-time="${order.refundScheduledAt}"></div>
        </div>
        `
        : ''
    }
  </div>

  <div class="order-actions">
    ${buildActions(
      {
        ...order,
        status: vendorStatus,
        refundScheduledAt: vendorRefundScheduledAt,
      },
      id
    )}
  </div>

  <div class="order-items">
    ${
      vendorItems.length === 0
        ? '<p>No items for this vendor</p>'
        : vendorItems
            .map(
              (item) => `
          <div class="order-item">
            <img 
              src="${item.image || '/assets/images/products/sell4life-placeholder.png'}"
              width="60"
              height="60"
            />
            <div>
              <div>${item.name}</div>
              <div>Qty: ${item.quantity}</div>
            </div>
            <div class="order-price">
              £${(item.price * item.quantity).toFixed(2)}
            </div>
          </div>
        `
            )
            .join('')
    }
  </div>

  <div class="order-total">
    Total: £${vendorTotal.toFixed(2)}
  </div>

</div>
`;

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

    if (diff <= 0) {
      el.textContent = 'Refund processing...';
      return;
    }

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
   ACTION HANDLER (SAFE TARGETING)
====================================================== */

document.addEventListener('click', async (e) => {
  const btn = e.target.closest(
    '.btn-process, .btn-cancel, .btn-ship, .btn-deliver, .btn-approve-return, .btn-reject-return, .btn-mark-returned'
  );

  if (!btn) return;

  const id = btn.dataset.id;
  const itemId = btn.dataset.item;
  const status = btn.dataset.label;

  if (!status) return;

  try {
    btn.disabled = true;
    btn.textContent = 'Updating...';

    await updateStatus(id, itemId, status);
    location.reload();
  } catch (err) {
    alert(err.message || 'Action failed');
    btn.disabled = false;
    btn.textContent = getVendorLabel(status);
  }
});

/* ======================================================
   UPDATE STATUS
====================================================== */

async function updateStatus(orderId, itemId, status) {
  const token = localStorage.getItem('s4l_token');

  let url = '';
  let body = {};

  // ====================================================
  // RETURN APPROVAL
  // ====================================================

  if (status === 'Return Approved') {
    url = `${API_BASE}/vendor/orders/${orderId}/items/${itemId}/approve-return`;

    body = {
      quantity: 1,
    };
  }

  // ====================================================
  // RETURN REJECTION
  // ====================================================
  else if (status === 'Return Rejected') {
    url = `${API_BASE}/vendor/orders/${orderId}/items/${itemId}/reject-return`;

    body = {
      reason: 'Rejected by vendor',
    };
  }

  // ====================================================
  // MARK RETURNED
  // ====================================================
  else if (status === 'Returned') {
    url = `${API_BASE}/vendor/orders/${orderId}/items/${itemId}/mark-returned`;

    body = {
      quantity: 1,
      condition: 'used',
    };
  }

  // ====================================================
  // NORMAL FULFILLMENT
  // ====================================================
  else {
    url = `${API_BASE}/vendor/orders/${orderId}/status`;

    body = {
      status,
    };
  }

  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json();

    throw new Error(data.error || 'Update failed');
  }
}
/* ======================================================
   INIT
====================================================== */

loadOrder();

startLiveUpdates(() => {
  loadOrder();
});
