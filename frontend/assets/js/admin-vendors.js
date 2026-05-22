let currentPage = 1;
let currentQuery = '';
let currentStatus = 'all';

const API = window.API_BASE;

function authFetch(url, opts = {}) {
  const token = localStorage.getItem('s4l_token');
  const headers = { ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...opts, credentials: 'include', headers });
}

/* =========================================
   LOAD VENDORS
========================================= */
async function loadVendors(page = 1, q = '', status = 'all') {
  const tbody = document.getElementById('vendorsTable');

  currentPage  = page;
  currentQuery = q;
  currentStatus = status;

  let url = `${API}/admin/vendors?page=${page}`;
  if (q)            url += `&q=${encodeURIComponent(q)}`;
  if (status !== 'all') url += `&status=${status}`;

  if (tbody) tbody.innerHTML = '<tr><td colspan="9">Loading vendors...</td></tr>';

  try {
    const res = await authFetch(url);

    if (res.status === 401 || res.status === 403) {
      window.location.href = '/account/admin/signin.html';
      return;
    }

    const data = await res.json();

    renderVendorsTable(data.vendors || []);
    renderPagination(data.pagination);
  } catch (err) {
    console.error(err);
    if (tbody) tbody.innerHTML = '<tr><td colspan="9">Failed to load vendors</td></tr>';
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
    tbody.innerHTML = '<tr><td colspan="9">No vendors found</td></tr>';
    return;
  }

  vendors.forEach(v => {
    const tr = document.createElement('tr');
    tr.dataset.vendor = JSON.stringify(v);

    const created = v.createdAt ? new Date(v.createdAt).toLocaleDateString('en-GB') : '—';

    const shortVId = '...' + String(v._id || '').slice(-6).toUpperCase();
    tr.innerHTML = `
      <td>
        ${v.storeName || 'No Name'}
        <strong style="font-family:monospace;font-size:0.72rem;color:#6b7280;margin-left:4px">${shortVId}</strong>
      </td>
      <td>${v.userId?.email || 'No email'}</td>
      <td><span class="status status-${v.status}">${v.status}</span></td>
      <td>${v.orders || 0}</td>
      <td>£${(v.grossRevenue || 0).toFixed(2)}</td>
      <td>£${(v.refunds || 0).toFixed(2)}</td>
      <td>£${(v.netRevenue || 0).toFixed(2)}</td>
      <td>${created}</td>
      <td>
        ${renderVendorActions(v)}
        <button class="view-vendor-btn" data-id="${v._id}"
          style="margin-left:6px;padding:4px 10px;border:1px solid #d1d5db;border-radius:4px;background:#fff;cursor:pointer;font-size:0.8rem">
          View
        </button>
      </td>`;

    tbody.appendChild(tr);
  });
}

function renderVendorActions(v) {
  if (v.status === 'pending')   return `<button class="action-btn" data-id="${v._id}" data-action="approve">Approve</button>`;
  if (v.status === 'approved')  return `<button class="action-btn" data-id="${v._id}" data-action="suspend">Suspend</button>`;
  if (v.status === 'suspended') return `<button class="action-btn" data-id="${v._id}" data-action="reactivate">Reactivate</button>`;
  return '';
}

/* =========================================
   INLINE VENDOR PANEL
========================================= */
function buildVendorPanel(v) {
  const shortVId  = '...' + String(v._id || '').slice(-6).toUpperCase();
  const email     = v.userId?.email || '—';
  const created   = v.createdAt   ? new Date(v.createdAt).toLocaleString()   : '—';
  const approved  = v.approvedAt  ? new Date(v.approvedAt).toLocaleString()  : '—';
  const suspended = v.suspendedAt ? new Date(v.suspendedAt).toLocaleString() : null;

  const verifiedBadge = v.verified  ? '<span style="background:#dbeafe;color:#1d4ed8;padding:1px 7px;border-radius:10px;font-size:0.72rem;font-weight:600">✓ Verified</span>' : '';
  const featuredBadge = v.featured  ? '<span style="background:#fef9c3;color:#92400e;padding:1px 7px;border-radius:10px;font-size:0.72rem;font-weight:600">Featured</span>' : '';

  const stripeInfo = v.stripeAccountId
    ? `<div><strong>Stripe account:</strong> <code style="font-size:0.78rem">${v.stripeAccountId}</code></div>
       <div><strong>Payouts:</strong> ${v.payoutEnabled ? '<span style="color:#15803d">Enabled ✓</span>' : '<span style="color:#b91c1c">Not enabled</span>'}</div>`
    : '<div style="color:#9ca3af">No Stripe account connected</div>';

  return `
    <div style="padding:16px 0">
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:14px">
        <strong style="font-size:1rem">${v.storeName || '—'}</strong>
        <strong style="font-family:monospace;font-size:0.78rem;color:#6b7280">${shortVId}</strong>
        <span class="status status-${v.status}" style="font-size:0.78rem">${v.status}</span>
        ${v.type ? `<span style="background:#f3f4f6;color:#374151;padding:1px 7px;border-radius:10px;font-size:0.72rem;text-transform:capitalize">${v.type}</span>` : ''}
        ${verifiedBadge} ${featuredBadge}
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px;margin-bottom:16px">

        <div>
          <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:6px">Store</div>
          <div><strong>Slug:</strong> ${v.storeSlug || '—'}</div>
          <div><strong>Type:</strong> ${v.type || '—'}</div>
          ${v.storeDescription ? `<div style="margin-top:4px;color:#374151;font-size:0.85rem">${v.storeDescription}</div>` : ''}
        </div>

        <div>
          <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:6px">Financials</div>
          <div><strong>Orders:</strong> ${v.orders || 0}</div>
          <div><strong>Gross:</strong> £${(v.grossRevenue || 0).toFixed(2)}</div>
          <div><strong>Refunds:</strong> £${(v.refunds || 0).toFixed(2)}</div>
          <div><strong>Net:</strong> £${(v.netRevenue || 0).toFixed(2)}</div>
        </div>

        <div>
          <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:6px">Payout / Bank</div>
          ${stripeInfo}
        </div>

        <div>
          <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:6px">Account</div>
          <div><strong>Email:</strong> <a href="mailto:${email}" style="color:#1d4ed8">${email}</a></div>
          <div><strong>Created:</strong> ${created}</div>
          ${approved !== '—' ? `<div><strong>Approved:</strong> ${approved}</div>` : ''}
          ${suspended ? `<div><strong>Suspended:</strong> ${suspended}</div>` : ''}
        </div>

      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:12px;border-top:1px solid #e5e7eb">
        ${renderVendorActions(v)}
      </div>
    </div>`;
}

