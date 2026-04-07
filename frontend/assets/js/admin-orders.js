const FINAL_STATES = ['cancelled', 'delivered'];
import { API_BASE } from './config.js';

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
let activeIndex = -1;
let lastSentQuery = '';
let searchInput;
let currentPage = 1;
let currentQuery = '';
let currentStatus = 'all';

/* =================================
   HELPERS
================================= */
async function updateOrderStatus(orderId, status) {
  const res = await fetch(`${API_BASE}/admin/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(msg || 'Status update failed');
  }
}

function getAllowedTransitions(currentStatus) {
  const map = {
    Pending: ['Processing', 'Cancelled'],
    Processing: ['Shipped', 'Cancel Requested'],
    Shipped: ['Delivered'],
    Delivered: ['Refund Requested'],
    'Cancel Requested': ['Cancelled', 'Processing'],
    'Refund Requested': ['Cancelled', 'Delivered'],
    Cancelled: [],
  };

  return map[currentStatus] || [];
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

    const paymentLabel =
      paymentStatus === 'paid'
        ? 'Paid'
        : paymentStatus === 'failed'
          ? 'Failed'
          : paymentStatus === 'refunded'
            ? 'Refunded'
            : 'Unpaid';

    let displayId = order.shortId || order.id.slice(0, 10).toUpperCase();

    // ensure prefix exists
    if (!displayId.startsWith('S4L-')) {
      displayId = 'S4L-' + displayId;
    }

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
  <button class="view-order" data-id="${order.id}">
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
   TABLE CLICK HANDLER
================================= */
document.getElementById('ordersTable').addEventListener('click', async (e) => {
  /* QUICK SEARCH CLICK (Order ID / Email) */
  const idBtn = e.target.closest('.quick-search-id');
  if (idBtn) {
    const shortId = idBtn.dataset.id;

    // show prefix in the field
    if (searchInput) searchInput.value = 'S4L-' + shortId;

    // backend should receive clean value
    currentQuery = shortId;
    currentPage = 1;
    loadOrders(1, currentQuery, currentStatus);
    return;
  }

  const emailBtn = e.target.closest('.quick-search-email');
  if (emailBtn) {
    const email = emailBtn.dataset.email;

    if (searchInput) searchInput.value = email;

    currentQuery = email;
    currentPage = 1;
    loadOrders(1, currentQuery, currentStatus);
    return;
  }
  /* OPEN INLINE DETAILS */
  const viewBtn = e.target.closest('.view-order');
  if (viewBtn) {
    const row = viewBtn.closest('tr');
    const orderId = viewBtn.dataset.id;

    const backendStatus = row.children[3].textContent.trim();
    const paymentState = row.children[4].textContent.trim().toLowerCase();

    const isFinalOrder = ['cancelled', 'delivered'].includes(backendStatus.toLowerCase());
    const isRefunded = paymentState === 'refunded';

    const isFinal = isFinalOrder || isRefunded;
    const isUnpaid = paymentState !== 'paid';

    let detailsRow = row.nextElementSibling;
    if (detailsRow && detailsRow.classList.contains('order-details-row')) {
      detailsRow.classList.remove('open');

      setTimeout(() => {
        detailsRow.remove();
      }, 350); // match CSS duration

      return;
    }

    document.querySelectorAll('.order-details-row').forEach((r) => r.remove());

    const allowedStatuses = getAllowedTransitions(backendStatus);

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

     ${
       isFinal
         ? `<div class="inline-final-message">
       Final state – no further changes
     </div>`
         : isUnpaid
           ? `<div class="inline-final-message">
         Cannot change status – payment not completed
       </div>`
           : `
            <div class="inline-status-buttons">
              ${allowedStatuses
                .map(
                  (status) => `
                  <button
                    class="status-btn ${status === backendStatus ? 'active' : ''}"
                    data-id="${orderId}"
                    data-status="${status}">
                    ${status}
                  </button>
                `
                )
                .join('')}
            </div>
          `
     }

      <a class="inline-details-link"
         href="/account/admin/order-details.html?id=${orderId}">
        View full details →
      </a>

    </div>
  </div>
`;

    detailsRow.appendChild(cell);
    row.after(detailsRow);
    // trigger animation
    requestAnimationFrame(() => {
      detailsRow.classList.add('open');
    });
    return;
  }

  /* STATUS BUTTON CLICK */
  const statusBtn = e.target.closest('.status-btn');
  if (!statusBtn) return;

  const orderId = statusBtn.dataset.id;
  const newStatus = statusBtn.dataset.status;

  statusBtn.disabled = true;
  statusBtn.textContent = 'Saving…';

  try {
    await updateOrderStatus(orderId, newStatus);

    const detailsRow = statusBtn.closest('tr');
    const mainRow = detailsRow.previousElementSibling;
    const statusCell = mainRow.children[3];

    // Update main table badge
    statusCell.innerHTML = `
    <span class="status status-${newStatus.toLowerCase()}">
      ${newStatus}
    </span>
  `;

    const content = detailsRow.querySelector('.inline-order-content');

    // Update inline badge
    const inlineStatus = content.querySelector('.inline-status-line span');
    if (inlineStatus) {
      inlineStatus.className = `status status-${newStatus.toLowerCase()}`;
      inlineStatus.textContent = newStatus;
    }

    // Get new transitions
    const allowedStatuses = getAllowedTransitions(newStatus);

    const buttonsContainer = content.querySelector('.inline-status-buttons');

    // If no transitions → final state
    if (!allowedStatuses.length) {
      buttonsContainer?.remove();

      // Avoid duplicating final message
      if (!content.querySelector('.inline-final-message')) {
        const msg = document.createElement('div');
        msg.className = 'inline-final-message';
        msg.textContent = 'Final state – no further changes';

        content.insertBefore(msg, content.querySelector('.inline-details-link'));
      }

      return;
    }

    // Otherwise rebuild buttons
    buttonsContainer.innerHTML = allowedStatuses
      .map(
        (status) => `
        <button
          class="status-btn"
          data-id="${orderId}"
          data-status="${status}">
          ${status}
        </button>
      `
      )
      .join('');
  } catch (err) {
    console.error(err);
    statusBtn.textContent = 'Error';
  }

  setTimeout(() => {
    statusBtn.textContent = newStatus;
    statusBtn.disabled = false;
  }, 800);
});

