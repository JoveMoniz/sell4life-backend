const API = window.API_BASE;

/* ================================
   AUTH GUARD
================================ */
const token = localStorage.getItem('s4l_token');
if (!token) {
  window.location.href = '/account/admin/signin.html';
  throw new Error('Not authenticated');
}

/* ================================
   GET ORDER ID
================================ */
const params = new URLSearchParams(window.location.search);
const orderId = params.get('id');

if (!orderId) {
  window.location.href = '/account/admin/orders.html';
  throw new Error('Missing order ID');
}

/* ================================
   ELEMENTS
================================ */
const statusSelect = document.getElementById('statusSelect');
const updateBtn = document.getElementById('updateStatus');
const result = document.getElementById('result');
const historyList = document.getElementById('statusHistory');
const productsTable = document.getElementById('productsTable');
const refundBtn = document.getElementById('refundBtn');
const orderStatusEl = document.getElementById('orderStatus');

/* ================================
   STATE
================================ */
let currentOrder = null;

/* ================================
   PAYMENT LABEL (UNIFIED)
================================ */
function getPaymentLabel(state) {
  switch ((state || '').toLowerCase()) {
    case 'paid':
      return 'Paid';
    case 'refund_scheduled':
      return 'Refund Scheduled';
    case 'refunded':
      return 'Refunded';
    case 'failed':
      return 'Failed';
    default:
      return 'Unpaid';
  }
}

function getAdminLabel(status) {
  const labels = {
    Processing: 'Start Processing',
    Shipped: 'Mark Shipped',
    Delivered: 'Mark Delivered',
    Cancelled: 'Force Cancel',

    'Cancel Requested': 'Approve Cancel',
    'Return Requested': 'Approve Return',

    'Return Approved': 'Approve Return',
    'Return Rejected': 'Reject Return',

    Returned: 'Mark Returned',
    Refunded: 'Issue Refund',
  };

  return labels[status] || status;
}

/* ================================
   STATUS TRANSITIONS (ALIGNED)
================================ */
function getAllowedTransitions(status) {
  const map = {
    pending: ['Processing', 'Cancelled'],

    processing: ['Shipped', 'Cancelled'],

    shipped: ['Delivered'],

    delivered: [],

    'cancel requested': ['Cancelled', 'Processing'],

    'return requested': ['Return Approved', 'Return Rejected'],

    'return approved': ['Returned'],

    'return rejected': [],

    returned: ['Refunded'],

    'refund requested': ['Refunded'],

    cancelled: ['Refunded'],

    refunded: [],
  };

  return map[status] || [];
}