/* =========================================
   CLICK HANDLER
========================================= */
document.getElementById('vendorsTable').addEventListener('click', async e => {
  // Existing action buttons
  const actionBtn = e.target.closest('.action-btn');
  if (actionBtn) {
    const id     = actionBtn.dataset.id;
    const action = actionBtn.dataset.action;
    try {
      const res = await authFetch(`${API}/admin/vendors/${id}/${action}`, { method: 'PATCH' });
      if (!res.ok) { alert('Action failed'); return; }
      loadVendors(currentPage, currentQuery, currentStatus);
    } catch (err) {
      console.error(err);
    }
    return;
  }

  // View button — inline panel
  const viewBtn = e.target.closest('.view-vendor-btn');
  if (!viewBtn) return;

  const row    = viewBtn.closest('tr');
  const vendor = JSON.parse(row.dataset.vendor || '{}');

  let detailsRow = row.nextElementSibling;

  // Close if already open
  if (detailsRow && detailsRow.classList.contains('order-details-row')) {
    const wrapper = detailsRow.querySelector('.inline-order-wrapper');
    if (wrapper) {
      wrapper.style.height = wrapper.scrollHeight + 'px';
      requestAnimationFrame(() => { wrapper.style.height = '0px'; });
      setTimeout(() => detailsRow.remove(), 450);
    }
    return;
  }

  // Close any other open panel
  const openRow = document.querySelector('#vendorsTable .order-details-row');
  if (openRow) {
    const openWrapper = openRow.querySelector('.inline-order-wrapper');
    if (openWrapper) {
      openWrapper.style.height = openWrapper.scrollHeight + 'px';
      requestAnimationFrame(() => { openWrapper.style.height = '0px'; });
      setTimeout(() => openRow.remove(), 450);
    }
  }

  // Create panel
  detailsRow = document.createElement('tr');
  detailsRow.className = 'order-details-row';

  const cell = document.createElement('td');
  cell.colSpan = 9;
  cell.innerHTML = `<div class="inline-order-wrapper">${buildVendorPanel(vendor)}</div>`;
  detailsRow.appendChild(cell);
  row.after(detailsRow);

  // Animate open
  const wrapper = detailsRow.querySelector('.inline-order-wrapper');
  wrapper.style.height = 'auto';
  const fullHeight = wrapper.scrollHeight + 'px';
  wrapper.style.height = '0px';
  wrapper.offsetHeight;
  requestAnimationFrame(() => { wrapper.style.height = fullHeight; });
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

  const prev = document.createElement('button');
  prev.textContent = '← Prev';
  prev.disabled = page <= 1;
  prev.onclick = () => loadVendors(page - 1, currentQuery, currentStatus);
  container.appendChild(prev);

  const info = document.createElement('span');
  info.textContent = ` Page ${page} of ${pages} `;
  container.appendChild(info);

  const next = document.createElement('button');
  next.textContent = 'Next →';
  next.disabled = page >= pages;
  next.onclick = () => loadVendors(page + 1, currentQuery, currentStatus);
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
document.addEventListener('click', e => {
  const btn = e.target.closest('.filter-btn');
  if (!btn) return;
  currentStatus = btn.dataset.status;
  currentPage   = 1;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  loadVendors(currentPage, currentQuery, currentStatus);
});

/* =========================================
   INIT
========================================= */
loadVendors();
