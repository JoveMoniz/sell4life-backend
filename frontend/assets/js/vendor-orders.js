// ======================================================
// VENDOR ORDERS
// ======================================================

function authFetch(url, opts = {}) {
  const token = localStorage.getItem('s4l_token');
  const headers = { ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...opts, credentials: 'include', headers });
}

let currentStatus = 'all';
let currentQuery = '';
let timerInterval;

let lastOrders = [];
let lastVendorId = null;
let ordersPage = 1;
const ORDERS_PER_PAGE = 20;

/* ======================================================
   DISPLAY STATUS
====================================================== */
function getDisplayStatus(o) {
  const payment = (o.paymentStatus || '').toLowerCase();
  const status = o.status;

  if (payment === 'refunded') return `${status} • Refunded`;
  if (payment === 'partially_refunded') return `${status} • Partial Refund`;

  if (payment === 'refund_scheduled' && o.refundScheduledAt) {
    return `
      ${status} • Refund Scheduled
      <span class="refund-timer" data-time="${o.refundScheduledAt}"></span>
    `;
  }

  return status;
}

/* ======================================================
   RENDER ONE ORDER CARD
====================================================== */
function renderOrderCard(o, vendorId) {
  const id = o._id || o.id;
  if (!id) return '';

  const displayId = o.shortId || `S4L-${id.slice(0, 10).toUpperCase()}`;

  const vendorItems = (o.items || []).filter(
    (item) => String(item.vendorId) === String(vendorId)
  );

  const vendorTotal = vendorItems.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );

  const vendorOrder = (o.vendorOrders || []).find(
    (vo) => String(vo.vendorId) === String(vendorId)
  );

  const safeStatus = o.status || vendorOrder?.status || 'Unknown';
  const refundScheduledAt = vendorOrder?.refundScheduledAt || o.refundScheduledAt || null;

  const orderPayment = (o.paymentStatus || 'pending').toLowerCase();
  const vendorRefStatuses = vendorItems.map(i => i.refundStatus || 'none');
  const vendorHasReturnedItems = vendorItems.some(i =>
    ['returned', 'partially_returned'].includes(i.returnStatus)
  );
  const vendorPaymentStatus = !['paid', 'partially_refunded', 'refunded', 'refund_scheduled'].includes(orderPayment)
    ? orderPayment
    : vendorRefStatuses.every(s => s === 'processed')
      ? 'refunded'
      : vendorRefStatuses.some(s => ['processed', 'partially_refunded'].includes(s))
        ? 'partially_refunded'
        : (orderPayment === 'refund_scheduled' && vendorHasReturnedItems)
          ? 'refund_scheduled'
          : 'paid';

  const hasPendingActions = (o.allowedActions || []).some(
    a => ['Processing', 'Shipped', 'Delivered', 'Vendor Cancel',
          'Return Approved', 'Return Rejected', 'Returned', 'Cancel Approved'].includes(a.type)
  );

  return `
<div class="order-row">

  <div class="order-info">
    <a class="order-id" href="/account/vendor/order-details.html?id=${id}">
      ${displayId}
    </a>

    <div class="order-email">
      ${
        o.user?.email
          ? `<span class="email-link" data-email="${o.user.email}">
               ${o.user.email}
             </span>`
          : '-'
      }
    </div>
  </div>

  <span class="order-status">
    ${getDisplayStatus({
      ...o,
      status: safeStatus,
      refundScheduledAt,
      paymentStatus: vendorPaymentStatus,
    })}
  </span>

  <div class="order-actions">
    <a class="btn-view-order" href="/account/vendor/order-details.html?id=${id}">
      ${hasPendingActions ? 'Action needed →' : 'View Details →'}
    </a>
  </div>

  <span class="order-price">£${vendorTotal.toFixed(2)}</span>

</div>
`;
}

/* ======================================================
   RENDER PAGE
====================================================== */
function renderOrdersPage(page) {
  const container = document.getElementById('vendor-orders');
  if (!container) return;

  if (!lastOrders.length) {
    container.innerHTML = '<p>No orders yet</p>';
    renderOrdersPagination();
    return;
  }

  const start = (page - 1) * ORDERS_PER_PAGE;
  const end = start + ORDERS_PER_PAGE;
  container.innerHTML = lastOrders.slice(start, end)
    .map(o => renderOrderCard(o, lastVendorId))
    .join('');

  initRefundTimers();
  ordersPage = page;
  renderOrdersPagination();
}

