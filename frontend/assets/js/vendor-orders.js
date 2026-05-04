// ======================================================
// VENDOR ORDERS (CLEAN + ALIGNED + FIXED DISPLAY)
// ======================================================

console.log('vendor orders loaded');

let currentStatus = 'all';
let currentQuery = '';

let timerInterval; // 🔥 prevent multiple intervals

/* ======================================================
   DISPLAY STATUS (WITH TIMER SUPPORT)
====================================================== */
function getDisplayStatus(o) {
  const payment = (o.paymentStatus || '').toLowerCase();
  const status = o.status;

  if (payment === 'refunded') {
    return `${status} • Refunded`;
  }

  if (payment === 'refund_scheduled' && o.refundScheduledAt) {
    return `
      ${status} • Refund Scheduled
      <span class="refund-timer" data-time="${o.refundScheduledAt}"></span>
    `;
  }

  return status;
}

/* ======================================================
   SHARED STATUS LOGIC (FRONTEND MIRROR)
====================================================== */
function getAllowedTransitions(status) {
  if (!status) return [];

  const map = {
    Pending: ['Processing'],
    Processing: ['Shipped'],
    Shipped: ['Delivered'],
    'Return Requested': ['Return Approved'],
    'Return Approved': ['Returned'],
    'Cancel Requested': ['Cancelled'],
    Cancelled: [],
    Returned: [],
  };

  return map[status] || [];
}

/* ======================================================
   LOAD ORDERS
====================================================== */
async function loadVendorOrders(status = 'all', q = '', page = 1) {
  const container = document.getElementById('vendor-orders');
  const token = localStorage.getItem('s4l_token');

  if (!container || !token) return;

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

  try {
    let url = `${API_BASE}/vendor/orders`;

    const params = [];
    if (status !== 'all') params.push(`status=${status}`);
    if (q) params.push(`q=${encodeURIComponent(q)}`);
    params.push(`page=${page}`);

    if (params.length) url += `?${params.join('&')}`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      container.innerHTML = '<p>Failed to load orders</p>';
      return;
    }

    const data = await res.json();

    const orders = data.orders || [];
    const currentPage = data.page || 1;
    const totalPages = data.totalPages || 1;

    if (!orders.length) {
      container.innerHTML = '<p>No orders yet</p>';
      renderPagination(currentPage, totalPages);
      return;
    }

    // 🔥 RENDER FIRST
    container.innerHTML = orders
      .map((o) => {
        const id = o._id || o.id;

        if (!id) {
          console.error('BROKEN ORDER:', o);
          return '';
        }

        const displayId = o.shortId || `S4L-${id.slice(0, 10).toUpperCase()}`;

        const vendorTotal = (o.items || [])
          .filter((item) => String(item.vendorId) === String(vendorId))
          .reduce((sum, item) => sum + Number(item.price) * Number(item.quantity), 0);

        const safeStatus = o.status || 'Unknown';

        const isRefundLocked = o.refundScheduledAt && new Date(o.refundScheduledAt) > new Date();

        const allowed =
          o.paymentStatus === 'paid' && !isRefundLocked ? getAllowedTransitions(safeStatus) : [];

        const buttons = allowed
          .map((s) => {
            const map = {
              Processing: 'btn-process',
              Shipped: 'btn-ship',
              Delivered: 'btn-deliver',
              'Return Approved': 'btn-approve-return',
              Returned: 'btn-mark-returned',
              Cancelled: 'btn-approve-cancel',
            };

            const labelMap = {
              Processing: 'Start Processing',
              Shipped: 'Mark Shipped',
              Delivered: 'Mark Delivered',
              'Return Approved': 'Approve Return',
              Returned: 'Mark Returned',
              Cancelled: 'Approve Cancel',
            };

            const cls = map[s] || '';

            return `
              <button class="${cls}" data-id="${id}" data-label="${s}">
                ${labelMap[s] || s}
              </button>
            `;
          })
          .join('');

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
    ${getDisplayStatus(o)}
  </span>

  <div class="order-actions">
    ${buttons}
  </div>

  <span class="order-price">£${vendorTotal.toFixed(2)}</span>

</div>
`;
      })
      .join('');

    // 🔥 THEN START TIMER (CORRECT PLACE)
    initRefundTimers();

    renderPagination(currentPage, totalPages);
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p>Could not load orders</p>';
  }
}

/* ======================================================
   REFUND TIMER (SAFE SINGLE INSTANCE)
====================================================== */
function initRefundTimers() {
  const timers = document.querySelectorAll('.refund-timer');
  if (!timers.length) return;

  // 🔥 prevent stacking intervals
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
  const label = btn.dataset.label;

  if (!id || !label) return;

  try {
    btn.disabled = true;
    btn.textContent = 'Updating...';

    await updateStatus(id, label);

    setTimeout(() => {
      loadVendorOrders(currentStatus, currentQuery, 1);
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

  loadVendorOrders(currentStatus, currentQuery, 1);
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
      loadVendorOrders(currentStatus, '', 1);
      return;
    }

    currentQuery = value.toUpperCase().startsWith('S4L-') ? value.slice(4) : value;

    clearTimeout(searchTimer);

    if (currentQuery.length < 2) return;

    searchTimer = setTimeout(() => {
      loadVendorOrders(currentStatus, currentQuery, 1);
    }, 200);
  });
}

/* ======================================================
   UPDATE STATUS
====================================================== */
async function updateStatus(id, status) {
  const token = localStorage.getItem('s4l_token');

  const res = await fetch(`${API_BASE}/vendor/orders/${id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Update failed');
  }
}

/* ======================================================
   PAGINATION
====================================================== */
function renderPagination(currentPage, totalPages) {
  const container = document.getElementById('vendor-pagination');
  if (!container) return;

  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';

  if (currentPage > 1) {
    html += `<button data-page="${currentPage - 1}">←</button>`;
  }

  for (let i = 1; i <= totalPages; i++) {
    html += `
      <button data-page="${i}" class="${i === currentPage ? 'active' : ''}">
        ${i}
      </button>
    `;
  }

  if (currentPage < totalPages) {
    html += `<button data-page="${currentPage + 1}">→</button>`;
  }

  container.innerHTML = html;
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-page]');
  if (!btn) return;

  loadVendorOrders(currentStatus, currentQuery, Number(btn.dataset.page));
});

/* ======================================================
   INIT
====================================================== */
loadVendorOrders();

startLiveUpdates(() => {
  loadVendorOrders(currentStatus, currentQuery, 1);
});