/* ================================
   LOAD ORDER
================================ */
async function loadOrder() {
  try {
    const res = await fetch(`${API_BASE}/admin/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error('Failed to load order');

    const order = await res.json();
    currentOrder = order;

    const id = order.id || order._id;

    /* ========= SUMMARY ========= */
    document.getElementById('orderId').textContent =
      order.shortId || `S4L-${id.slice(0, 10).toUpperCase()}`;

    document.getElementById('orderUser').textContent = order.user?.email || '-';

    document.getElementById('orderDate').textContent = new Date(order.createdAt).toLocaleString();

    document.getElementById('orderTotal').textContent = '£' + Number(order.total).toFixed(2);

    /* ========= STATUS + TIMER ========= */
    orderStatusEl.textContent = order.status;

    if (order.paymentStatus === 'refund_scheduled') {
      orderStatusEl.textContent += ' • refund pending';
    }

    /* ========= PAYMENT ========= */
    const paymentState = (order.paymentStatus || 'pending').toLowerCase();
    const paymentLabel = getPaymentLabel(paymentState);

    const paymentStatusEl = document.getElementById('paymentStatus');
    const paymentMethodEl = document.getElementById('paymentMethod');

    if (paymentStatusEl) {
      paymentStatusEl.className = `payment-status ${paymentState}`;

      paymentStatusEl.innerHTML = `
    ${paymentLabel}
    ${
      order.paymentStatus === 'refund_scheduled' && order.refundScheduledAt
        ? `<span class="refund-badge" data-time="${order.refundScheduledAt}">
             <span class="refund-timer"></span>
           </span>`
        : ''
    }
  `;
    }

    if (paymentMethodEl) {
      paymentMethodEl.textContent = order.paymentIntentId
        ? `Stripe (${order.paymentIntentId.slice(0, 12)}...)`
        : 'Stripe';
    }

    /* ========= BLOCK INVALID ACTIONS ========= */
    if (paymentState === 'pending' || paymentState === 'failed') {
      statusSelect.disabled = true;
      updateBtn.disabled = true;

      result.textContent = 'Cannot change status — payment not completed';
      result.className = 'error';
    }

    /* ========= REFUND BUTTON ========= */
    if (refundBtn) {
      const allowRefund =
        paymentState === 'paid' &&
        order.status.toLowerCase() !== 'cancelled' &&
        order.status.toLowerCase() !== 'returned';

      refundBtn.style.display = allowRefund ? 'block' : 'none';
    }

    /* ========= STATUS SELECT ========= */
    statusSelect.innerHTML = '';

    const currentOption = document.createElement('option');
    currentOption.value = order.status;
    currentOption.textContent = order.status;
    currentOption.selected = true;
    currentOption.disabled = true;
    statusSelect.appendChild(currentOption);

    const allowed = getAllowedTransitions(order.status.toLowerCase());
    allowed.forEach((s) => {
      const option = document.createElement('option');
      option.value = s;
      option.textContent = getAdminLabel(s);
      statusSelect.appendChild(option);
    });

    /* ========= PRODUCTS ========= */
    productsTable.innerHTML = '';

    const items = order.items || [];

    if (!items.length) {
      productsTable.innerHTML = `<tr><td colspan="4">No products found</td></tr>`;
    } else {
      items.forEach((item) => {
        const qty = Number(item.quantity || 0);
        const price = Number(item.price || 0);

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${item.name}</td>
          <td>${qty}</td>
          <td>£${price.toFixed(2)}</td>
          <td>£${(qty * price).toFixed(2)}</td>
        `;
        productsTable.appendChild(tr);
      });
    }

    /* ========= HISTORY ========= */
    historyList.innerHTML = '';
    (order.statusHistory || []).forEach((h) => {
      const li = document.createElement('li');
      li.textContent = `${h.status} – ${new Date(h.date).toLocaleString()}`;
      historyList.appendChild(li);
    });

    /* ========= TIMER ========= */
    initRefundTimers();
  } catch (err) {
    console.error(err);
    result.textContent = 'Failed to load order';
    result.className = 'error';
  }
}

/* ================================
   TIMER
================================ */
function initRefundTimers() {
  const elements = document.querySelectorAll('.refund-badge');
  if (!elements.length) return;

  function update() {
    const now = Date.now();

    elements.forEach((el) => {
      const target = new Date(el.dataset.time).getTime();
      const timerEl = el.querySelector('.refund-timer');

      if (!timerEl) return;

      const diff = target - now;

      if (diff <= 0) {
        timerEl.textContent = ' • processing...';
        return;
      }

      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);

      timerEl.textContent = ` • ${h}h ${m}m ${s}s`;
    });
  }

  update();
  setInterval(update, 1000);
}

/* ================================
   INIT
================================ */
loadOrder();

updateBtn.addEventListener('click', async () => {
  const newStatus = statusSelect.value;

  if (!newStatus) return;

  try {
    updateBtn.disabled = true;
    updateBtn.textContent = 'Updating...';

    const res = await fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status: newStatus }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Update failed');
      return;
    }

    // reload fresh data
    loadOrder();
  } catch (err) {
    console.error(err);
    alert('Something went wrong');
  } finally {
    updateBtn.disabled = false;
    updateBtn.textContent = 'Update Status';
  }
});

startLiveUpdates(() => {
  loadOrder();
});
