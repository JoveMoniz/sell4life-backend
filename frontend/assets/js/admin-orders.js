const API = window.API_BASE;

/* =================================
   AUTH FETCH — cookie + Authorization header (fallback)
================================= */
function authFetch(url, opts = {}) {
  const token = localStorage.getItem('s4l_token');
  const headers = { ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...opts, credentials: 'include', headers });
}

/* =================================
   STATE
================================= */
let currentPage = 1;
let currentQuery = '';
let currentStatus = 'all';

let searchInput;
let searchTimer;
let searchController;

/* =================================
   HELPERS
================================= */

function getAdminLabel(status) {
  const labels = {
    Cancelled: 'Force Cancel',

    'Return Approved': 'Override Approve Return',

    'Return Rejected': 'Override Reject Return',
  };

  return labels[status] || status;
}

/* =================================
   SEARCH HANDLER (ONLY ONE SOURCE)
================================= */
function attachSearchHandlers() {
  searchInput.addEventListener('input', (e) => {
    let raw = e.target.value;

    const isEmail = /[a-z]/i.test(raw);

    if (isEmail) {
      currentQuery = raw.replace(/^S4L-/i, '');
    } else {
      // ID MODE — auto-prefix with S4L-
      let clean = raw.replace(/^S4L-/i, '').toUpperCase();
      currentQuery = clean;

      const cursorPos = searchInput.selectionStart;
      const newValue = clean ? `S4L-${clean}` : '';
      searchInput.value = newValue;
      const offset = newValue.length - raw.length;
      searchInput.setSelectionRange(cursorPos + offset, cursorPos + offset);
    }

    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentPage = 1;
      loadOrders(1, currentQuery, currentStatus);
    }, 300);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(searchTimer);
      currentPage = 1;
      loadOrders(1, currentQuery, currentStatus);
    }
  });
}

/* =================================
   LOAD ORDERS
================================= */
async function loadOrders(page = 1, q = '', status = 'all') {
  if (searchController) searchController.abort();
  searchController = new AbortController();

  let url = `${API}/admin/orders?page=${page}`;
  if (q) url += `&q=${encodeURIComponent(q)}`;
  if (status !== 'all') url += `&status=${status}`;

  const tbody = document.getElementById('ordersTable');
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#6b7280">Loading…</td></tr>';

  try {
    const res = await authFetch(url, { signal: searchController.signal });

    if (res.status === 401 || res.status === 403) {
      window.location.href = '/account/admin/signin.html';
      return;
    }

    const data = await res.json();
    tbody.innerHTML = '';

  data.orders.forEach((order) => {
    const tr = document.createElement('tr');
    tr.dataset.order = JSON.stringify(order);

    const paymentStatus = order.paymentStatus || 'pending';

    const paymentLabelMap = {
      paid: 'Paid',
      refund_scheduled: 'Refund Scheduled',
      refunded: 'Refunded',
      partially_refunded: 'Partially Refunded',
      failed: 'Failed',
    };

    const paymentLabel = paymentLabelMap[paymentStatus] || 'Unpaid';

    const realId = order._id;

    let displayId =
      order.displayId ||
      (order.shortId
        ? `S4L-${order.shortId}`
        : `S4L-${(order._id || order.id).slice(0, 10).toUpperCase()}`);

    const cleanId = displayId.replace('S4L-', '');

    const activeDisputes = (order.disputes || []).filter(d =>
      d.status !== 'won' && d.status !== 'charge_refunded' && d.status !== 'warning_closed'
    );
    const disputeBadge = activeDisputes.length
      ? `<span class="dispute-badge" title="Chargeback: ${activeDisputes[0].status}">⚠ dispute</span>`
      : '';

    tr.innerHTML = `
<td>
  <button class="quick-search-id" data-id="${cleanId}">
    ${displayId}
  </button>
  ${disputeBadge}
</td>

<td>
  ${
    order.user?.email
      ? `<button class="quick-search-email" data-email="${order.user.email}">
           ${order.user.email}
         </button>`
      : '-'
  }
</td>

<td>£${Number(order.total || 0).toFixed(2)}</td>

<td>
  <span class="status status-${order.status.toLowerCase()}">
    ${order.status}
  </span>
</td>

<td>
  <span class="payment-status ${paymentStatus}">
    ${paymentLabel}
  </span>
</td>

<td>${new Date(order.createdAt).toLocaleString()}</td>

<td>
  <button class="view-order" data-id="${realId}">
    View
  </button>
</td>
`;

    tbody.appendChild(tr);
  });

    renderPagination(data.page, data.totalPages);
  } catch (err) {
    if (err.name === 'AbortError') return;
    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:24px;color:#e53e3e">Failed to load orders.</td></tr>';
  }
}

