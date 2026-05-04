const FINAL_STATES = ['cancelled', 'returned'];
const FINAL_PAYMENT_STATES = ['refunded'];

const API = window.API_BASE;
/* =================================
   AUTH GUARD
================================= */
const token = localStorage.getItem('s4l_token');
const role = localStorage.getItem('s4l_role');

if (!token || role !== 'admin') {
  window.location.href = '/account/admin/signin.html';
}

/* =================================
   STATE
================================= */
let currentPage = 1;
let currentQuery = '';
let currentStatus = 'all';

let searchInput;

/* =================================
   HELPERS
================================= */

function getAdminActions(status) {
  const map = {
    // ======================
    // NORMAL FLOW
    // ======================
    Pending: ['Processing', 'Cancelled'],

    Processing: ['Shipped'],

    Shipped: ['Delivered'],

    Delivered: [], // no action unless request comes

    // ======================
    // CUSTOMER REQUESTS
    // ======================
    'Cancel Requested': ['Cancelled', 'Processing'],

    'Return Requested': ['Return Approved', 'Return Rejected'],

    // ======================
    // RETURN FLOW
    // ======================
    'Return Approved': ['Returned'],

    'Return Rejected': [],

    // ======================
    // FINAL / PAYMENT FLOW
    // ======================
    Returned: ['Refunded'],

    'Refund Requested': ['Refunded'],

    Cancelled: [],
  };

  return map[status] || [];
}

function getAdminLabel(status) {
  const labels = {
    Processing: 'Start Processing',
    Shipped: 'Mark Shipped',
    Delivered: 'Mark Delivered',
    Cancelled: 'Force Cancel',

    'Return Requested': 'Mark Return Requested', // ✅ FIX
    'Return Approved': 'Approve Return',
    'Return Rejected': 'Reject Return',
    Returned: 'Mark Returned',

    Refunded: 'Issue Refund',
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
      // EMAIL MODE
      currentQuery = raw.replace(/^S4L-/i, '');
      return;
    }

    // ID MODE
    let clean = raw.replace(/^S4L-/i, '').toUpperCase();

    currentQuery = clean;

    // 🔥 SAFE PREFIX (NO CURSOR BREAK)
    const cursorPos = searchInput.selectionStart;

    const newValue = clean ? `S4L-${clean}` : '';

    searchInput.value = newValue;

    const offset = newValue.length - raw.length;
    searchInput.setSelectionRange(cursorPos + offset, cursorPos + offset);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      loadOrders(currentPage, currentQuery, currentStatus);
    }
  });
}

/* =================================
   LOAD ORDERS
================================= */
async function loadOrders(page = 1, q = '', status = 'all') {
  let url = `${API_BASE}/admin/orders?page=${page}`;

  if (q) url += `&q=${encodeURIComponent(q)}`;
  if (status !== 'all') url += `&status=${status}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 401 || res.status === 403) {
    window.location.href = '/account/admin/signin.html';
    return;
  }

  const data = await res.json();

  const tbody = document.getElementById('ordersTable');
  tbody.innerHTML = '';

  data.orders.forEach((order) => {
    const tr = document.createElement('tr');

    const paymentStatus = order.paymentStatus || 'pending';

    const paymentLabelMap = {
      paid: 'Paid',
      refund_scheduled: 'Refund Scheduled',
      refunded: 'Refunded',
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

    tr.innerHTML = `
<td>
  <button class="quick-search-id" data-id="${cleanId}">
    ${displayId}
  </button>
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
  // REMOVE ANY OPEN ROW
  // ===============================
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
  const allowedStatuses = getAdminActions(backendStatus);
  // ===============================
  // CREATE ROW
  // ===============================
  detailsRow = document.createElement('tr');
  detailsRow.className = 'order-details-row';

  const cell = document.createElement('td');
  cell.colSpan = 7;

  cell.innerHTML = `
<div class="inline-order-wrapper">
  <div class="inline-order-content">

    <div class="inline-status-line">
      <strong>Status</strong>
      <span class="status status-${backendStatus.toLowerCase()}">
        ${backendStatus}
      </span>
    </div>

    <div class="inline-status-buttons">
      ${allowedStatuses
        .map(
          (status) => `
        <button class="status-btn" data-id="${orderId}" data-status="${status}">
         ${getAdminLabel(status)}
        </button>
      `
        )
        .join('')}
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
    const res = await fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
    });

    const data = await res.json();

    if (!res.ok) {
      alert(data.error || 'Update failed');
      return;
    }

    // reload updated data
    loadOrders(currentPage, currentQuery, currentStatus);
  } catch (err) {
    console.error(err);
    alert('Something went wrong');
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
