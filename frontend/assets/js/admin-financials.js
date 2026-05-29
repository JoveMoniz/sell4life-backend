// ======================================================
// ADMIN PLATFORM FINANCIALS
// ======================================================

const API = window.API_BASE;
let currentPeriod = 'all';
let lastVendors = [];

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
   LOAD FINANCIALS
====================================================== */
async function loadFinancials(period = 'all') {
  const cardsEl = document.getElementById('fin-cards');
  const tableEl = document.getElementById('fin-vendor-table');
  const countEl = document.getElementById('vendor-count');

  if (cardsEl) cardsEl.innerHTML = '<div class="fin-loading">Loading…</div>';
  if (tableEl) tableEl.innerHTML = '<tr><td colspan="8" class="fin-loading">Loading…</td></tr>';

  try {
    const url = `${API}/admin/vendors/financials${period !== 'all' ? '?period=' + period : ''}`;
    const res = await authFetch(url);

    if (res.status === 401 || res.status === 403) {
      window.location.href = '/account/admin/signin.html';
      return;
    }

    const data = await res.json();
    const s = data.summary || {};
    lastVendors = data.vendors || [];

    renderCards(s);
    renderVendorTable(lastVendors);
    if (countEl)
      countEl.textContent = `${lastVendors.length} vendor${lastVendors.length !== 1 ? 's' : ''}`;
  } catch (err) {
    console.error('Financials load error:', err);
    if (cardsEl) cardsEl.innerHTML = '<div class="fin-loading">Failed to load data</div>';
  }
}

/* ======================================================
   SUMMARY CARDS
====================================================== */
function renderCards(s) {
  const el = document.getElementById('fin-cards');
  if (!el) return;

  const profit = Number(s.netProfit || 0);
  const profitClass = profit >= 0 ? 'positive' : 'negative';

  el.innerHTML = `
    <div class="fin-card">
      <div class="fin-card-label">Gross Sales</div>
      <div class="fin-card-value">${fmt(s.totalGross)}</div>
      <div class="fin-card-sub">${s.orderCount || 0} paid orders</div>
    </div>
    <div class="fin-card">
      <div class="fin-card-label">Total Refunds</div>
      <div class="fin-card-value negative">${fmt(s.totalRefunds)}</div>
      <div class="fin-card-sub">returned to buyers</div>
    </div>
    <div class="fin-card">
      <div class="fin-card-label">Platform Revenue</div>
      <div class="fin-card-value positive">${fmt(s.totalCommission)}</div>
      <div class="fin-card-sub">8% commission</div>
    </div>
    <div class="fin-card">
      <div class="fin-card-label">Stripe Costs</div>
      <div class="fin-card-value negative">${fmt(s.totalStripe)}</div>
      <div class="fin-card-sub">paid to Stripe</div>
    </div>
    <div class="fin-card">
      <div class="fin-card-label">Net Profit</div>
      <div class="fin-card-value ${profitClass}">${fmt(s.netProfit)}</div>
      <div class="fin-card-sub">revenue − Stripe</div>
    </div>
    <div class="fin-card">
      <div class="fin-card-label">Payouts Pending</div>
      <div class="fin-card-value ${s.pendingCount > 0 ? 'warn' : ''}">${fmt(s.pendingPayouts)}</div>
      <div class="fin-card-sub">${s.pendingCount || 0} request${s.pendingCount !== 1 ? 's' : ''} awaiting</div>
    </div>
    <div class="fin-card">
      <div class="fin-card-label">Total Paid Out</div>
      <div class="fin-card-value">${fmt(s.paidPayouts)}</div>
      <div class="fin-card-sub">sent to vendors</div>
    </div>
    <div class="fin-card">
      <div class="fin-card-label">Active Vendors</div>
      <div class="fin-card-value">${s.vendorCount || 0}</div>
      <div class="fin-card-sub">with paid orders</div>
    </div>
  `;
}

/* ======================================================
   VENDOR TABLE
====================================================== */
function renderVendorTable(vendors) {
  const tbody = document.getElementById('fin-vendor-table');
  if (!tbody) return;

  if (!vendors.length) {
    tbody.innerHTML =
      '<tr><td colspan="8" class="fin-loading">No vendor data for this period</td></tr>';
    return;
  }

  tbody.innerHTML = vendors
    .map((v) => {
      const statusCls =
        v.status === 'approved' ? 'approved' : v.status === 'suspended' ? 'suspended' : 'pending';
      const vatBadge = v.vatRegistered
        ? '<span style="font-size:10px;background:#dbeafe;color:#1d4ed8;padding:1px 5px;border-radius:8px;margin-left:4px">VAT</span>'
        : '';
      return `<tr>
      <td>
        <strong>${v.storeName}</strong>${vatBadge}
        ${v.storeSlug ? `<div style="font-size:11px;color:#9ca3af">@${v.storeSlug}</div>` : ''}
      </td>
      <td style="color:#6b7280;font-size:12px">${v.email}</td>
      <td><span class="fin-status ${statusCls}">${v.status}</span></td>
      <td class="fin-num">${v.orderCount}</td>
      <td class="fin-num">${fmt(v.gross)}</td>
      <td class="fin-num" style="color:#b91c1c">${fmt(v.refunds)}</td>
      <td class="fin-num">${fmt(v.netToVendor)}</td>
      <td class="fin-num fin-commission">${fmt(v.commission)}</td>
    </tr>`;
    })
    .join('');
}

/* ======================================================
   PERIOD FILTER
====================================================== */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.fin-period-btn');
  if (!btn) return;
  document.querySelectorAll('.fin-period-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  currentPeriod = btn.dataset.period;
  loadFinancials(currentPeriod);
});

/* ======================================================
   CSV EXPORT
====================================================== */
document.addEventListener('click', (e) => {
  if (!e.target.closest('#btn-export-csv')) return;
  if (!lastVendors.length) {
    alert('No data to export.');
    return;
  }

  const header = [
    'Vendor',
    'Email',
    'Status',
    'VAT',
    'Orders',
    'Gross (£)',
    'Refunds (£)',
    'Net to Vendor (£)',
    'Commission (£)',
  ];
  const rows = lastVendors.map((v) =>
    [
      `"${v.storeName}"`,
      v.email,
      v.status,
      v.vatRegistered ? 'Yes' : 'No',
      v.orderCount,
      Number(v.gross).toFixed(2),
      Number(v.refunds).toFixed(2),
      Number(v.netToVendor).toFixed(2),
      Number(v.commission).toFixed(2),
    ].join(',')
  );

  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const label = currentPeriod !== 'all' ? `-${currentPeriod}` : '';
  const a = document.createElement('a');
  a.href = url;
  a.download = `platform-financials${label}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

/* ======================================================
   INIT + AUTO-REFRESH
====================================================== */
loadFinancials();

const REFRESH_INTERVAL = 20;
let refreshTimer = REFRESH_INTERVAL;

const refreshEl = document.getElementById('fin-refresh-indicator');

setInterval(() => {
  refreshTimer--;
  if (refreshTimer <= 0) {
    refreshTimer = REFRESH_INTERVAL;
    loadFinancials(currentPeriod);
  }
  if (refreshEl) refreshEl.textContent = `Refreshes in ${refreshTimer}s`;
}, 1000);
