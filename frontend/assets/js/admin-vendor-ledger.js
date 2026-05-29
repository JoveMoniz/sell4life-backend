// ======================================================
// ADMIN VENDOR LEDGER
// ======================================================

const API = window.API_BASE;
let currentPeriod = 'all';
let currentType = 'all';
let lastData = null;
let vendorId = null;

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
   INIT — read vendor ID from URL
====================================================== */
(function init() {
  const params = new URLSearchParams(window.location.search);
  vendorId = params.get('id');
  if (!vendorId) {
    document.getElementById('vl-table-body').innerHTML =
      '<tr><td colspan="8" class="vl-loading">No vendor ID in URL.</td></tr>';
    return;
  }
  loadLedger();
})();

/* ======================================================
   LOAD
====================================================== */
async function loadLedger() {
  const tbody = document.getElementById('vl-table-body');
  const cardsEl = document.getElementById('vl-cards');

  if (cardsEl) cardsEl.innerHTML = '<div class="vl-loading">Loading…</div>';
  if (tbody) tbody.innerHTML = '<tr><td colspan="8" class="vl-loading">Loading…</td></tr>';

  let url = `${API}/admin/vendors/${vendorId}/transactions?type=${currentType}`;
  if (currentPeriod !== 'all') url += `&period=${currentPeriod}`;

  try {
    const res = await authFetch(url);
    if (res.status === 401 || res.status === 403) {
      window.location.href = '/account/admin/signin.html';
      return;
    }
    const data = await res.json();
    lastData = data;
    renderInfoBar(data.vendor);
    renderCards(data.summary, data.vendor);
    renderTable(data.transactions, data.summary);
    renderCount(data.showing, data.totalOrders, data.truncated);
  } catch (err) {
    console.error('Ledger load error:', err);
    if (tbody)
      tbody.innerHTML = '<tr><td colspan="8" class="vl-loading">Failed to load data.</td></tr>';
  }
}

/* ======================================================
   VENDOR INFO BAR
====================================================== */
function renderInfoBar(v) {
  if (!v) return;
  const bar = document.getElementById('vl-info-bar');
  if (!bar) return;

  const statusCls =
    v.status === 'approved'
      ? 'color:#166534;background:#dcfce7'
      : v.status === 'suspended'
        ? 'color:#991b1b;background:#fee2e2'
        : 'color:#854d0e;background:#fef9c3';

  bar.innerHTML = `
    <strong>${v.storeName}</strong>
    ${v.storeSlug ? `<span style="color:#9ca3af;font-size:11px">@${v.storeSlug}</span>` : ''}
    <span style="${statusCls};padding:1px 8px;border-radius:10px;font-size:11px;font-weight:600;text-transform:capitalize">${v.status}</span>
    ${v.vatRegistered ? '<span style="background:#dbeafe;color:#1d4ed8;padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700">VAT</span>' : ''}
    <span class="vl-email">${v.email}</span>
  `;
  bar.style.display = 'flex';

  const titleEl = document.getElementById('page-title');
  if (titleEl) titleEl.textContent = `${v.storeName} – Ledger`;
}

/* ======================================================
   SUMMARY CARDS
====================================================== */
function renderCards(s, v) {
  const el = document.getElementById('vl-cards');
  if (!el || !s) return;

  const vatCard =
    v && v.vatRegistered && s.totalVat
      ? `<div class="vl-card">
        <div class="vl-card-label">VAT Collected</div>
        <div class="vl-card-value">${fmt(s.totalVat)}</div>
        <div class="vl-card-sub">incl. in gross</div>
       </div>`
      : '';

  el.innerHTML = `
    <div class="vl-card">
      <div class="vl-card-label">Gross Sales</div>
      <div class="vl-card-value">${fmt(s.totalSales)}</div>
      <div class="vl-card-sub">before refunds</div>
    </div>
    <div class="vl-card">
      <div class="vl-card-label">Refunds</div>
      <div class="vl-card-value negative">${fmt(s.totalRefunds)}</div>
      <div class="vl-card-sub">returned to buyers</div>
    </div>
    <div class="vl-card">
      <div class="vl-card-label">Net Sales</div>
      <div class="vl-card-value ${s.net >= 0 ? 'positive' : 'negative'}">${fmt(s.net)}</div>
      <div class="vl-card-sub">gross − refunds</div>
    </div>
    <div class="vl-card">
      <div class="vl-card-label">Commission (8%)</div>
      <div class="vl-card-value blue">${fmt(s.totalCommission)}</div>
      <div class="vl-card-sub">platform fee</div>
    </div>
    <div class="vl-card">
      <div class="vl-card-label">Net to Vendor</div>
      <div class="vl-card-value ${s.netAfterFees >= 0 ? 'positive' : 'negative'}">${fmt(s.netAfterFees)}</div>
      <div class="vl-card-sub">after commission</div>
    </div>
    ${vatCard}
  `;
}