/* =================================
   PAGINATION
================================= */
function renderPagination(current, total) {
  const container = document.getElementById('pagination');
  container.innerHTML = '';

  if (total <= 1) return;

  for (let i = 1; i <= total; i++) {
    const btn = document.createElement('button');
    btn.textContent = i;

    if (i === current) btn.classList.add('active');

    btn.addEventListener('click', () => {
      currentPage = i;
      loadOrders(i, currentQuery, currentStatus);
    });

    container.appendChild(btn);
  }
}

/* =================================
   TABLE CLICK HANDLER (FINAL CLEAN)
================================= */
document.getElementById('ordersTable').addEventListener('click', (e) => {
  // ===============================
  // LET LINKS WORK
  // ===============================
  if (e.target.closest('.inline-details-link')) {
    return;
  }

  // ===============================
  // STATUS BUTTON CLICK
  // ===============================
  const statusBtn = e.target.closest('.status-btn');
  if (statusBtn) {
    const orderId = statusBtn.dataset.id;
    const newStatus = statusBtn.dataset.status;

    updateOrderStatus(orderId, newStatus);
    return;
  }
  const viewBtn = e.target.closest('.view-order');
  if (!viewBtn) return;

  const row = viewBtn.closest('tr');
  const orderId = viewBtn.dataset.id;

  let detailsRow = row.nextElementSibling;

  // ===============================
  // CLOSE
  // ===============================
  if (detailsRow && detailsRow.classList.contains('order-details-row')) {
    const wrapper = detailsRow.querySelector('.inline-order-wrapper');

    if (wrapper) {
      // lock current height
      wrapper.style.height = wrapper.scrollHeight + 'px';

      requestAnimationFrame(() => {
        wrapper.style.height = '0px';
      });

      setTimeout(() => {
        detailsRow.remove();
      }, 450);
    }

    return;
  }

  // ===============================
  // CLOSE ANY OPEN ROW (SMOOTH, NOT INSTANT)
  // ===============================
  const openRow = document.querySelector('.order-details-row');

  if (openRow && openRow !== detailsRow) {
    const openWrapper = openRow.querySelector('.inline-order-wrapper');

    if (openWrapper) {
      // lock current height
      openWrapper.style.height = openWrapper.scrollHeight + 'px';

      requestAnimationFrame(() => {
        openWrapper.style.height = '0px';
      });

      // remove AFTER animation
      setTimeout(() => {
        openRow.remove();
      }, 450);
    }
  }

  const backendStatus = row.children[3].innerText.trim();
  const order = JSON.parse(row.dataset.order);

  const allowedStatuses = Array.isArray(order.allowedActions) ? order.allowedActions : [];
  const paymentState = row.querySelector('.payment-status')?.textContent.trim().toLowerCase();

  const isFinalState = Boolean(order.isFinal);
  // ===============================
  // CREATE ROW
  // ===============================
  detailsRow = document.createElement('tr');
  detailsRow.className = 'order-details-row';

  const cell = document.createElement('td');
  cell.colSpan = 7;

  const vendorOrders = Array.isArray(order.vendorOrders) ? order.vendorOrders : [];

  const vendorChips = vendorOrders.map(vo => {
    const name     = vo.vendorStoreName || vo.vendorName || '';
    const shortVId = '...' + String(vo.vendorId || '').slice(-6).toUpperCase();
    const nameHtml = name
      ? `<strong>${name}</strong> <strong style="font-family:monospace;font-size:0.72rem;color:#6b7280">${shortVId}</strong>`
      : `<strong style="font-family:monospace;font-size:0.78rem">${shortVId}</strong>`;
    const status = vo.status || 'Pending';
    const total  = Number(vo.total || 0).toFixed(2);
    return `
      <div style="display:inline-flex;align-items:center;gap:6px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px;padding:4px 10px;font-size:0.78rem;margin:2px 4px 2px 0">
        ${nameHtml}
        <span class="status status-${status.toLowerCase().replace(/\s+/g, '-')}" style="font-size:0.72rem">${status}</span>
        <span style="color:#6b7280">£${total}</span>
      </div>`;
  }).join('');

  cell.innerHTML = `
<div class="inline-order-wrapper">
  <div class="inline-order-content">

    <div class="inline-status-line">
      <strong>Status</strong>
      <span class="status status-${backendStatus.toLowerCase()}">
        ${backendStatus}
      </span>
    </div>

    ${vendorChips ? `<div style="margin:6px 0 4px"><strong style="font-size:0.8rem;color:#6b7280">Sellers</strong><div style="margin-top:4px">${vendorChips}</div></div>` : ''}

<div class="inline-status-buttons">
  ${
    isFinalState
      ? `<div class="final-state-message">Order is finalized</div>`
      : allowedStatuses
          .map(
            (status) => `
        <button class="status-btn" data-id="${orderId}" data-status="${status}">
          ${getAdminLabel(status)}
        </button>
      `
          )
          .join('')
  }
    </div>

    <a class="inline-details-link"
       href="/account/admin/order-details.html?id=${orderId}">
      View full details →
    </a>

  </div>
</div>
`;

  detailsRow.appendChild(cell);
  row.after(detailsRow);

  // ===============================
  // OPEN (SMOOTH + FULL HEIGHT)
  // ===============================
  const wrapper = detailsRow.querySelector('.inline-order-wrapper');

  // measure real height
  wrapper.style.height = 'auto';
  const fullHeight = wrapper.scrollHeight + 'px';

  // collapse
  wrapper.style.height = '0px';
  wrapper.offsetHeight;

  // animate open
  requestAnimationFrame(() => {
    wrapper.style.height = fullHeight;
  });
});

