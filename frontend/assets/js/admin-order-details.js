import { API_BASE } from './config.js';

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

/* ================================
   STATE
================================ */
let currentOrder = null;

/* ================================
   STATUS TRANSITIONS (SINGLE SOURCE)
================================ */
function getAllowedTransitions(status) {
  const map = {
    pending: ['Processing', 'Cancelled'],
    processing: ['Shipped', 'Cancelled'],
    shipped: ['Delivered'],
    delivered: ['Return Requested', 'Refund Requested'],
    'return requested': ['Return Approved', 'Cancelled'],
    'return approved': ['Returned'],
    returned: ['Cancelled'], // refund comes after this
    cancelled: [],
  };

  return map[status] || [];
}

const FINAL_STATES = ['refunded'];
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

    /* ========= SUMMARY ========= */
    document.getElementById('orderId').textContent = order.shortId;
    document.getElementById('orderId').textContent = order.shortId
      ? order.shortId
      : `S4L-${order.id.slice(0, 10).toUpperCase()}`;
    document.getElementById('orderUser').textContent = order.user?.email || '-';

    document.getElementById('orderDate').textContent = new Date(order.createdAt).toLocaleString();

    document.getElementById('orderTotal').textContent = Number(order.total).toFixed(2);

    document.getElementById('orderStatus').textContent = order.status;

    /* ========= PAYMENT ========= */
    const paymentStatusEl = document.getElementById('paymentStatus');
    const paymentMethodEl = document.getElementById('paymentMethod');

    const paymentState = order.paymentStatus || 'pending';

    /* ========= BLOCK FULFILLMENT IF PAYMENT NOT PAID ========= */
    if (paymentState !== 'paid') {
      statusSelect.disabled = true;
      updateBtn.disabled = true;

      result.textContent = 'Cannot change status — payment not completed';
      result.className = 'error';
    }

    /* ========= PAYMENT LABEL ========= */
    let paymentLabel =
      paymentState === 'paid'
        ? 'Paid'
        : paymentState === 'failed'
          ? 'Failed'
          : paymentState === 'refunded'
            ? 'Refunded'
            : 'Unpaid';

    if (paymentStatusEl) {
      paymentStatusEl.textContent = paymentLabel;
      paymentStatusEl.className = `payment-status ${paymentState}`;
    }

    /* ========= STATUS SELECT (INLINE-MATCHED) ========= */
    const backendStatus = order.status; // "Processing"
    const currentStatus = backendStatus.toLowerCase();
    const isFinal = FINAL_STATES.includes(currentStatus);

    let withinReturnWindow = false;

    if (order.deliveredAt) {
      const deliveredAt = new Date(order.deliveredAt);
      const now = new Date();

      const diffDays = (now - deliveredAt) / (1000 * 60 * 60 * 24);

      withinReturnWindow = diffDays <= 30;
    }

    /* ========= REFUND BUTTON ========= */
    if (refundBtn) {
      const allowRefund = paymentState === 'paid';

      refundBtn.style.display = allowRefund ? 'block' : 'none';
    }

    if (paymentMethodEl) {
      paymentMethodEl.textContent = order.paymentIntentId
        ? `Stripe (${order.paymentIntentId.slice(0, 12)}...)`
        : 'Stripe';
    }

    statusSelect.innerHTML = '';

    // Always show current state (selected, disabled)
    const currentOption = document.createElement('option');
    currentOption.value = backendStatus;
    currentOption.textContent = backendStatus;
    currentOption.selected = true;
    currentOption.disabled = true;
    statusSelect.appendChild(currentOption);

    const allowedStatuses = getAllowedTransitions(currentStatus);
    allowedStatuses.forEach((status) => {
      const option = document.createElement('option');
      option.value = status;
      option.textContent = status;
      statusSelect.appendChild(option);
    });

    statusSelect.disabled = isFinal || paymentState !== 'paid';
    updateBtn.disabled = isFinal || paymentState !== 'paid';

    if (isFinal) {
      result.textContent = 'Final state – no further changes';
      result.className = 'info';
    } else {
      result.textContent = '';
    }

    /* ========= PRODUCTS ========= */
    productsTable.innerHTML = '';

    const items = order.items || order.products || [];

    if (!items.length) {
      productsTable.innerHTML = `
        <tr>
          <td colspan="4" style="text-align:center; opacity:.6">
            No products found
          </td>
        </tr>
      `;
    } else {
      items.forEach((item) => {
        const qty = Number(item.quantity || 0);
        const price = Number(item.price || 0);

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td class="product-cell">
            <img
               src="${item.image || '/assets/images/products/sell4life-placeholder.png'}"
  alt="${item.name}"
  width="60"
  height="60"
  onerror="this.onerror=null;this.src='/assets/images/products/sell4life-placeholder.png';"
              class="product-thumb"
            />
            <span class="product-name">${item.name}</span>
          </td>
          <td>${qty}</td>
          <td>£${price.toFixed(2)}</td>
          <td>£${(qty * price).toFixed(2)}</td>
        `;
        productsTable.appendChild(tr);
      });
    }

    /* ========= STATUS HISTORY ========= */
    historyList.innerHTML = '';
    (order.statusHistory || []).forEach((h) => {
      const li = document.createElement('li');
      li.textContent = `${h.status} – ${new Date(h.date).toLocaleString()}`;
      historyList.appendChild(li);
    });
  } catch (err) {
    console.error(err);
    result.textContent = 'Failed to load order';
    result.className = 'error';
  }
}

/* ================================
   UPDATE STATUS
================================ */
updateBtn.addEventListener('click', async () => {
  if (!currentOrder) return;

  const newStatus = statusSelect.value;

  if (newStatus === currentOrder.status) {
    result.textContent = 'Already in this state';
    result.className = 'info';
    return;
  }

  updateBtn.disabled = true;
  updateBtn.textContent = 'Updating…';
  result.textContent = '';

  try {
    const newStatus = statusSelect.value;

    const res = await fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status: newStatus }),
    });

    if (!res.ok) throw new Error('Update failed');

    await loadOrder();

    const normalized = newStatus.toLowerCase();

    if (!FINAL_STATES.includes(normalized)) {
      result.textContent = 'Status updated';
      result.className = 'success';
    }
  } catch (err) {
    console.error(err);
    result.textContent = 'Error updating status';
    result.className = 'error';
  } finally {
    updateBtn.textContent = 'Update Status';
  }
});

/* ================================
   REFUND MODAL LOGIC
================================ */

document.addEventListener('DOMContentLoaded', () => {
  const modal = document.getElementById('refundModal');
  const amountLabel = document.getElementById('refundAmount');
  const cancelBtn = document.getElementById('cancelRefund');
  const confirmBtn = document.getElementById('confirmRefund');

  if (!modal) {
    console.error('Modal not found');
  } // --------------------------------

  document.addEventListener('click', (e) => {
    const refundClick = e.target.closest('#refundBtn');

    // ===============================
    // REFUND CLICK
    // ===============================
    if (refundClick) {
      e.stopPropagation();

      if (!currentOrder) return;

      let warning = '';

      switch (currentOrder.status) {
        case 'Pending':
          warning = '⚠ Order not processed yet.';
          break;
        case 'Processing':
          warning = '⚠ Order not shipped yet.';
          break;
        case 'Shipped':
          warning = '⚠ Order is in transit.';
          break;
        case 'Delivered':
          warning = 'Refunding a delivered order.';
          break;
        case 'Cancelled':
          warning = '⚠ Order already cancelled. Possible duplicate refund.';
          break;
        default:
          warning = '⚠ Check order state before refund.';

        case 'Return Requested':
          warning = '⚠ Customer requested return. Item not received yet.';
          break;

        case 'Return Approved':
          warning = '⚠ Return approved but item not yet received.';
          break;

        case 'Returned':
          warning = 'Item received back. Safe to refund.';
          break;
      }

      const ok = confirm(
        `${warning}\n\nRefund this order?\n\nThis will return money to the customer.`
      );

      if (!ok) return;

      amountLabel.textContent = `£${Number(currentOrder.total).toFixed(2)}`;
      modal.style.display = 'flex';
    }
  });

  /* CLOSE MODAL */

  cancelBtn.onclick = () => {
    modal.style.display = 'none';
  };

  /* CONFIRM REFUND */

  confirmBtn.onclick = async () => {
    modal.style.display = 'none';

    refundBtn.disabled = true;
    refundBtn.textContent = 'Refunding...';

    try {
      const res = await fetch(`${API_BASE}/admin/orders/${orderId}/refund`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();

      if (!res.ok) {
        result.textContent = data.error || 'Refund failed';
        result.className = 'error';
        return;
      }

      await loadOrder();

      result.textContent = 'Payment refunded';
      result.className = 'success';
    } catch (err) {
      console.error(err);
      result.textContent = 'Refund failed';
      result.className = 'error';
    } finally {
      refundBtn.textContent = 'Refund Payment';
      refundBtn.disabled = false;
    }
  };
});

/* ================================
   INIT
================================ */
loadOrder();
