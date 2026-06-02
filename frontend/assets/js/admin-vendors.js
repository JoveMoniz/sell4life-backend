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

  currentPage = page;
  currentQuery = q;
  currentStatus = status;

  let url = `${API}/admin/vendors?page=${page}`;
  if (q) url += `&q=${encodeURIComponent(q)}`;
  if (status !== 'all') url += `&status=${status}`;

  if (tbody) tbody.innerHTML = '<tr><td colspan="10">Loading vendors...</td></tr>';

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
    if (tbody) tbody.innerHTML = '<tr><td colspan="10">Failed to load vendors</td></tr>';
  }
}

/* =========================================
   TABLE RENDER
========================================= */
function renderVendorsTable(vendors) {
  lastVendors = vendors || [];
  const tbody = document.getElementById('vendorsTable');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!vendors.length) {
    tbody.innerHTML = '<tr><td colspan="10">No vendors found</td></tr>';
    return;
  }

  vendors.forEach((v) => {
    const tr = document.createElement('tr');
    tr.dataset.vendor = JSON.stringify(v);

    const created = v.createdAt ? new Date(v.createdAt).toLocaleDateString('en-GB') : '—';
    const commission = ((v.grossRevenue || 0) * 0.08).toFixed(2);
    const shortVId =
      '...' +
      String(v._id || '')
        .slice(-6)
        .toUpperCase();
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
      <td style="color:#1d4ed8;font-weight:600">£${commission}</td>
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
  if (v.status === 'pending')
    return `<button class="action-btn" data-id="${v._id}" data-action="approve">Approve</button>`;
  if (v.status === 'approved')
    return `<button class="action-btn" data-id="${v._id}" data-action="suspend">Suspend</button>`;
  if (v.status === 'suspended')
    return `<button class="action-btn" data-id="${v._id}" data-action="reactivate">Reactivate</button>`;
  return '';
}

/* =========================================
   INLINE VENDOR PANEL
========================================= */
function buildVendorPanel(v) {
  const shortVId =
    '...' +
    String(v._id || '')
      .slice(-6)
      .toUpperCase();
  const email = v.userId?.email || '—';
  const created = v.createdAt ? new Date(v.createdAt).toLocaleString() : '—';
  const approved = v.approvedAt ? new Date(v.approvedAt).toLocaleString() : '—';
  const suspended = v.suspendedAt ? new Date(v.suspendedAt).toLocaleString() : null;

  const verifiedBadge = v.verified
    ? '<span style="background:#dbeafe;color:#1d4ed8;padding:1px 7px;border-radius:10px;font-size:0.72rem;font-weight:600">✓ Verified</span>'
    : '';
  const featuredBadge = v.featured
    ? '<span style="background:#fef9c3;color:#92400e;padding:1px 7px;border-radius:10px;font-size:0.72rem;font-weight:600">Featured</span>'
    : '';

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
          <div><strong>Commission (8%):</strong> <span style="color:#1d4ed8;font-weight:600">£${((v.grossRevenue || 0) * 0.08).toFixed(2)}</span></div>
          <div><strong>Net to Vendor:</strong> £${(v.netRevenue || 0).toFixed(2)}</div>
          <div><strong>VAT:</strong> ${v.vatRegistered ? `Registered${v.vatNumber ? ` · <code style="font-size:0.78rem">${v.vatNumber}</code>` : ''}` : 'Not registered'}</div>
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

      <div style="display:flex;gap:8px;flex-wrap:wrap;padding-top:12px;border-top:1px solid #e5e7eb;align-items:center">
        ${renderVendorActions(v)}
        <a href="/account/admin/vendor-ledger.html?id=${v._id}" target="_blank"
          style="padding:4px 10px;border:1px solid #d1d5db;border-radius:4px;background:#fff;font-size:0.8rem;color:#374151;text-decoration:none">
          View Ledger ↗
        </a>
        <a href="/account/admin/vendor-products.html?id=${v._id}" target="_blank"
          style="padding:4px 10px;border:1px solid #d1d5db;border-radius:4px;background:#fff;font-size:0.8rem;color:#374151;text-decoration:none">
          View Products ↗
        </a>
        <a href="/account/admin/financials.html" target="_blank"
          style="padding:4px 10px;border:1px solid #d1d5db;border-radius:4px;background:#fff;font-size:0.8rem;color:#374151;text-decoration:none">
          Platform Financials ↗
        </a>
      </div>

      <div style="display:flex;gap:8px;align-items:center;padding-top:10px;margin-top:4px;border-top:1px solid #f3f4f6">
        <span style="font-size:0.78rem;font-weight:600;color:#6b7280">Set tier:</span>
        <select class="tier-select" data-id="${v._id}"
          style="padding:4px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:0.8rem;cursor:pointer">
          <option value="casual"       ${v.type==='casual'       ?'selected':''}>Casual</option>
          <option value="refurbished"  ${v.type==='refurbished'  ?'selected':''}>Refurbished</option>
          <option value="professional" ${v.type==='professional' ?'selected':''}>Professional</option>
          <option value="enterprise"   ${v.type==='enterprise'   ?'selected':''}>Enterprise</option>
        </select>
        ${v.type === 'refurbished' ? `
        <label style="font-size:0.78rem;display:flex;align-items:center;gap:4px;cursor:pointer">
          <input type="checkbox" class="refurb-badge-check" data-id="${v._id}" ${v.refurbishedBadge ? 'checked' : ''} />
          Verified Badge
        </label>` : ''}
        <button class="set-tier-btn" data-id="${v._id}"
          style="padding:4px 12px;background:#0b6b6a;color:#fff;border:none;border-radius:4px;font-size:0.8rem;cursor:pointer">
          Save
        </button>
        <span class="tier-msg" data-id="${v._id}" style="font-size:0.78rem;color:#15803d"></span>
      </div>
    </div>`;
}

/* =========================================
   CLICK HANDLER
========================================= */
document.getElementById('vendorsTable').addEventListener('click', async (e) => {
  // Existing action buttons
  const actionBtn = e.target.closest('.action-btn');
  if (actionBtn) {
    const id = actionBtn.dataset.id;
    const action = actionBtn.dataset.action;
    try {
      const res = await authFetch(`${API}/admin/vendors/${id}/${action}`, { method: 'PATCH' });
      if (!res.ok) {
        showAlert('Action failed');
        return;
      }
      loadVendors(currentPage, currentQuery, currentStatus);
    } catch (err) {
      console.error(err);
    }
    return;
  }

  // Set tier — inline confirm
  const tierBtn = e.target.closest('.set-tier-btn');
  if (tierBtn) {
    const id = tierBtn.dataset.id;
    const select = document.querySelector(`.tier-select[data-id="${id}"]`);
    const msg = document.querySelector(`.tier-msg[data-id="${id}"]`);
    const type = select?.value;
    if (!type) return;
    msg.innerHTML = `Change to <strong style="text-transform:capitalize">${type}</strong>?
      <button class="tier-confirm-yes" data-id="${id}" data-type="${type}"
        style="margin-left:6px;padding:2px 8px;background:#374151;color:#fff;border:none;border-radius:4px;font-size:0.75rem;cursor:pointer">Yes</button>
      <button class="tier-confirm-no" data-id="${id}"
        style="padding:2px 8px;background:none;color:#6b7280;border:1px solid #d1d5db;border-radius:4px;font-size:0.75rem;cursor:pointer">No</button>`;
    msg.style.color = '#374151';
    return;
  }

  // Tier inline confirm — yes
  const confirmYes = e.target.closest('.tier-confirm-yes');
  if (confirmYes) {
    const id = confirmYes.dataset.id;
    const type = confirmYes.dataset.type;
    const msg = document.querySelector(`.tier-msg[data-id="${id}"]`);
    const tierBtn2 = document.querySelector(`.set-tier-btn[data-id="${id}"]`);
    const badgeCheck = document.querySelector(`.refurb-badge-check[data-id="${id}"]`);
    msg.innerHTML = 'Saving…';
    if (tierBtn2) tierBtn2.disabled = true;
    try {
      const body = { type };
      if (badgeCheck) body.refurbishedBadge = badgeCheck.checked;
      const res = await authFetch(`${API}/admin/vendors/${id}/tier`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) { msg.textContent = 'Failed'; msg.style.color = '#b91c1c'; }
      else { msg.textContent = `Saved — ${type}`; msg.style.color = '#15803d'; setTimeout(() => { msg.textContent = ''; }, 3000); }
    } catch { msg.textContent = 'Error'; msg.style.color = '#b91c1c'; }
    finally { if (tierBtn2) tierBtn2.disabled = false; }
    return;
  }

  // Tier inline confirm — no
  const confirmNo = e.target.closest('.tier-confirm-no');
  if (confirmNo) {
    const msg = document.querySelector(`.tier-msg[data-id="${confirmNo.dataset.id}"]`);
    if (msg) msg.innerHTML = '';
    return;
  }

  // View button — inline panel
  const viewBtn = e.target.closest('.view-vendor-btn');
  if (!viewBtn) return;

  const row = viewBtn.closest('tr');
  const vendor = JSON.parse(row.dataset.vendor || '{}');

  let detailsRow = row.nextElementSibling;

  // Close if already open
  if (detailsRow && detailsRow.classList.contains('order-details-row')) {
    const wrapper = detailsRow.querySelector('.inline-order-wrapper');
    if (wrapper) {
      wrapper.style.height = wrapper.scrollHeight + 'px';
      requestAnimationFrame(() => {
        wrapper.style.height = '0px';
      });
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
      requestAnimationFrame(() => {
        openWrapper.style.height = '0px';
      });
      setTimeout(() => openRow.remove(), 450);
    }
  }

  // Create panel
  detailsRow = document.createElement('tr');
  detailsRow.className = 'order-details-row';

  const cell = document.createElement('td');
  cell.colSpan = 10;
  cell.innerHTML = `<div class="inline-order-wrapper">${buildVendorPanel(vendor)}</div>`;
  detailsRow.appendChild(cell);
  row.after(detailsRow);

  // Animate open
  const wrapper = detailsRow.querySelector('.inline-order-wrapper');
  wrapper.style.height = 'auto';
  const fullHeight = wrapper.scrollHeight + 'px';
  wrapper.style.height = '0px';
  wrapper.offsetHeight;
  requestAnimationFrame(() => {
    wrapper.style.height = fullHeight;
  });
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
   PAYOUT PANEL
========================================= */
async function loadPayoutRequests() {
  const tbody = document.getElementById('payout-requests-body');
  const badge = document.getElementById('payout-badge');
  if (!tbody) return;

  try {
    const res = await authFetch(`${API}/admin/vendors/payouts?status=requested`);
    if (!res.ok) return;
    const data = await res.json();
    const payouts = data.payouts || [];

    if (badge) {
      badge.textContent = payouts.length;
      badge.style.display = payouts.length ? 'inline-block' : 'none';
    }

    if (!payouts.length) {
      tbody.innerHTML =
        '<tr><td colspan="4" class="admin-payout-empty">No pending payout requests</td></tr>';
      return;
    }

    tbody.innerHTML = payouts
      .map((p) => {
        const vendor = p.vendorId || {};
        const storeName = vendor.storeName || '—';
        const email = vendor.userId?.email || '—';
        const date = new Date(p.requestedAt).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
        return `<tr data-payout-id="${p._id}">
  <td><strong>${storeName}</strong><br><small style="color:#6b7280">${email}</small></td>
  <td><strong>£${Number(p.amount).toFixed(2)}</strong></td>
  <td>${date}</td>
  <td>
    <div class="payout-actions">
      <input type="text" class="payout-ref-input" placeholder="Bank ref (optional)">
      <button class="btn-payout-paid" data-id="${p._id}" data-action="paid">Mark Paid</button>
      <button class="btn-payout-reject" data-id="${p._id}" data-action="rejected">Reject</button>
    </div>
  </td>
</tr>`;
      })
      .join('');
  } catch (err) {
    console.error('Payout requests error:', err);
  }
}

document.getElementById('payout-panel-toggle').addEventListener('click', () => {
  document.getElementById('payout-panel-body')?.classList.toggle('is-open');
});

document.getElementById('payout-requests-body').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const id = btn.dataset.id;
  const action = btn.dataset.action;
  const row = btn.closest('tr');
  const ref = row?.querySelector('.payout-ref-input')?.value?.trim() || '';

  const label = action === 'paid' ? 'Mark this payout as paid?' : 'Reject this payout request?';
  if (!await showConfirm(label)) return;

  btn.disabled = true;
  try {
    const body = { status: action };
    if (ref) body.reference = ref;
    const res = await authFetch(`${API}/admin/vendors/payouts/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      showAlert('Action failed');
      btn.disabled = false;
      return;
    }
    loadPayoutRequests();
  } catch (err) {
    showAlert('Network error');
    btn.disabled = false;
  }
});

