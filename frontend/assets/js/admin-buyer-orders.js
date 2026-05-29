// ======================================================
// ADMIN BUYER ORDERS
// ======================================================

const API = window.API_BASE;
const PER_PAGE = 20;

let allOrders = [];
let currentPage = 1;

function authFetch(url, opts = {}) {
  const token = localStorage.getItem('s4l_token');
  const headers = { ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...opts, credentials: 'include', headers });
}

function fmt(n) {
  return '£' + Number(n || 0).toFixed(2);
}

/* ======================================================
   INIT
====================================================== */
(function init() {
  const params = new URLSearchParams(window.location.search);
  const userId = params.get('id');
  if (!userId) {
    document.getElementById('bo-list').innerHTML =
      '<div class="bo-loading">No user ID in URL.</div>';
    return;
  }
  loadBuyerOrders(userId);
})();

/* ======================================================
   LOAD
====================================================== */
async function loadBuyerOrders(userId) {
  try {
    const res = await authFetch(`${API}/admin/users/${userId}/orders`);
    if (res.status === 401 || res.status === 403) {
      window.location.href = '/account/admin/signin.html';
      return;
    }
    const data = await res.json();
    allOrders = data.orders || [];
    renderInfoBar(data.user);
    renderCards(data.summary);
    renderPage(1);
  } catch (err) {
    console.error('Buyer orders error:', err);
    document.getElementById('bo-list').innerHTML = '<div class="bo-loading">Failed to load.</div>';
  }
}

/* ======================================================
   PAGINATION
====================================================== */
function renderPage(page) {
  currentPage = page;
  const total = allOrders.length;
  const pages = Math.ceil(total / PER_PAGE);
  const slice = allOrders.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const countEl = document.getElementById('bo-count');
  if (countEl) {
    countEl.textContent = total
      ? `${(page - 1) * PER_PAGE + 1}–${Math.min(page * PER_PAGE, total)} of ${total} order${total !== 1 ? 's' : ''}`
      : '0 orders';
  }

  renderOrders(slice);
  renderPagination(page, pages);
}

