let currentPage = 1;
let currentQuery = '';

const API = window.API_BASE;

function authFetch(url, opts = {}) {
  const token = localStorage.getItem('s4l_token');
  const headers = { ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...opts, credentials: 'include', headers });
}

/* ================================
   LOAD USERS
================================ */
async function loadUsers(query = '', page = 1) {
  const tbody = document.getElementById('usersTable');

  currentPage  = page;
  currentQuery = query;

  let url = `${API}/admin/users?page=${page}`;
  if (query) url += `&q=${encodeURIComponent(query)}`;

  tbody.innerHTML = '<tr><td colspan="6">Loading...</td></tr>';

  const res = await authFetch(url);

  if (res.status === 401 || res.status === 403) {
    window.location.href = '/account/admin/signin.html';
    return;
  }

  const data = await res.json();

  if (!data.users || !Array.isArray(data.users)) {
    tbody.innerHTML = '<tr><td colspan="6">No users found</td></tr>';
    return;
  }

  tbody.innerHTML = '';

  data.users.forEach(user => {
    const tr = document.createElement('tr');
    tr.dataset.user = JSON.stringify(user);

    const accountType  = user.accountType || 'User';
    const createdDate  = user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-GB') : '—';
    const status       = user.banned ? 'Banned' : (user.active === false ? 'Inactive' : 'Active');
    const statusClass  = user.banned ? 'banned' : (user.active === false ? 'inactive' : 'active');

    const shortUId = '...' + String(user._id || '').slice(-6).toUpperCase();
    tr.innerHTML = `
      <td>
        ${user.email || '—'}
        <strong style="font-family:monospace;font-size:0.72rem;color:#6b7280;margin-left:4px">${shortUId}</strong>
      </td>
      <td>
        <select class="role-select" data-user-id="${user._id}">
          <option value="user"  ${user.role === 'user'  ? 'selected' : ''}>user</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>admin</option>
        </select>
      </td>
      <td>${accountType}</td>
      <td><span class="status-pill ${statusClass}">${status}</span></td>
      <td>${createdDate}</td>
      <td>
        <button class="save-btn" data-user-id="${user._id}">Save</button>
        <button class="view-user-btn" data-id="${user._id}"
          style="margin-left:6px;padding:4px 10px;border:1px solid #d1d5db;border-radius:4px;background:#fff;cursor:pointer;font-size:0.8rem">
          View
        </button>
      </td>`;

    tbody.appendChild(tr);
  });

  renderPagination(data.pagination);
}

