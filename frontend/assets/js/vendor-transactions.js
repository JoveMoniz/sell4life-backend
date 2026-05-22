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

    const banner = document.getElementById('txn-truncation-banner');
    if (banner) {
      if (data.truncated) {
        banner.textContent = `Showing ${data.showing} of ${data.totalOrders} orders. Use period filters to narrow the range, or export CSV for complete data.`;
        banner.hidden = false;
      } else {
        banner.hidden = true;
      }
    }

    document.getElementById('txn-sales').textContent = '£' + Number(summary.totalSales || 0).toFixed(2);
    document.getElementById('txn-refunds').textContent = '£' + Number(summary.totalRefunds || 0).toFixed(2);

    const feeEl = document.getElementById('txn-commission');
    if (feeEl) feeEl.textContent = '£' + Number(summary.totalCommission || 0).toFixed(2);

    const net = Number(summary.netAfterFees ?? summary.net ?? 0);
    const netEl = document.getElementById('txn-net');
    netEl.textContent = '£' + net.toFixed(2);
    netEl.className = net < 0 ? 'txn-negative' : '';

    if (!txns.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="txn-empty">No transactions for this period</td></tr>';
      return;
    }

    const rows = [];
    txns.forEach(t => {
      const date = new Date(t.date).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      });

      const isSale = t.type === 'sale';
      const isPending = t.pending === true;
      const amountClass = isSale ? 'txn-positive' : isPending ? 'txn-pending' : 'txn-negative';
      const amountSign = isSale ? '+' : '-';
      const amount = Number(t.amount || 0).toFixed(2);
      const displayId = t.displayId || t.orderId;

      rows.push(`
<tr class="txn-row ${isSale ? 'txn-row-sale' : 'txn-row-refund'}${isPending ? ' txn-row-pending' : ''}">
  <td class="txn-date">${date}</td>
  <td class="txn-order">
    <a href="/account/vendor/order-details.html?id=${t.orderId}">${displayId}</a>
  </td>
  <td class="txn-desc">${t.description || ''}</td>
  <td class="txn-item">${t.itemName || '-'}</td>
  <td class="txn-qty">${t.qty != null ? t.qty : '-'}</td>
  <td class="txn-amount ${amountClass}">${amountSign}£${amount}</td>
</tr>`);

      if (isSale && Number(t.commission) > 0) {
        rows.push(`
<tr class="txn-row txn-row-commission">
  <td class="txn-date"></td>
  <td class="txn-order"></td>
  <td class="txn-desc txn-commission-label" colspan="3">Platform fee (8%)</td>
  <td class="txn-amount txn-commission-amount">-£${Number(t.commission).toFixed(2)}</td>
</tr>`);
      }
    });
    tbody.innerHTML = rows.join('');

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

  const rows = [];
  lastTransactions.forEach(t => {
    const date = new Date(t.date).toLocaleDateString('en-GB');
    const sign = t.type === 'sale' ? '' : '-';
    rows.push([
      date,
      t.displayId || t.orderId,
      t.type,
      `"${(t.description || '').replace(/"/g, '""')}"`,
      `"${(t.itemName || '').replace(/"/g, '""')}"`,
      t.qty != null ? t.qty : '',
      `${sign}${Number(t.amount || 0).toFixed(2)}`,
    ].join(','));

    if (t.type === 'sale' && Number(t.commission) > 0) {
      rows.push([
        date,
        t.displayId || t.orderId,
        'commission',
        '"Platform fee (8%)"',
        '',
        '',
        `-${Number(t.commission).toFixed(2)}`,
      ].join(','));
    }
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
   PAYOUTS
====================================================== */
async function loadPayouts() {
  const balanceEl = document.getElementById('payout-balance');
  const noteEl    = document.getElementById('payout-balance-note');
  const btn       = document.getElementById('btn-request-payout');
  const tbody     = document.getElementById('payout-history-body');

  try {
    const res = await authFetch(`${API_BASE}/vendor/payouts`);
    if (!res.ok) return;
    const data = await res.json();

    if (balanceEl) {
      balanceEl.textContent = '£' + Number(data.pendingBalance || 0).toFixed(2);
    }

    if (btn && noteEl) {
      if (data.hasPendingRequest) {
        btn.disabled = true;
        btn.textContent = 'Request Pending…';
        noteEl.textContent = 'Your request has been received. We will process it shortly.';
      } else if (data.pendingBalance < data.minimumPayout) {
        btn.disabled = true;
        noteEl.textContent = `Minimum payout is £${data.minimumPayout}. Keep selling!`;
      } else {
        btn.disabled = false;
        noteEl.textContent = '';
      }
    }

    if (tbody) {
      if (!data.payouts || !data.payouts.length) {
        tbody.innerHTML = '<tr><td colspan="4" class="txn-empty">No payouts yet</td></tr>';
      } else {
        tbody.innerHTML = data.payouts.map(p => {
          const date = new Date(p.paidAt || p.requestedAt).toLocaleDateString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
          });
          const statusClass = p.status === 'paid' ? 'payout-status-paid'
            : p.status === 'rejected' ? 'payout-status-rejected'
            : 'payout-status-pending';
          const ref = p.reference || (p.note ? `<em>${p.note}</em>` : '—');
          return `<tr>
  <td>${date}</td>
  <td>£${Number(p.amount).toFixed(2)}</td>
  <td><span class="payout-status ${statusClass}">${p.status}</span></td>
  <td>${ref}</td>
</tr>`;
        }).join('');
      }
    }
  } catch (err) {
    console.error('Payout load error:', err);
  }
}

document.addEventListener('click', async (e) => {
  if (!e.target.closest('#btn-request-payout')) return;
  const btn = document.getElementById('btn-request-payout');
  if (!btn || btn.disabled) return;

  if (!confirm('Request a payout for your full available balance?\n\nWe will process it via bank transfer within 3–5 business days.')) return;

  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    const res = await authFetch(`${API_BASE}/vendor/payouts/request`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Payout request failed.');
      btn.disabled = false;
      btn.textContent = 'Request Payout';
      return;
    }
    loadPayouts();
  } catch (err) {
    alert('Network error. Please try again.');
    btn.disabled = false;
    btn.textContent = 'Request Payout';
  }
});

/* ======================================================
   INIT
====================================================== */
loadTransactions();
loadPayouts();
