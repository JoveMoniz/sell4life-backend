// =====================================================
// Order Details (User View + Payment Status Support)
// =====================================================

console.log('orders-details.js running');

const API = window.API_BASE || '';

async function initOrderDetails() {
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

            <img
              class="order-thumb"
              src="${img}"
              alt="${item.name || 'Product'}"
              onerror="this.src='/assets/images/products/sell4life-placeholder.png'"
            >

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

    // ================================
    // Payment Status
    // ================================

    const paymentStatus = order.paymentStatus || 'pending';

    const paymentLabel =
      paymentStatus === 'paid'
        ? 'Paid'
        : paymentStatus === 'failed'
          ? 'Failed'
          : paymentStatus === 'refunded'
            ? 'Refunded'
            : 'Unpaid';

    container.innerHTML = `
      <h2 class="order-id">${displayId}</h2>

      <p>
        Fulfillment: <strong>${order.status || '—'}</strong>
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

      <div class="order-items">
  ${itemsHTML || '<p>No items found.</p>'}
</div>

<div class="order-actions">
  <button id="requestCancelBtn" style="display:none">
    Request Cancel
  </button>

  <button id="requestRefundBtn" style="display:none">
    Request Refund
  </button>
</div>

<div class="order-total">
  <h3>£${Number(order.total ?? 0).toFixed(2)}</h3>
</div>
    `; // =================================
    // GET BUTTONS AFTER RENDER
    // =================================

    const requestCancelBtn = document.getElementById('requestCancelBtn');
    const requestRefundBtn = document.getElementById('requestRefundBtn');

    const status = (order.status || '').toLowerCase();

    // =================================
    // SHOW BUTTONS
    // =================================

    if (requestCancelBtn && ['pending', 'processing'].includes(status)) {
      requestCancelBtn.style.display = 'inline-block';
    }
    if (requestRefundBtn && status === 'delivered') {
      requestRefundBtn.style.display = 'inline-block';
    }

    // =================================
    // CANCEL REQUEST
    // =================================

    if (requestCancelBtn) {
      requestCancelBtn.addEventListener('click', async () => {
        if (!confirm('Request cancellation for this order?')) return;

        try {
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
        } catch (err) {
          console.error(err);
          alert('Cancel request failed');
        }
      });
    }

    // =================================
    // REFUND REQUEST
    // =================================

    if (requestRefundBtn) {
      requestRefundBtn.addEventListener('click', async () => {
        if (!confirm('Request refund for this order?')) return;

        try {
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
        } catch (err) {
          console.error(err);
          alert('Refund request failed');
        }
      });
    }
  } catch (err) {
    console.error('ORDER DETAILS ERROR:', err);

    loading.textContent = 'Failed to load order.';
  }
}

initOrderDetails();