/* ================================
   BUILD USER INLINE PANEL
================================ */
function buildUserPanel(user) {
  const shortUId  = '...' + String(user._id || '').slice(-6).toUpperCase();
  const created   = user.createdAt ? new Date(user.createdAt).toLocaleString() : '—';
  const lastLogin = user.lastLogin  ? new Date(user.lastLogin).toLocaleString()  : 'Never';

  const statusBadge = user.banned
    ? '<span style="background:#fee2e2;color:#b91c1c;padding:1px 8px;border-radius:10px;font-size:0.75rem;font-weight:600">Banned</span>'
    : user.active === false
      ? '<span style="background:#f3f4f6;color:#6b7280;padding:1px 8px;border-radius:10px;font-size:0.75rem;font-weight:600">Inactive</span>'
      : '<span style="background:#dcfce7;color:#15803d;padding:1px 8px;border-radius:10px;font-size:0.75rem;font-weight:600">Active</span>';

  const roleBadge = user.role === 'admin'
    ? '<span style="background:#ede9fe;color:#6d28d9;padding:1px 8px;border-radius:10px;font-size:0.75rem;font-weight:600">Admin</span>'
    : '<span style="background:#f3f4f6;color:#374151;padding:1px 8px;border-radius:10px;font-size:0.75rem;font-weight:600">User</span>';

  const emailVerified = user.emailVerified
    ? '<span style="color:#15803d">✓ Verified</span>'
    : '<span style="color:#9ca3af">Not verified</span>';

  const addr = user.defaultShippingAddress;
  const addrHtml = addr && addr.address1
    ? `<div>${addr.name || ''}</div>
       <div>${addr.address1}${addr.address2 ? ', ' + addr.address2 : ''}</div>
       <div>${[addr.city, addr.county, addr.postcode].filter(Boolean).join(', ')}</div>
       <div>${addr.country || ''}</div>`
    : '<span style="color:#9ca3af">No address saved</span>';

  const vendorHtml = user.vendor
    ? `<div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center">
         <strong>${user.vendor.storeName}</strong>
         <span class="status status-${user.vendor.status}" style="font-size:0.75rem">${user.vendor.status}</span>
         ${user.vendor.verified ? '<span style="background:#dbeafe;color:#1d4ed8;padding:1px 6px;border-radius:10px;font-size:0.72rem">Verified</span>' : ''}
         ${user.vendor.featured ? '<span style="background:#fef9c3;color:#92400e;padding:1px 6px;border-radius:10px;font-size:0.72rem">Featured</span>' : ''}
       </div>
       <div style="font-size:0.82rem;color:#6b7280">Type: ${user.vendor.type || '—'} · Slug: ${user.vendor.storeSlug || '—'}</div>`
    : '<span style="color:#9ca3af">No store</span>';

  const banBtn = user.banned
    ? `<button class="user-unban-btn" data-id="${user._id}"
         style="padding:5px 12px;background:#15803d;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.82rem">
         Unban
       </button>`
    : user.role !== 'admin'
      ? `<button class="user-ban-btn" data-id="${user._id}"
           style="padding:5px 12px;background:#b91c1c;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.82rem">
           Ban
         </button>`
      : '';

  return `
    <div style="padding:16px 0">
      <div style="display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:14px">
        <strong style="font-size:0.95rem">${user.email || '—'}</strong>
        <strong style="font-family:monospace;font-size:0.78rem;color:#6b7280">${shortUId}</strong>
        ${roleBadge} ${statusBadge}
      </div>

      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;margin-bottom:16px">

        <div>
          <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:6px">Profile</div>
          <div><strong>Name:</strong> ${user.name || '—'}</div>
          <div><strong>Username:</strong> ${user.username ? '@' + user.username : '—'}</div>
          <div><strong>Phone:</strong> ${user.phone || '—'}</div>
          <div><strong>Country:</strong> ${user.country || '—'}</div>
          <div><strong>Email:</strong> ${emailVerified}</div>
          <div><strong>Joined:</strong> ${created}</div>
        </div>

        <div>
          <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:6px">Activity</div>
          <div><strong>Orders:</strong> ${user.orderCount || 0}</div>
          <div><strong>Total spent:</strong> £${(user.totalSpent || 0).toFixed(2)}</div>
          <div><strong>Last login:</strong> ${lastLogin}</div>
        </div>

        <div>
          <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:6px">Shipping address</div>
          ${addrHtml}
        </div>

        <div>
          <div style="font-size:0.72rem;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:6px">Vendor store</div>
          ${vendorHtml}
        </div>

      </div>

      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding-top:12px;border-top:1px solid #e5e7eb">
        <select class="role-select-inline" data-user-id="${user._id}"
          style="padding:5px 8px;border:1px solid #d1d5db;border-radius:4px;font-size:0.82rem">
          <option value="user"  ${user.role === 'user'  ? 'selected' : ''}>user</option>
          <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>admin</option>
        </select>
        <button class="save-role-inline-btn" data-user-id="${user._id}"
          style="padding:5px 12px;background:#111;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.82rem">
          Save role
        </button>
        ${banBtn}
        <a href="/account/admin/buyer-orders.html?id=${user._id}" target="_blank"
          style="padding:5px 12px;border:1px solid #d1d5db;border-radius:4px;background:#fff;font-size:0.82rem;color:#374151;text-decoration:none;margin-left:auto">
          View Orders ↗
        </a>
      </div>
    </div>`;
}

