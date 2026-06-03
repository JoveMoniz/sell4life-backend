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
let lastRows = [];
let txnPage = 1;
const TXN_PER_PAGE = 25;

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
    const reserveRate = Number(summary.reserveRate || 0.10);

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

    const stripeEl = document.getElementById('txn-stripe');
    if (stripeEl) stripeEl.textContent = '£' + Number(summary.totalStripeFees || 0).toFixed(2);

    const vatCard = document.getElementById('txn-vat-card');
    const vatEl   = document.getElementById('txn-vat');
    if (vatCard && vatEl) {
      if (summary.vatRegistered) {
        vatEl.textContent = '£' + Number(summary.totalVat || 0).toFixed(2);
        vatCard.hidden = false;
      } else {
        vatCard.hidden = true;
      }
    }

    const vatBar = document.getElementById('vat-status-bar');
    if (vatBar) vatBar.dataset.vatRegistered = String(summary.vatRegistered === true);
    updateVatStatusBar(summary);

    const net = Number(summary.netAfterFees ?? summary.net ?? 0);
    const netEl = document.getElementById('txn-net');
    netEl.textContent = '£' + net.toFixed(2);
    netEl.className = net < 0 ? 'txn-negative' : '';

    if (!txns.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="txn-empty">No transactions for this period</td></tr>';
      lastRows = [];
      renderTxnPagination();
      return;
    }

    // Each entry = all <tr>s for one transaction (so pagination cuts cleanly between transactions)
    const rows = [];
    txns.forEach(t => {
      const date = new Date(t.date).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
      });

      const isSale = t.type === 'sale';
      const isChargeback = t.type === 'chargeback';
      const isPending = t.pending === true;

      let amountClass, amountSign, rowClass;
      if (isSale) {
        amountClass = 'txn-positive'; amountSign = '+'; rowClass = 'txn-row-sale';
      } else if (isChargeback && isPending) {
        amountClass = 'txn-chargeback-pending'; amountSign = ''; rowClass = 'txn-row-chargeback-pending';
      } else if (isChargeback) {
        amountClass = 'txn-negative'; amountSign = '-'; rowClass = 'txn-row-chargeback';
      } else if (isPending) {
        amountClass = 'txn-pending'; amountSign = '-'; rowClass = 'txn-row-refund txn-row-pending';
      } else {
        amountClass = 'txn-negative'; amountSign = '-'; rowClass = 'txn-row-refund';
      }

      const amount = Number(Math.abs(t.amount) || 0).toFixed(2);
      const displayId = t.displayId || t.orderId;

      let dueByNote = '';
      if (isChargeback && isPending && t.evidenceDueBy) {
        const due = new Date(t.evidenceDueBy).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
        dueByNote = ` <span class="txn-chargeback-due">Evidence due ${due}</span>`;
      }

      const txnRows = [];
      txnRows.push(`
<tr class="txn-row ${rowClass}">
  <td class="txn-date">${date}</td>
  <td class="txn-order">
    <a href="/account/vendor/order-details.html?id=${t.orderId}">${displayId}</a>
  </td>
  <td class="txn-desc">${t.description || ''}${dueByNote}</td>
  <td class="txn-item">${t.itemName || '-'}</td>
  <td class="txn-qty">${t.qty != null ? t.qty : '-'}</td>
  <td class="txn-amount ${amountClass}">${isPending && isChargeback ? '⚠ pending' : amountSign + '£' + amount}</td>
</tr>`);

      if (isSale && Number(t.commission) > 0) {
        txnRows.push(`
<tr class="txn-row txn-row-commission">
  <td class="txn-date"></td>
  <td class="txn-order"></td>
  <td class="txn-desc txn-commission-label" colspan="3">Platform fee (8%)</td>
  <td class="txn-amount txn-commission-amount">-£${Number(t.commission).toFixed(2)}</td>
</tr>`);
      }

      if (isSale && Number(t.amount) > 0) {
        const reserveAmt = Number((Math.abs(t.amount) * reserveRate).toFixed(2));
        const reservePct = Math.round(reserveRate * 100);
        txnRows.push(`
<tr class="txn-row txn-row-reserve">
  <td class="txn-date"></td>
  <td class="txn-order"></td>
  <td class="txn-desc txn-reserve-label" colspan="3">Reserve held (${reservePct}%) <span class="txn-reserve-note">releases at 90 days</span></td>
  <td class="txn-amount txn-reserve-amount">-£${reserveAmt.toFixed(2)}</td>
</tr>`);
      }

      if (isSale && Number(t.stripeFee) > 0) {
        const est = t.stripeIsEstimated ? ' (est.)' : '';
        txnRows.push(`
<tr class="txn-row txn-row-stripe">
  <td class="txn-date"></td>
  <td class="txn-order"></td>
  <td class="txn-desc txn-stripe-label" colspan="3">Stripe fee${est} <span class="txn-stripe-note">covered by platform</span></td>
  <td class="txn-amount txn-stripe-amount">£${Number(t.stripeFee).toFixed(2)}</td>
</tr>`);
      }

      if (isSale && Number(t.vatAmount) > 0) {
        txnRows.push(`
<tr class="txn-row txn-row-vat">
  <td class="txn-date"></td>
  <td class="txn-order"></td>
  <td class="txn-desc txn-vat-label" colspan="3">VAT to HMRC (20%) <span class="txn-vat-info">not deducted from payout</span></td>
  <td class="txn-amount txn-vat-amount">£${Number(t.vatAmount).toFixed(2)}</td>
</tr>`);
      }

      rows.push(txnRows.join(''));
    });
    lastRows = rows;
    txnPage = 1;
    renderTxnPage(1);

  } catch (err) {
    console.error('Transactions load error:', err);
    tbody.innerHTML = '<tr><td colspan="6">Could not load transactions</td></tr>';
  }
}

