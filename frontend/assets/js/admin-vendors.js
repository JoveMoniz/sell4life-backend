console.log('admin vendors loaded');

/* =========================================
   STATE
========================================= */
let currentPage = 1;
let currentQuery = '';
let currentStatus = 'all';

const API = window.API_BASE;
const token = localStorage.getItem('s4l_token');

/* =========================================
   LOAD VENDORS
========================================= */
async function loadVendors(page = 1, q = '', status = 'all') {
  const tableBody = document.getElementById('vendorsTable');
  const oldContainer = document.getElementById('vendors-list');
  const loading = document.getElementById('vendors-loading');

  if (!token) {
    if (tableBody) tableBody.innerHTML = '<tr><td colspan="8">Not logged in</td></tr>';
    if (oldContainer) oldContainer.innerHTML = 'Not logged in';
    return;
  }

  currentPage = page;
  currentQuery = q;
  currentStatus = status;

  let url = `${API}/admin/vendors?page=${page}`;

  if (q) url += `&q=${encodeURIComponent(q)}`;
  if (status !== 'all') url += `&status=${status}`;

  if (tableBody) {
    tableBody.innerHTML = '<tr><td colspan="8">Loading vendors...</td></tr>';
  }

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.status === 401 || res.status === 403) {
      window.location.href = '/account/admin/signin.html';
      return;
    }

    const data = await res.json();

    if (loading) loading.style.display = 'none';

    /* ===============================
       TABLE RENDER (PRIMARY)
    =============================== */
    if (tableBody) {
      renderVendorsTable(data.vendors || []);
      renderPagination(data.pagination);
    }

    /* ===============================
       LEGACY CARD RENDER (TEMP)
    =============================== */
    if (oldContainer) {
      renderVendors(data.vendors || []);
    }
  } catch (err) {
    console.error(err);
    if (loading) loading.textContent = 'Failed to load vendors';
  }
}

/* =========================================
   TABLE RENDER
========================================= */
function renderVendorsTable(vendors) {
  const tbody = document.getElementById('vendorsTable');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!vendors.length) {
    tbody.innerHTML = '<tr><td colspan="8">No vendors found</td></tr>';
    return;
  }

  vendors.forEach((v) => {
    const tr = document.createElement('tr');

    const created = v.createdAt ? new Date(v.createdAt).toLocaleDateString('en-GB') : '—';

    tr.innerHTML = `
      <td>${v.storeName || 'No Name'}</td>
      <td>${v.userId?.email || 'No email'}</td>

      <td>
        <span class="status status-${v.status}">
          ${v.status}
        </span>
      </td>

      <td>${v.orders || 0}</td>
<td>£${(v.grossRevenue || 0).toFixed(2)}</td>
<td>£${(v.refunds || 0).toFixed(2)}</td>
<td>£${(v.netRevenue || 0).toFixed(2)}</td>

      <td>${created}</td>

      <td>${renderVendorActions(v)}</td>
    `;

    tbody.appendChild(tr);
  });
}

/* =========================================
   LEGACY CARD RENDER (KEEP TEMP)
========================================= */
function renderVendors(vendors) {
  const container = document.getElementById('vendors-list');
  if (!container) return;

  if (!vendors.length) {
    container.innerHTML = '<p>No vendors found</p>';
    return;
  }

  container.innerHTML = vendors
    .map(
      (v) => `
      <div class="vendor-card">
        <div class="vendor-top">
          <div class="vendor-info">
            <h3>${v.storeName || 'No Name'}</h3>
            <p class="vendor-email">${v.userId?.email || 'No email'}</p>
          </div>
          <div class="vendor-status status-${v.status}">
            ${v.status}
          </div>
        </div>

        <div class="vendor-actions">
          ${v.status === 'pending' ? `<button onclick="approveVendor('${v._id}')">Approve</button>` : ''}
          ${v.status === 'approved' ? `<button onclick="suspendVendor('${v._id}', '${v.status}')">Suspend</button>` : ''}
          ${v.status === 'suspended' ? `<button onclick="reactivateVendor('${v._id}', '${v.status}')">Reactivate</button>` : ''}
        </div>
      </div>
    `
    )
    .join('');
}

/* =========================================
   ACTION BUTTON BUILDER
========================================= */
function renderVendorActions(v) {
  if (v.status === 'pending') {
    return `<button class="action-btn" data-id="${v._id}" data-action="approve">Approve</button>`;
  }
  if (v.status === 'approved') {
    return `<button class="action-btn" data-id="${v._id}" data-action="suspend">Suspend</button>`;
  }
  if (v.status === 'suspended') {
    return `<button class="action-btn" data-id="${v._id}" data-action="reactivate">Reactivate</button>`;
  }
  return '';
}

/* =========================================
   ACTION HANDLER (MAIN)
========================================= */
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('.action-btn');
  if (!btn) return;

  const id = btn.dataset.id;
  const action = btn.dataset.action;

  try {
    const res = await fetch(`${API}/admin/vendors/${id}/${action}`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) {
      alert('Action failed');
      return;
    }

    loadVendors(currentPage, currentQuery, currentStatus);
  } catch (err) {
    console.error(err);
  }
});

/* =========================================
   PAGINATION
========================================= */
function renderPagination(pagination) {
  const container = document.getElementById('pagination');
  if (!container || !pagination) return;

  const { page, pages } = pagination;

  container.innerHTML = '';

  if (pages <= 1) return;

  // Prev
  const prev = document.createElement('button');
  prev.textContent = '← Prev';
  prev.disabled = page <= 1;

  prev.onclick = () => {
    loadVendors(page - 1, currentQuery, currentStatus);
  };

  container.appendChild(prev);

  // Info
  const info = document.createElement('span');
  info.textContent = ` Page ${page} of ${pages} `;
  container.appendChild(info);

  // Next
  const next = document.createElement('button');
  next.textContent = 'Next →';
  next.disabled = page >= pages;

  next.onclick = () => {
    loadVendors(page + 1, currentQuery, currentStatus);
  };

  container.appendChild(next);
}

/* =========================================
   SEARCH
========================================= */
const searchInput = document.getElementById('vendorSearch');

if (searchInput) {
  let timer;

  searchInput.addEventListener('input', () => {
    clearTimeout(timer);

    timer = setTimeout(() => {
      currentQuery = searchInput.value.trim();
      loadVendors(1, currentQuery, currentStatus);
    }, 300);
  });
}

/* =========================================
   FILTERS
========================================= */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;

  currentStatus = btn.dataset.status;
  currentPage = 1;

  document.querySelectorAll('.filter-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');

  loadVendors(currentPage, currentQuery, currentStatus);
});

/* =========================================
   INIT
========================================= */
document.addEventListener('DOMContentLoaded', () => {
  loadVendors();
});