/* ================================
   CLICK HANDLER (delegated)
================================ */
document.getElementById('usersTable').addEventListener('click', async e => {
  // Save role (table row select)
  const saveBtn = e.target.closest('.save-btn');
  if (saveBtn) {
    const userId = saveBtn.dataset.userId;
    const select = document.querySelector(`.role-select[data-user-id="${userId}"]`);
    if (!select) return;
    await saveRole(userId, select.value, saveBtn);
    return;
  }

  // Save role (inline panel)
  const saveInlineBtn = e.target.closest('.save-role-inline-btn');
  if (saveInlineBtn) {
    const userId = saveInlineBtn.dataset.userId;
    const select = saveInlineBtn.closest('div').querySelector(`.role-select-inline[data-user-id="${userId}"]`);
    if (!select) return;
    await saveRole(userId, select.value, saveInlineBtn);
    return;
  }

  // Ban
  const banBtn = e.target.closest('.user-ban-btn');
  if (banBtn) {
    if (!confirm('Ban this user?')) return;
    banBtn.disabled = true;
    banBtn.textContent = '...';
    try {
      const res  = await authFetch(`${API}/admin/users/${banBtn.dataset.id}/ban`, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Failed'); return; }
      loadUsers(currentQuery, currentPage);
    } catch (err) { alert('Something went wrong'); }
    finally { banBtn.disabled = false; banBtn.textContent = 'Ban'; }
    return;
  }

  // Unban
  const unbanBtn = e.target.closest('.user-unban-btn');
  if (unbanBtn) {
    if (!confirm('Unban this user?')) return;
    unbanBtn.disabled = true;
    unbanBtn.textContent = '...';
    try {
      const res  = await authFetch(`${API}/admin/users/${unbanBtn.dataset.id}/unban`, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok) { alert(data.error || 'Failed'); return; }
      loadUsers(currentQuery, currentPage);
    } catch (err) { alert('Something went wrong'); }
    finally { unbanBtn.disabled = false; unbanBtn.textContent = 'Unban'; }
    return;
  }

  // View — inline panel
  const viewBtn = e.target.closest('.view-user-btn');
  if (!viewBtn) return;

  const row  = viewBtn.closest('tr');
  const user = JSON.parse(row.dataset.user || '{}');

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
  const openRow = document.querySelector('#usersTable .order-details-row');
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
  cell.colSpan = 6;
  cell.innerHTML = `<div class="inline-order-wrapper">${buildUserPanel(user)}</div>`;
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

/* ================================
   SAVE ROLE (shared)
================================ */
async function saveRole(userId, newRole, btn) {
  btn.disabled    = true;
  btn.textContent = '...';
  try {
    const res  = await authFetch(`${API}/admin/users/${userId}/role`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ role: newRole }),
    });
    const data = await res.json();

    if (!res.ok) { alert(data.error || 'Failed to update role'); return; }

    if (data.requiresReauth) {
      alert('Your role changed. Please sign in again.');
      localStorage.clear();
      window.location.href = '/account/admin/signin.html';
      return;
    }

    alert('Role updated. User must sign out and sign in again.');
    loadUsers(currentQuery, currentPage);
  } catch (err) {
    console.error('Update error:', err);
  } finally {
    btn.disabled    = false;
    btn.textContent = btn.classList.contains('save-role-inline-btn') ? 'Save role' : 'Save';
  }
}

/* ================================
   SEARCH
================================ */
const searchInput = document.getElementById('userSearch');
let searchTimer;
if (searchInput) {
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => loadUsers(searchInput.value.trim()), 300);
  });
}

/* ================================
   PAGINATION
================================ */
function renderPagination(pagination) {
  const container = document.getElementById('pagination');
  if (!container || !pagination) return;

  const { page, pages } = pagination;
  container.innerHTML = '';
  if (pages <= 1) return;

  const prev = document.createElement('button');
  prev.textContent = '← Prev';
  prev.disabled = page <= 1;
  prev.onclick = () => loadUsers(currentQuery, page - 1);
  container.appendChild(prev);

  const info = document.createElement('span');
  info.textContent = ` Page ${page} of ${pages} `;
  container.appendChild(info);

  const next = document.createElement('button');
  next.textContent = 'Next →';
  next.disabled = page >= pages;
  next.onclick = () => loadUsers(currentQuery, page + 1);
  container.appendChild(next);
}

/* ================================
   INIT
================================ */
loadUsers();