/* ======================================================
   PAGINATION
====================================================== */
function renderTxnPage(page) {
  const tbody = document.getElementById('txn-body');
  if (!tbody) return;

  const start = (page - 1) * TXN_PER_PAGE;
  const end = start + TXN_PER_PAGE;
  tbody.innerHTML = lastRows.slice(start, end).join('');
  txnPage = page;
  renderTxnPagination();
}

function renderTxnPagination() {
  const container = document.getElementById('txn-pagination');
  if (!container) return;

  const totalPages = Math.ceil(lastRows.length / TXN_PER_PAGE);
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  const parts = [];
  parts.push(`<span class="txn-page-info">Page ${txnPage} of ${totalPages}</span>`);

  const prev = txnPage > 1;
  parts.push(`<button class="txn-pg-btn" data-pg="${txnPage - 1}" ${prev ? '' : 'disabled'}>‹ Prev</button>`);

  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - txnPage) <= 1) {
      parts.push(`<button class="txn-pg-btn ${p === txnPage ? 'active' : ''}" data-pg="${p}">${p}</button>`);
    } else if (Math.abs(p - txnPage) === 2) {
      parts.push(`<span class="txn-pg-ellipsis">…</span>`);
    }
  }

  const next = txnPage < totalPages;
  parts.push(`<button class="txn-pg-btn" data-pg="${txnPage + 1}" ${next ? '' : 'disabled'}>Next ›</button>`);

  container.innerHTML = parts.join('');
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.txn-pg-btn');
  if (!btn || btn.disabled) return;
  const pg = parseInt(btn.dataset.pg, 10);
  if (pg && pg !== txnPage) {
    renderTxnPage(pg);
    document.querySelector('.txn-table-wrap')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
});

/* ======================================================
   PERIOD FILTER
====================================================== */
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.period-btn');
  if (!btn) return;

  document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  currentPeriod = btn.dataset.period;
  txnPage = 1;
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
  txnPage = 1;
  loadTransactions();
});