/* ======================================================
   TRANSACTION TABLE
====================================================== */
function renderTable(transactions, summary) {
  const tbody = document.getElementById('vl-table-body');
  if (!tbody) return;

  if (!transactions || !transactions.length) {
    tbody.innerHTML =
      '<tr><td colspan="8" class="vl-loading">No transactions for this period.</td></tr>';
    return;
  }

  tbody.innerHTML = transactions
    .map((t) => {
      const date = new Date(t.date).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const badgeType =
        t.type === 'sale'
          ? 'sale'
          : t.type === 'cancelled'
            ? 'cancelled'
            : t.type === 'returned'
              ? 'returned'
              : t.type === 'return_pending'
                ? 'return_pending'
                : t.type === 'chargeback'
                  ? 'chargeback'
                  : t.type;

      const amountFormatted = t.pending
        ? `<span class="vl-amount-pending">${fmt(t.amount)} (pending)</span>`
        : t.amount >= 0
          ? `<span class="vl-amount-pos">${fmt(t.amount)}</span>`
          : `<span class="vl-amount-neg">${fmt(t.amount)}</span>`;

      const commission =
        t.type === 'sale' && t.commission != null
          ? `<span class="vl-amount-neg">−${fmt(t.commission)}</span>`
          : '—';

      const netToVendor =
        t.type === 'sale' && t.commission != null
          ? (() => {
              const n = (t.amount || 0) - (t.commission || 0);
              return n >= 0
                ? `<span class="vl-amount-pos">${fmt(n)}</span>`
                : `<span class="vl-amount-neg">${fmt(n)}</span>`;
            })()
          : '—';

      const desc = t.description || '—';
      const itemNote = t.itemName
        ? `<div style="font-size:10px;color:#9ca3af">${t.itemName}${t.qty ? ` ×${t.qty}` : ''}</div>`
        : '';

      return `<tr>
      <td style="white-space:nowrap">${date}</td>
      <td><span class="vl-order-id">${t.displayId || '—'}</span></td>
      <td><span class="vl-buyer">${t.buyerEmail || '—'}</span></td>
      <td><span class="vl-badge ${badgeType}">${badgeType.replace('_', ' ')}</span></td>
      <td>${desc}${itemNote}</td>
      <td class="vl-num">${amountFormatted}</td>
      <td class="vl-num">${commission}</td>
      <td class="vl-num">${netToVendor}</td>
    </tr>`;
    })
    .join('');
}

/* ======================================================
   COUNT + TRUNCATION
====================================================== */
function renderCount(showing, total, truncated) {
  const countEl = document.getElementById('vl-count');
  if (countEl)
    countEl.textContent = `Showing ${showing} of ${total} order${total !== 1 ? 's' : ''}`;

  const truncEl = document.getElementById('vl-truncated');
  if (truncEl) {
    if (truncated) {
      truncEl.textContent = `Only the most recent 500 orders are shown (${total} total). Use period filters to narrow the range.`;
      truncEl.classList.remove('vl-truncated--hidden');
    } else {
      truncEl.classList.add('vl-truncated--hidden');
    }
  }
}

/* ======================================================
   PERIOD FILTER
====================================================== */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.vl-filter-btn[data-period]');
  if (!btn) return;
  document
    .querySelectorAll('.vl-filter-btn[data-period]')
    .forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  currentPeriod = btn.dataset.period;
  loadLedger();
});

/* ======================================================
   TYPE FILTER
====================================================== */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.vl-filter-btn[data-type]');
  if (!btn) return;
  document
    .querySelectorAll('.vl-filter-btn[data-type]')
    .forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  currentType = btn.dataset.type;
  loadLedger();
});

/* ======================================================
   CSV EXPORT
====================================================== */
document.addEventListener('click', (e) => {
  if (!e.target.closest('#vl-export-csv')) return;
  if (!lastData || !lastData.transactions || !lastData.transactions.length) {
    alert('No data to export.');
    return;
  }

  const v = lastData.vendor || {};
  const header = [
    'Date',
    'Order ID',
    'Buyer Email',
    'Type',
    'Description',
    'Item',
    'Qty',
    'Amount (£)',
    'Commission (£)',
    'Net to Vendor (£)',
  ];
  const rows = lastData.transactions.map((t) => {
    const date = new Date(t.date).toLocaleDateString('en-GB');
    const net =
      t.type === 'sale' && t.commission != null
        ? Number(((t.amount || 0) - (t.commission || 0)).toFixed(2))
        : '';
    return [
      date,
      t.displayId || '',
      t.buyerEmail || '',
      t.type,
      `"${(t.description || '').replace(/"/g, '""')}"`,
      `"${(t.itemName || '').replace(/"/g, '""')}"`,
      t.qty || '',
      Number(t.amount || 0).toFixed(2),
      t.commission != null ? Number(t.commission).toFixed(2) : '',
      net !== '' ? Number(net).toFixed(2) : '',
    ].join(',');
  });

  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const periodLabel = currentPeriod !== 'all' ? `-${currentPeriod}` : '';
  const slug = v.storeSlug || String(v._id || 'vendor');
  const a = document.createElement('a');
  a.href = url;
  a.download = `ledger-${slug}${periodLabel}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});
