// =====================================================
// Order Details (User View + FULL FLOW SUPPORT)
// CLEAN + LIVE UPDATE SAFE
// =====================================================

console.log('orders-details.js running');

const API = window.API_BASE || '';

function formatHistoryStatus(status) {
  const map = {
    'Cancel Requested': 'Cancel requested',
    'Return Requested': 'Return requested',
    'Return Approved': 'Return approved ✅',
    'Return Rejected': 'Return rejected ❌',
    Returned: 'Item returned',
    Cancelled: 'Order cancelled',
    Refunded: 'Refund issued 💸',
  };

  return map[status] || status;
}

/* ======================================================
   FULL LOAD (ONLY RUN ONCE)
====================================================== */

async function loadOrderDetails() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('id');

  const container = document.getElementById('order-details');
  const loading = document.getElementById('order-loading');

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
    const res = await fetch(`${API}/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const order = await res.json();

    loading.style.display = 'none';

    const id = order.id || order._id;
    const displayId = order.shortId || `S4L-${id.slice(0, 10).toUpperCase()}`;
    const items = Array.isArray(order.items) ? order.items : [];

    const itemsHTML = items
      .map((item) => {
        const qty = Number(item.quantity ?? 1);
        const price = Number(item.price ?? 0);
        const line = qty * price;

        const img =
          typeof item.image === 'string'
            ? item.image
            : '/assets/images/products/sell4life-placeholder.png';

        return `
          <div class="order-item">
            <img class="order-thumb"
              src="${img}"
              alt="${item.name || 'Product'}"
              onerror="this.src='/assets/images/products/sell4life-placeholder.png'">

            <div class="order-info">
              <div class="order-name">${item.name || 'Unnamed product'}</div>
              <div class="order-qty">${qty} × £${price.toFixed(2)}</div>
            </div>

            <div class="order-line-price">
              £${line.toFixed(2)}
            </div>
          </div>
        `;
      })
      .join('');

    const paymentStatus = order.paymentStatus || 'pending';

    const paymentLabel =
      paymentStatus === 'paid'
        ? 'Paid'
        : paymentStatus === 'refund_scheduled'
          ? 'Refund Scheduled'
          : paymentStatus === 'refunded'
            ? 'Refunded'
            : paymentStatus === 'failed'
              ? 'Failed'
              : 'Unpaid';

    container.innerHTML = `
      <h2 class="order-id">${displayId}</h2>

      <p>
        Fulfillment:
        <strong class="order-status">${order.status || '—'}</strong>
      </p>

      <p>
        Payment:
        <strong class="payment-status ${paymentStatus}">
          ${paymentLabel}
        </strong>
      </p>

      <p>
        Date: ${order.createdAt ? new Date(order.createdAt).toLocaleString() : '—'}
      </p>

      <div class="order-history">
  <h4>Order activity</h4>
  <ul class="order-history-list">
    ${
      Array.isArray(order.statusHistory)
        ? order.statusHistory
            .slice()
            .reverse()
            .map(
              (h) => `
        <li>
          <span class="history-label">
            ${formatHistoryStatus(h.status)}
          </span>
          <span class="history-date">
            ${new Date(h.date).toLocaleString()}
          </span>
        </li>
      `
            )
            .join('')
        : ''
    }
  </ul>
</div>

      <div class="order-items">
        ${itemsHTML || '<p>No items found.</p>'}
      </div>

      <div class="order-actions">
        <button id="requestCancelBtn" style="display:none">Request Cancel</button>
        <button id="requestReturnBtn" style="display:none">Request Return</button>
        <button id="requestRefundBtn" style="display:none">Request Refund</button>
      </div>

      <div class="order-total">
        <h3>£${Number(order.total ?? 0).toFixed(2)}</h3>
      </div>
    `;

    setupButtons(order, id, token);
  } catch (err) {
    console.error('ORDER DETAILS ERROR:', err);
    loading.textContent = 'Failed to load order.';
  }
}

/* ======================================================
   BUTTON SETUP (ONLY ON FULL LOAD)
====================================================== */

function setupButtons(order, id, token) {
  const requestCancelBtn = document.getElementById('requestCancelBtn');
  const requestReturnBtn = document.getElementById('requestReturnBtn');
  const requestRefundBtn = document.getElementById('requestRefundBtn');

  const status = (order.status || '').toLowerCase();
  const paymentStatus = order.paymentStatus;

  if (requestCancelBtn && ['pending', 'processing'].includes(status)) {
    requestCancelBtn.style.display = 'inline-block';

    requestCancelBtn.onclick = async () => {
      if (!confirm('Request cancellation for this order?')) return;

      const res = await fetch(`${API}/orders/${id}/request-cancel`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Cancel request failed');
        return;
      }

      location.reload();
    };
  }

  const alreadyRequestedReturn = (order.statusHistory || []).some(
    (h) => h.status === 'Return Requested'
  );

  if (requestReturnBtn && status === 'delivered' && !alreadyRequestedReturn) {
    requestReturnBtn.style.display = 'inline-block';

    requestReturnBtn.onclick = async () => {
      if (!confirm('Request return for this order?')) return;

      const res = await fetch(`${API}/orders/${id}/request-return`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Return request failed');
        return;
      }

      location.reload();
    };
  }

  if (
    requestRefundBtn &&
    ['cancelled', 'returned'].includes(status) &&
    !['refund_scheduled', 'refunded'].includes(paymentStatus)
  ) {
    requestRefundBtn.style.display = 'inline-block';

    requestRefundBtn.onclick = async () => {
      if (!confirm('Request refund for this order?')) return;

      const res = await fetch(`${API}/orders/${id}/request-refund`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      const data = await res.json();

      if (!res.ok) {
        alert(data.error || 'Refund request failed');
        return;
      }

      location.reload();
    };
  }
}

/* ======================================================
   LIVE UPDATE (SAFE - NO REBUILD)
====================================================== */

async function refreshOrderStatus() {
  const params = new URLSearchParams(window.location.search);
  const orderId = params.get('id');
  const token = localStorage.getItem('s4l_token');

  if (!orderId || !token) return;

  try {
    const res = await fetch(`${API}/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return;

    const order = await res.json();

    const statusEl = document.querySelector('.order-status');
    const paymentEl = document.querySelector('.payment-status');

    if (statusEl) {
      statusEl.textContent = order.status;
    }

    if (paymentEl) {
      const payment = (order.paymentStatus || '').toLowerCase();

      const label =
        payment === 'paid'
          ? 'Paid'
          : payment === 'refund_scheduled'
            ? 'Refund Scheduled'
            : payment === 'refunded'
              ? 'Refunded'
              : payment === 'failed'
                ? 'Failed'
                : 'Unpaid';

      paymentEl.textContent = label;
      paymentEl.className = `payment-status ${payment}`;
    }
  } catch (err) {
    console.error('Live update failed:', err);
  }
}

/* ======================================================
   INIT
====================================================== */

loadOrderDetails();

startLiveUpdates(() => {
  loadOrderDetails();
});