async function updateOrderStatus(orderId, status) {
  try {
    const res = await authFetch(`${API_BASE}/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });

    const data = await res.json();

    if (!res.ok) {
      showAlert(data.error || 'Update failed');
      return;
    }

    // reload updated data
    loadOrders(currentPage, currentQuery, currentStatus);
  } catch (err) {
    console.error(err);
    showAlert('Something went wrong');
  }
}
/* =================================
   FILTERS
================================= */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;

  currentStatus = btn.dataset.status;
  currentPage = 1;

  document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');

  loadOrders(currentPage, currentQuery, currentStatus);
});

/* =================================
   QUICK SEARCH
================================= */
document.addEventListener('click', (e) => {
  const idBtn = e.target.closest('.quick-search-id');
  if (idBtn) {
    currentQuery = idBtn.dataset.id;
    currentPage = 1;
    loadOrders(currentPage, currentQuery, currentStatus);
    return;
  }

  const emailBtn = e.target.closest('.quick-search-email');
  if (emailBtn) {
    currentQuery = emailBtn.dataset.email;
    currentPage = 1;
    loadOrders(currentPage, currentQuery, currentStatus);
  }
});

/* =================================
   INIT
================================= */
document.addEventListener('DOMContentLoaded', () => {
  searchInput = document.getElementById('orderSearch');

  if (!searchInput) {
    console.error('❌ Search input not found');
    return;
  }

  attachSearchHandlers();
  loadOrders();
});

/* =================================
   LIVE UPDATES
================================= */
startLiveUpdates(() => {
  const openRow = document.querySelector('.order-details-row');
  if (openRow) return;

  loadOrders(currentPage, currentQuery, currentStatus);
});