/* ======================================================
   PAGINATION
====================================================== */
function renderOrdersPagination() {
  const container = document.getElementById('vendor-pagination');
  if (!container) return;

  const totalPages = Math.ceil(lastOrders.length / ORDERS_PER_PAGE);
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  const parts = [];
  parts.push(`<span class="orders-page-info">Page ${ordersPage} of ${totalPages}</span>`);

  const prev = ordersPage > 1;
  parts.push(`<button class="orders-pg-btn" data-pg="${ordersPage - 1}" ${prev ? '' : 'disabled'}>‹ Prev</button>`);

  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - ordersPage) <= 1) {
      parts.push(`<button class="orders-pg-btn ${p === ordersPage ? 'active' : ''}" data-pg="${p}">${p}</button>`);
    } else if (Math.abs(p - ordersPage) === 2) {
      parts.push(`<span class="orders-pg-ellipsis">…</span>`);
    }
  }

  const next = ordersPage < totalPages;
  parts.push(`<button class="orders-pg-btn" data-pg="${ordersPage + 1}" ${next ? '' : 'disabled'}>Next ›</button>`);

  container.innerHTML = parts.join('');
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.orders-pg-btn');
  if (!btn || btn.disabled) return;
  const pg = parseInt(btn.dataset.pg, 10);
  if (pg && pg !== ordersPage) {
    renderOrdersPage(pg);
    document.querySelector('.vendor-orders-list')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

/* ======================================================
   LOAD ORDERS
====================================================== */
async function loadVendorOrders(status = 'all', q = '') {
  const container = document.getElementById('vendor-orders');
  if (!container) return;

  container.innerHTML = '<p class="orders-loading">Loading orders...</p>';

  const vendorRes = await authFetch(`${API_BASE}/vendor/me`);

  if (!vendorRes.ok) {
    if (vendorRes.status === 401) {
      window.location.href = '/account/signin.html';
      return;
    }
    container.innerHTML = '<p>Failed to load vendor profile</p>';
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

  lastVendorId = vendor._id;

  try {
    let url = `${API_BASE}/vendor/orders`;

    const queryParams = [];
    if (status !== 'all') queryParams.push(`status=${status}`);
    if (q) queryParams.push(`q=${encodeURIComponent(q)}`);
    if (queryParams.length) url += `?${queryParams.join('&')}`;

    const res = await authFetch(url);

    if (!res.ok) {
      container.innerHTML = '<p>Failed to load orders</p>';
      return;
    }

    const data = await res.json();
    lastOrders = data.orders || [];
    ordersPage = 1;
    renderOrdersPage(1);

  } catch (err) {
    console.error(err);
    container.innerHTML = '<p>Could not load orders</p>';
  }
}

/* ======================================================
   REFUND TIMER
====================================================== */
function initRefundTimers() {
  const timers = document.querySelectorAll('.refund-timer');
  if (!timers.length) return;

  if (timerInterval) clearInterval(timerInterval);

  function update() {
    const now = Date.now();
    timers.forEach((el) => {
      const target = new Date(el.dataset.time).getTime();
      const diff = target - now;
      if (diff <= 0) {
        el.textContent = ' • processing...';
        return;
      }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      el.textContent = ` • ${h}h ${m}m ${s}s`;
    });
  }

  update();
  timerInterval = setInterval(update, 1000);
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
      loadVendorOrders(currentStatus, currentQuery);
    }, 400);
  } catch (err) {
    alert(err.message);
    btn.disabled = false;
    btn.textContent = label;
  }
});

/* ======================================================
   FILTER
====================================================== */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;

  currentStatus = btn.dataset.status;
  document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  loadVendorOrders(currentStatus, currentQuery);
});

/* ======================================================
   SEARCH
====================================================== */
const searchInput = document.getElementById('vendorOrderSearch');
let searchTimer;

if (searchInput) {
  searchInput.addEventListener('input', () => {
    let value = searchInput.value;

    if (!value) {
      currentQuery = '';
      loadVendorOrders(currentStatus, '');
      return;
    }

    currentQuery = value.toUpperCase().startsWith('S4L-') ? value.slice(4) : value;
    clearTimeout(searchTimer);
    if (currentQuery.length < 2) return;
    searchTimer = setTimeout(() => {
      loadVendorOrders(currentStatus, currentQuery);
    }, 200);
  });
}

/* ======================================================
   UPDATE STATUS
====================================================== */
async function updateStatus(orderId, itemId, status) {
  let url = '';
  let body = {};

  if (status === 'Return Approved') {
    if (!itemId) throw new Error('Missing return item');
    url = `${API_BASE}/vendor/orders/${orderId}/items/${itemId}/approve-return`;
    body = { quantity: 1 };
  } else if (status === 'Return Rejected') {
    if (!itemId) throw new Error('Missing return item');
    url = `${API_BASE}/vendor/orders/${orderId}/items/${itemId}/reject-return`;
    body = { reason: 'Rejected by vendor' };
  } else if (status === 'Returned') {
    if (!itemId) throw new Error('Missing return item');
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
   INIT
====================================================== */
loadVendorOrders();

startLiveUpdates(() => {
  loadVendorOrders(currentStatus, currentQuery);
});