function renderPagination(page, pages) {
  const container = document.getElementById('bo-pagination');
  if (!container) return;
  container.innerHTML = '';
  if (pages <= 1) return;

  const prev = document.createElement('button');
  prev.textContent = '← Prev';
  prev.disabled = page <= 1;
  prev.className = 'bo-pg-btn';
  prev.onclick = () => {
    renderPage(page - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  container.appendChild(prev);

  const info = document.createElement('span');
  info.textContent = ` Page ${page} of ${pages} `;
  info.className = 'bo-pg-info';
  container.appendChild(info);

  const next = document.createElement('button');
  next.textContent = 'Next →';
  next.disabled = page >= pages;
  next.className = 'bo-pg-btn';
  next.onclick = () => {
    renderPage(page + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  container.appendChild(next);
}

/* ======================================================
   INFO BAR
====================================================== */
function renderInfoBar(u) {
  if (!u) return;
  const bar = document.getElementById('bo-info-bar');
  if (!bar) return;

  const statusStyle = u.banned
    ? 'background:#fee2e2;color:#991b1b'
    : u.active === false
      ? 'background:#f3f4f6;color:#6b7280'
      : 'background:#dcfce7;color:#166534';
  const statusLabel = u.banned ? 'Banned' : u.active === false ? 'Inactive' : 'Active';

  bar.innerHTML = `
    <strong>${u.email}</strong>
    ${u.name ? `<span style="color:#6b7280">${u.name}</span>` : ''}
    ${u.username ? `<span style="color:#9ca3af;font-size:11px">@${u.username}</span>` : ''}
    <span style="${statusStyle};padding:1px 8px;border-radius:10px;font-size:11px;font-weight:600">${statusLabel}</span>
    <span style="font-size:11px;color:#9ca3af;margin-left:auto">Joined ${new Date(u.createdAt).toLocaleDateString('en-GB')}</span>
  `;
  bar.style.display = 'flex';

  document.getElementById('page-title').textContent = `${u.email} – Orders`;
}

/* ======================================================
   SUMMARY CARDS
====================================================== */
function renderCards(s) {
  const el = document.getElementById('bo-cards');
  if (!el || !s) return;
  el.innerHTML = `
    <div class="bo-card">
      <div class="bo-card-label">Orders</div>
      <div class="bo-card-value">${s.orderCount}</div>
      <div class="bo-card-sub">total placed</div>
    </div>
    <div class="bo-card">
      <div class="bo-card-label">Total Spent</div>
      <div class="bo-card-value">${fmt(s.totalSpent)}</div>
      <div class="bo-card-sub">on paid orders</div>
    </div>
    <div class="bo-card">
      <div class="bo-card-label">Refunds</div>
      <div class="bo-card-value negative">${fmt(s.totalRefunds)}</div>
      <div class="bo-card-sub">returned to buyer</div>
    </div>
    <div class="bo-card">
      <div class="bo-card-label">Net Spent</div>
      <div class="bo-card-value ${s.netSpent > 0 ? 'positive' : ''}">${fmt(s.netSpent)}</div>
      <div class="bo-card-sub">after refunds</div>
    </div>
  `;
}

/* ======================================================
   ORDERS LIST
====================================================== */
function renderOrders(orders) {
  const list = document.getElementById('bo-list');
  if (!list) return;

  if (!orders || !orders.length) {
    list.innerHTML = '<div class="bo-loading">No orders found for this buyer.</div>';
    return;
  }

  list.innerHTML = orders
    .map((o) => {
      const date = new Date(o.createdAt).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const psClass = (o.paymentStatus || 'pending').toLowerCase().replace(/\s+/g, '_');
      const refundTag =
        o.refundTotal > 0
          ? `<span class="bo-refund-tag">−${fmt(o.refundTotal)} refunded</span>`
          : '';

      const itemRows = (o.items || [])
        .map((item) => {
          const itemStatusCls = (item.status || '').toLowerCase();
          const refundNote =
            item.status === 'Cancelled' ? ' <span class="bo-refund-tag">cancelled</span>' : '';
          return `<tr>
        <td>${item.name}${refundNote}</td>
        <td style="color:#6b7280;font-size:11px">${item.vendorName}</td>
        <td class="bo-num">${fmt(item.price)}</td>
        <td class="bo-num">${item.quantity}</td>
        <td class="bo-num">${fmt(item.price * item.quantity)}</td>
        <td><span class="bo-badge ${itemStatusCls}">${item.status}</span></td>
      </tr>`;
        })
        .join('');

      const addr = o.shippingAddress;
      const addrHtml =
        addr && addr.address1
          ? `<div class="bo-addr">
           ${addr.name ? `<div><strong>${addr.name}</strong></div>` : ''}
           <div>${addr.address1}${addr.address2 ? ', ' + addr.address2 : ''}</div>
           <div>${[addr.city, addr.county, addr.postcode, addr.country].filter(Boolean).join(', ')}</div>
         </div>`
          : '<div class="bo-addr" style="color:#9ca3af">No address</div>';

      return `
      <div class="bo-order">
        <div class="bo-order-header" data-order-id="${o._id}">
          <span class="bo-order-id">${o.displayId}</span>
          <span class="bo-order-date">${date}</span>
          <span class="bo-badge ${psClass}">${o.paymentStatus || 'pending'}</span>
          <span style="font-size:11px;color:#9ca3af">${o.itemCount} item${o.itemCount !== 1 ? 's' : ''}</span>
          <span class="bo-order-total">${fmt(o.total)}</span>
          ${refundTag}
          <span style="font-size:11px;color:#9ca3af;margin-left:4px">▾</span>
        </div>
        <div class="bo-order-body" id="body-${o._id}">
          <table class="bo-items-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Vendor</th>
                <th class="bo-num">Price</th>
                <th class="bo-num">Qty</th>
                <th class="bo-num">Subtotal</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>${itemRows}</tbody>
          </table>
          <div style="display:flex;gap:24px;flex-wrap:wrap;font-size:12px">
            <div>
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:4px">Shipping to</div>
              ${addrHtml}
            </div>
            <div style="margin-left:auto;text-align:right">
              <div style="font-size:10px;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:4px">Order total</div>
              <div style="font-size:15px;font-weight:700">${fmt(o.total)}</div>
              ${o.refundTotal > 0 ? `<div style="color:#b91c1c;font-size:12px">−${fmt(o.refundTotal)} refunded</div>` : ''}
            </div>
          </div>
        </div>
      </div>`;
    })
    .join('');

  // Toggle expand/collapse
  list.addEventListener('click', (e) => {
    const header = e.target.closest('.bo-order-header');
    if (!header) return;
    const body = document.getElementById('body-' + header.dataset.orderId);
    if (body) body.classList.toggle('open');
  });
}