/* ======================================================
   CSV EXPORT
====================================================== */
document.addEventListener('click', (e) => {
  if (!e.target.closest('#btn-export-csv')) return;

  if (!lastTransactions.length) {
    showAlert('No transactions to export.');
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

    if (t.type === 'sale' && Number(t.stripeFee) > 0) {
      rows.push([
        date,
        t.displayId || t.orderId,
        'stripe_fee',
        `"Stripe fee${t.stripeIsEstimated ? ' (est.)' : ''} - covered by platform"`,
        '',
        '',
        `${Number(t.stripeFee).toFixed(2)}`,
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
   VAT STATUS BAR
====================================================== */
function updateVatStatusBar(summary) {
  const bar    = document.getElementById('vat-status-bar');
  const text   = document.getElementById('vat-status-text');
  const btn    = document.getElementById('btn-vat-toggle');
  const numWrap = document.getElementById('vat-number-wrap');
  const numInput = document.getElementById('vat-number-input');
  if (!bar || !text || !btn) return;

  bar.hidden = false;

  if (summary.vatRegistered) {
    text.textContent = `VAT registered${summary.vatNumber ? ` · ${summary.vatNumber}` : ''}.`;
    btn.textContent = 'Remove VAT registration';
    if (numWrap) numWrap.hidden = true;
  } else {
    text.textContent = 'Not VAT registered.';
    btn.textContent = 'I am VAT registered';
    if (numWrap) numWrap.hidden = false;
    if (numInput && summary.vatNumber) numInput.value = summary.vatNumber;
  }
}

document.addEventListener('click', async (e) => {
  if (!e.target.closest('#btn-vat-toggle')) return;
  const bar    = document.getElementById('vat-status-bar');
  const numInput = document.getElementById('vat-number-input');
  const isCurrentlyRegistered = bar?.dataset.vatRegistered === 'true';

  const newStatus = !isCurrentlyRegistered;
  const vatNumber = (!isCurrentlyRegistered && numInput) ? numInput.value.trim() : '';

  try {
    const res = await authFetch(`${API_BASE}/vendor/vat`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vatRegistered: newStatus, vatNumber }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Failed to update VAT status', 'error'); return; }
    if (bar) bar.dataset.vatRegistered = String(data.vatRegistered);
    loadTransactions();
  } catch (err) {
    showToast('Network error. Please try again.', 'error');
  }
});

document.addEventListener('click', async (e) => {
  if (!e.target.closest('#btn-vat-save')) return;
  const numInput = document.getElementById('vat-number-input');
  const vatNumber = numInput ? numInput.value.trim() : '';

  try {
    const res = await authFetch(`${API_BASE}/vendor/vat`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vatRegistered: true, vatNumber }),
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Invalid VAT number', 'error'); return; }
    const bar = document.getElementById('vat-status-bar');
    if (bar) bar.dataset.vatRegistered = 'true';
    loadTransactions();
  } catch (err) {
    showToast('Network error. Please try again.', 'error');
  }
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
    const data = res.ok ? await res.json() : {};

    if (balanceEl) {
      balanceEl.textContent = '£' + Number(data.pendingBalance || 0).toFixed(2);
    }

    // Reserve summary card — always visible
    const reserveCard  = document.getElementById('txn-reserve-card');
    const reserveVal   = document.getElementById('txn-reserve');
    const reserveLabel = document.getElementById('txn-reserve-label');
    if (reserveCard) {
      if (reserveVal) reserveVal.textContent = '£' + Number(data.reservedBalance || 0).toFixed(2);
      if (reserveLabel) {
        const rate    = Math.round((data.reserveRate || 0.10) * 100);
        const trusted = data.trustedSeller ? ' · ✓ Trusted' : '';
        reserveLabel.textContent = `In Reserve (${rate}%${trusted})`;
      }
      reserveCard.hidden = false;
    }

    // Reserved balance + trusted seller display
    const reserveEl = document.getElementById('payout-reserved');
    if (reserveEl) {
      const rate    = Math.round((data.reserveRate || 0.10) * 100);
      const held    = Number(data.reservedBalance || 0).toFixed(2);
      const releaseDate = data.nextReserveReleaseDate
        ? new Date(data.nextReserveReleaseDate).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        : null;
      const trustedText = data.trustedSeller
        ? '<span style="color:#15803d;font-weight:600">✓ Trusted Seller — 5% rate</span>'
        : `<span style="color:#9ca3af">6 months clean → 5% rate</span>`;
      reserveEl.innerHTML = `<span style="font-size:0.78rem;color:#6b7280">
        £${held} in reserve (${rate}%)${releaseDate ? ` · next release ${releaseDate}` : ''} · ${trustedText}
      </span>`;
      reserveEl.style.display = 'block';
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

  if (!await showConfirm('Request a payout for your full available balance?\n\nWe will process it via bank transfer within 3–5 business days.')) return;

  btn.disabled = true;
  btn.textContent = 'Sending…';

  try {
    const res = await authFetch(`${API_BASE}/vendor/payouts/request`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Payout request failed.', 'error');
      btn.disabled = false;
      btn.textContent = 'Request Payout';
      return;
    }
    loadPayouts();
  } catch (err) {
    showToast('Network error. Please try again.', 'error');
    btn.disabled = false;
    btn.textContent = 'Request Payout';
  }
});

/* ======================================================
   INIT
====================================================== */
loadTransactions();
loadPayouts();
