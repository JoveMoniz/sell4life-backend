// ======================================================
// VENDOR TRANSACTIONS LEDGER
// ======================================================

function authFetch(url, opts = {}) {
  const token = localStorage.getItem('s4l_token');
  const headers = { ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...opts, credentials: 'include', headers });
}

let currentPeriod = 'all';
let currentType = 'all';
let lastTransactions = [];

/* ======================================================
   LOAD TRANSACTIONS
====================================================== */
async function loadTransactions() {
  const tbody = document.getElementById('txn-body');
  if (!tbody) return;

  tbody.innerHTML = '<tr><td colspan="6" class="txn-loading">Loading...</td></tr>';

  try {
    const params = [];
    if (currentPeriod && currentPeriod !== 'all') params.push(`period=${currentPeriod}`);
    if (currentType && currentType !== 'all') params.push(`type=${currentType}`);

    const url = `${API_BASE}/vendor/transactions${params.length ? '?' + params.join('&') : ''}`;
    const res = await authFetch(url);

    if (!res.ok) {
      tbody.innerHTML = '<tr><td colspan="6">Failed to load transactions</td></tr>';
      return;
    }

    const data = await res.json();
    const txns = data.transactions || [];
    const summary = data.summary || {};

    lastTransactions = txns;

    document.getElementById('txn-sales').textContent = '£' + Number(summary.totalSales || 0).toFixed(2);
    document.getElementById('txn-refunds').textContent = '£' + Number(summary.totalRefunds || 0).toFixed(2);

    const net = Number(summary.net || 0);
    const netEl = document.getElementById('txn-net');
    netEl.textContent = '£' + net.toFixed(2);
    netEl.className = net < 0 ? 'txn-negative' : '';

    if (!txns.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="txn-empty">No transactions for this period</td></tr>';
      return;
    }

    tbody.innerHTML = txns.map(t => {
      const date = new Date(t.date).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      });

      const isSale = t.type === 'sale';
      const isPending = t.pending === true;
      const amountClass = isSale ? 'txn-positive' : isPending ? 'txn-pending' : 'txn-negative';
      const amountSign = isSale ? '+' : '-';
      const amount = Number(t.amount || 0).toFixed(2);

      const displayId = t.displayId || t.orderId;

      return `
<tr class="txn-row ${isSale ? 'txn-row-sale' : 'txn-row-refund'}${isPending ? ' txn-row-pending' : ''}">
  <td class="txn-date">${date}</td>
  <td class="txn-order">
    <a href="/account/vendor/order-details.html?id=${t.orderId}">${displayId}</a>
  </td>
  <td class="txn-desc">${t.description || ''}</td>
  <td class="txn-item">${t.itemName || '-'}</td>
  <td class="txn-qty">${t.qty != null ? t.qty : '-'}</td>
  <td class="txn-amount ${amountClass}">${amountSign}£${amount}</td>
</tr>`;
    }).join('');

  } catch (err) {
    console.error('Transactions load error:', err);
    tbody.innerHTML = '<tr><td colspan="6">Could not load transactions</td></tr>';
  }
}

/* ======================================================
   PERIOD FILTER
====================================================== */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.period-btn');
  if (!btn) return;

  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentPeriod = btn.dataset.period;
  loadTransactions();
});

/* ======================================================
   TYPE FILTER
====================================================== */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.type-btn');
  if (!btn) return;

  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentType = btn.dataset.type;
  loadTransactions();
});

/* ======================================================
   CSV EXPORT
====================================================== */
document.addEventListener('click', (e) => {
  if (!e.target.closest('#btn-export-csv')) return;

  if (!lastTransactions.length) {
    alert('No transactions to export.');
    return;
  }

  const header = ['Date', 'Order ID', 'Type', 'Description', 'Item', 'Qty', 'Amount (£)'];

  const rows = lastTransactions.map(t => {
    const date = new Date(t.date).toLocaleDateString('en-GB');
    const sign = t.type === 'sale' ? '' : '-';
    return [
      date,
      t.displayId || t.orderId,
      t.type,
      `"${(t.description || '').replace(/"/g, '""')}"`,
      `"${(t.itemName || '').replace(/"/g, '""')}"`,
      t.qty != null ? t.qty : '',
      `${sign}${Number(t.amount || 0).toFixed(2)}`,
    ].join(',');
  });

  const csv = [header.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const label = currentPeriod !== 'all' ? `-${currentPeriod}` : '';
  const a = document.createElement('a');
  a.href = url;
  a.download = `transactions${label}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

/* ======================================================
   INIT
====================================================== */
loadTransactions();