/* =========================================
   CSV EXPORT
========================================= */
let lastVendors = [];

document.addEventListener('click', (e) => {
  if (!e.target.closest('#vendors-export-csv')) return;
  if (!lastVendors.length) {
    showAlert('No vendors loaded to export.');
    return;
  }

  const header = [
    'Vendor',
    'Short ID',
    'Email',
    'Status',
    'Orders',
    'Gross (£)',
    'Refunds (£)',
    'Commission (£)',
    'Net to Vendor (£)',
    'Created',
  ];
  const rows = lastVendors.map((v) => {
    const shortId =
      '...' +
      String(v._id || '')
        .slice(-6)
        .toUpperCase();
    const commission = ((v.grossRevenue || 0) * 0.08).toFixed(2);
    const created = v.createdAt ? new Date(v.createdAt).toLocaleDateString('en-GB') : '';
    return [
      `"${(v.storeName || '').replace(/"/g, '""')}"`,
      shortId,
      v.userId?.email || '',
      v.status || '',
      v.orders || 0,
      Number(v.grossRevenue || 0).toFixed(2),
      Number(v.refunds || 0).toFixed(2),
      commission,
      Number(v.netRevenue || 0).toFixed(2),
      created,
    ].join(',');
  });

  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vendors-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

/* =========================================
   UPGRADE REQUESTS PANEL
========================================= */
async function loadUpgradeRequests() {
  const tbody = document.getElementById('upgrade-requests-body');
  const badge = document.getElementById('upgrade-badge');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="5" class="admin-payout-empty">Loading…</td></tr>';

  try {
    const res = await authFetch(`${API}/admin/vendors/upgrade-requests`);
    const data = await res.json();

    if (!res.ok) {
      tbody.innerHTML = `<tr><td colspan="5" class="admin-payout-empty" style="color:#b91c1c">Error: ${data.error || res.status}</td></tr>`;
      return;
    }

    const requests = data.requests || [];

    if (badge) {
      badge.textContent = requests.length;
      badge.style.display = requests.length ? 'inline-block' : 'none';
    }

    if (!requests.length) {
      tbody.innerHTML =
        '<tr><td colspan="5" class="admin-payout-empty">No pending upgrade requests</td></tr>';
      return;
    }

    tbody.innerHTML = requests
      .map((r) => {
        const requestedAt = new Date(r.requestedAt).toLocaleDateString('en-GB', {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
        });
        return `<tr data-upgrade-id="${r._id}">
  <td><strong>${r.storeName}</strong><br><small style="color:#6b7280">${r.email}</small></td>
  <td><span style="text-transform:capitalize">${r.currentTier}</span></td>
  <td><span style="text-transform:capitalize;font-weight:600;color:#f59e0b">${r.requestedTier}</span></td>
  <td><div style="max-width:200px;white-space:normal;word-wrap:break-word;color:#6b7280;font-size:0.85rem">${(r.message || '(no message)').substring(0, 100)}</div></td>
  <td>
    <div style="display:flex;gap:6px">
      <button class="btn-upgrade-approve" data-id="${r._id}" data-action="approve" style="padding:4px 10px;background:#15803d;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.8rem">Approve</button>
      <button class="btn-upgrade-reject" data-id="${r._id}" data-action="reject" style="padding:4px 10px;background:#b91c1c;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.8rem">Reject</button>
    </div>
  </td>
</tr>`;
      })
      .join('');
  } catch (err) {
    console.error('Upgrade requests error:', err);
    tbody.innerHTML = `<tr><td colspan="5" class="admin-payout-empty" style="color:#b91c1c">Failed to load: ${err.message}</td></tr>`;
  }
}

document.getElementById('upgrade-panel-toggle').addEventListener('click', () => {
  const body = document.getElementById('upgrade-panel-body');
  if (!body) return;
  const opening = !body.classList.contains('is-open');
  body.classList.toggle('is-open');
  if (opening) loadUpgradeRequests();
});

document.getElementById('upgrade-requests-body').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;

  const id = btn.dataset.id;
  const action = btn.dataset.action;

  const label = action === 'approve' ? 'Approve this tier upgrade?' : 'Reject this upgrade request?';
  if (!await showConfirm(label)) return;

  btn.disabled = true;
  try {
    const res = await authFetch(`${API}/admin/vendors/${id}/upgrade`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      showAlert('Action failed');
      btn.disabled = false;
      return;
    }
    loadUpgradeRequests();
    loadVendors();
  } catch (err) {
    showAlert('Network error');
    btn.disabled = false;
  }
});

/* =========================================
   INIT
========================================= */
loadVendors();
loadPayoutRequests();
loadUpgradeRequests();
