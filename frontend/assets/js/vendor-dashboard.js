// =====================================================
// SELL4LIFE – VENDOR DASHBOARD (CLEAN + ACTION ENABLED)
// =====================================================

console.log('vendor dashboard loaded');

/* ======================================================
   AUTH FETCH — cookie + Authorization header (fallback)
====================================================== */
function authFetch(url, opts = {}) {
  const token = localStorage.getItem('s4l_token');
  const headers = { ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...opts, credentials: 'include', headers });
}

/* ======================================================
   DISPLAY STATUSP
====================================================== */
function getDisplayStatus(order) {
  const payment = (order.paymentStatus || '').toLowerCase();
  const status = order.status;

  if (payment === 'refunded') {
    return `${status} • Refunded`;
  }

  if (payment === 'refund_scheduled') {
    return `${status} • Refund Scheduled`;
  }

  return status;
}

/* ======================================================
   LOAD DASHBOARD STATS
====================================================== */
let currentPeriod = 'all';

async function loadVendorDashboard(period = currentPeriod) {
  try {
    const url = period && period !== 'all'
      ? `${API_BASE}/vendor/dashboard?period=${period}`
      : `${API_BASE}/vendor/dashboard`;

    const res = await authFetch(url);

    if (!res.ok) throw new Error('Dashboard API error');

    const data = await res.json();

    document.getElementById('stat-products').textContent = data.products || 0;
    document.getElementById('stat-orders').textContent = data.totalOrders || 0;
    document.getElementById('stat-revenue').textContent =
      '£' + Number(data.grossRevenue || 0).toFixed(2);
    document.getElementById('stat-loss').textContent =
      '£' + Number(data.revenueLoss || 0).toFixed(2);
    document.getElementById('stat-net').textContent = '£' + Number(data.netRevenue || 0).toFixed(2);
    document.getElementById('stat-active').textContent = data.activeOrders || 0;
    document.getElementById('stat-completed').textContent = data.completedOrders || 0;
    document.getElementById('stat-refunded').textContent = data.refundedItems || 0;
  } catch (err) {
    console.error('Vendor dashboard load error:', err);
  }
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.period-btn');
  if (!btn) return;

  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  currentPeriod = btn.dataset.period;
  loadVendorDashboard(currentPeriod);
});

/* ======================================================
   LOAD RECENT ORDERS
====================================================== */
async function loadRecentOrders() {
  const container = document.getElementById('recent-orders');

  if (!container) return;

  try {
    const vendorRes = await authFetch(`${API_BASE}/vendor/me`);

    if (!vendorRes.ok) {
      container.innerHTML = '<p>Vendor not found</p>';
      return;
    }

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

    if (!vendorId) {
      container.innerHTML = '<p>Vendor not initialized</p>';
      return;
    }

    const res = await authFetch(`${API_BASE}/vendor/orders`);

    if (!res.ok) {
      container.innerHTML = '<p>Failed to load orders</p>';
      return;
    }

    const data = await res.json();
    const orders = data.orders || [];

    if (!orders.length) {
      container.innerHTML = '<p>No orders yet</p>';
      return;
    }

    const latest = orders.slice(0, 5);

    container.innerHTML = latest
      .map((o) => {
        const id = o._id || o.id;
        const displayId = o.shortId || `S4L-${id.slice(0, 10).toUpperCase()}`;

        const vendorTotal = (o.items || [])
          .filter((item) => String(item.vendorId) === String(vendorId))
          .reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);

        const vendorOrder = (o.vendorOrders || []).find(
          (vo) => String(vo.vendorId) === String(vendorId)
        );

        const vendorStatus = o.status || vendorOrder?.status || 'Unknown';
        const vendorRefundScheduledAt =
          vendorOrder?.refundScheduledAt || o.refundScheduledAt || null;

        const hasPendingActions = (o.allowedActions || []).some(
          a => ['Processing', 'Shipped', 'Delivered', 'Vendor Cancel',
                'Return Approved', 'Return Rejected', 'Returned', 'Cancel Approved'].includes(a.type)
        );

        return `
<div class="order-row">
  <a class="order-id" href="/account/vendor/order-details.html?id=${id}">${displayId}</a>
  <span class="order-status">
    ${getDisplayStatus({ ...o, status: vendorStatus, refundScheduledAt: vendorRefundScheduledAt })}
    ${
      o.paymentStatus === 'refund_scheduled' && vendorRefundScheduledAt
        ? `<span class="refund-badge" data-time="${vendorRefundScheduledAt}"><span class="refund-timer"></span></span>`
        : ''
    }
  </span>
  <a class="btn-view-order" href="/account/vendor/order-details.html?id=${id}">
    ${hasPendingActions ? 'Action needed →' : 'View →'}
  </a>
  <span class="order-price">£${vendorTotal.toFixed(2)}</span>
</div>`;
      })
      .join('');

    initRefundTimers();
  } catch (err) {
    console.error('Recent orders load error:', err);
    container.innerHTML = '<p>Could not load orders</p>';
  }
}

/* ======================================================
   UPDATE STATUS
====================================================== */
async function updateStatus(orderId, itemId, status) {
  let url = '';
  let body = {};

  if (status === 'Return Approved') {
    url = `${API_BASE}/vendor/orders/${orderId}/items/${itemId}/approve-return`;
    body = { quantity: 1 };
  } else if (status === 'Return Rejected') {
    url = `${API_BASE}/vendor/orders/${orderId}/items/${itemId}/reject-return`;
    body = { reason: 'Rejected by vendor' };
  } else if (status === 'Returned') {
    url = `${API_BASE}/vendor/orders/${orderId}/items/${itemId}/mark-returned`;
    body = { quantity: 1, condition: 'used' };
  } else {
    url = `${API_BASE}/vendor/orders/${orderId}/status`;
    body = { status };
  }

  const res = await authFetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Update failed');
  }
}

/* ======================================================
   ACTION HANDLER
====================================================== */
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-id]');
  if (!btn) return;

  const id = btn.dataset.id;
  const itemId = btn.dataset.item;
  const label = btn.dataset.label;

  if (!id || !label) return;

  try {
    btn.disabled = true;
    btn.textContent = 'Updating...';

    await updateStatus(id, itemId, label);

    setTimeout(() => {
      loadRecentOrders();
    }, 400);
  } catch (err) {
    showToast(err.message, 'error');
    btn.disabled = false;
    btn.textContent = label;
  }
});

/* ======================================================
   REFUND TIMER
====================================================== */
function initRefundTimers() {
  const elements = document.querySelectorAll('.refund-badge');
  if (!elements.length) return;

  function updateTimers() {
    const now = Date.now();

    elements.forEach((el) => {
      const target = new Date(el.dataset.time).getTime();
      const timerEl = el.querySelector('.refund-timer');

      if (!timerEl) return;

      const diff = target - now;

      if (diff <= 0) {
        timerEl.textContent = ' • refunding...';
        return;
      }

      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);

      timerEl.textContent = ` • ${h}h ${m}m ${s}s`;
    });
  }

  updateTimers();
  setInterval(updateTimers, 1000);
}

/* ======================================================
   INIT
====================================================== */
loadVendorDashboard();
loadRecentOrders();

startLiveUpdates(() => {
  loadVendorDashboard(currentPeriod);
  loadRecentOrders();
});