/* =================================
   STATUS FILTER BUTTONS
================================= */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;

  document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));

  btn.classList.add('active');

  currentStatus = btn.dataset.status;
  currentPage = 1;

  loadOrders(1, currentQuery, currentStatus);
});

/* =================================
   LIVE SEARCH + TABLE KEYBOARD NAV
================================= */

document.addEventListener('DOMContentLoaded', () => {
  searchInput = document.getElementById('orderSearch');
  if (!searchInput) return;

  // Default prefix
  searchInput.value = 'S4L-';

  let liveTimer;

  /* ================================
     TABLE KEYBOARD NAVIGATION
  ================================= */
  searchInput.addEventListener('keydown', (e) => {
    const rows = Array.from(document.querySelectorAll('#ordersTable tr')).filter((row) =>
      row.querySelector('.view-order')
    );

    if (!rows.length) return;

    let activeRowIndex = rows.findIndex((row) => row.classList.contains('row-active'));

    if (e.key === 'ArrowDown') {
      e.preventDefault();

      if (activeRowIndex === -1) activeRowIndex = 0;
      else activeRowIndex = Math.min(activeRowIndex + 1, rows.length - 1);

      setActiveRow(rows, activeRowIndex);
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();

      if (activeRowIndex === -1) activeRowIndex = rows.length - 1;
      else activeRowIndex = Math.max(activeRowIndex - 1, 0);

      setActiveRow(rows, activeRowIndex);
    }

    if (e.key === 'Enter') {
      if (activeRowIndex >= 0) {
        const viewBtn = rows[activeRowIndex].querySelector('.view-order');
        if (viewBtn) {
          viewBtn.click();

          // After inline opens, move focus
          setTimeout(() => {
            const detailsRow = rows[activeRowIndex].nextElementSibling;

            if (detailsRow && detailsRow.classList.contains('order-details-row')) {
              const firstFocusable = detailsRow.querySelector('button, a, select');

              if (firstFocusable) {
                firstFocusable.focus();
              }
            }
          }, 50); // small delay to allow DOM render
        }
      }
    }
  });

  function setActiveRow(rows, index) {
    rows.forEach((row) => row.classList.remove('row-active'));

    const row = rows[index];
    if (!row) return;

    row.classList.add('row-active');
    row.scrollIntoView({ block: 'nearest' });
  }

  /* ================================
     LIVE SEARCH INPUT
  ================================= */
  searchInput.addEventListener('input', () => {
    let value = searchInput.value;

    // If empty → restore prefix
    if (value === '') {
      searchInput.value = 'S4L-';
      currentQuery = '';
      loadOrders(1, '', currentStatus);
      return;
    }

    // Remove any active highlight when new search starts
    document
      .querySelectorAll('#ordersTable tr')
      .forEach((row) => row.classList.remove('row-active'));

    // Prefix logic
    if (value.toUpperCase().startsWith('S4L-')) {
      const after = value.slice(4);

      if (/^[0-9]/.test(after)) {
        currentQuery = after;
      } else {
        searchInput.value = after;
        currentQuery = after;
      }
    } else if (/^[0-9]/.test(value)) {
      searchInput.value = 'S4L-' + value;
      currentQuery = value;
    } else {
      currentQuery = value;
    }

    clearTimeout(liveTimer);

    if (currentQuery.length < 2) return;

    liveTimer = setTimeout(() => {
      if (currentQuery === lastSentQuery) return;

      lastSentQuery = currentQuery;
      currentPage = 1;
      loadOrders(1, currentQuery, currentStatus);
    }, 150);
  });
});

/* =================================
   INIT
================================= */
loadOrders();
