// ======================================================
// VENDOR PAYOUTS
// ======================================================

const API = window.API_BASE;

function authFetch(url, opts = {}) {
  const token = localStorage.getItem('s4l_token');
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...opts, credentials: 'include', headers });
}

function fmt(n) { return '£' + Number(n || 0).toFixed(2); }

async function load() {
  const wrap = document.getElementById('payouts-wrap');
  try {
    const res = await authFetch(`${API}/vendor/payouts`);
    if (res.status === 401) { window.location.href = '/account/signin.html'; return; }
    const data = await res.json();
    render(data, wrap);
  } catch (err) {
    console.error('Payouts load error:', err);
    wrap.innerHTML = '<p style="color:#b91c1c">Failed to load payouts.</p>';
  }
}

function render(data, wrap) {
  const b = data;
  const payouts = data.payouts || [];

  const requestSection = data.hasPendingRequest
    ? `<div class="payout-pending-note">
        You have a payout request pending. Once processed by admin it will appear in the history below.
       </div>`
    : `<div class="payout-request-box">
        <h3>Request a Payout</h3>
        <p style="font-size:13px;color:#374151;margin:0 0 12px">
          Available balance: <strong>${fmt(b.pendingBalance)}</strong>
          ${b.pendingBalance < data.minimumPayout
            ? `<span style="color:#9ca3af;margin-left:6px">(minimum ${fmt(data.minimumPayout)})</span>`
            : ''}
        </p>
        <button type="button" class="payout-request-btn" id="request-btn"
          ${b.pendingBalance < data.minimumPayout ? 'disabled' : ''}>
          Request ${fmt(b.pendingBalance)}
        </button>
        <div class="payout-msg" id="payout-msg"></div>
       </div>`;

  const historyRows = payouts.length
    ? payouts.map(p => {
        const date = new Date(p.requestedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
        const paidDate = p.paidAt ? new Date(p.paidAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
        return `<tr>
          <td>${date}</td>
          <td><strong>${fmt(p.amount)}</strong></td>
          <td><span class="payout-status ${p.status}">${p.status}</span></td>
          <td>${paidDate}</td>
          <td style="font-size:11px;color:#6b7280">${p.reference || '—'}</td>
        </tr>`;
      }).join('')
    : `<tr><td colspan="5" class="payout-empty">No payout history yet.</td></tr>`;

  wrap.innerHTML = `
    <div class="payout-cards">
      <div class="payout-card">
        <div class="payout-card-label">Available</div>
        <div class="payout-card-value highlight">${fmt(b.pendingBalance)}</div>
        <div class="payout-card-sub">ready to request</div>
      </div>
      <div class="payout-card">
        <div class="payout-card-label">Net Sales</div>
        <div class="payout-card-value">${fmt(b.netAfterFees)}</div>
        <div class="payout-card-sub">after commission</div>
      </div>
      <div class="payout-card">
        <div class="payout-card-label">Total Paid Out</div>
        <div class="payout-card-value">${fmt(b.totalPaidOut)}</div>
        <div class="payout-card-sub">received so far</div>
      </div>
      <div class="payout-card">
        <div class="payout-card-label">Commission</div>
        <div class="payout-card-value negative">${fmt(b.commission)}</div>
        <div class="payout-card-sub">8% platform fee</div>
      </div>
    </div>

    ${requestSection}

    <div class="payout-history-title">Payout History</div>
    <table class="payout-table">
      <thead>
        <tr>
          <th>Requested</th>
          <th>Amount</th>
          <th>Status</th>
          <th>Paid On</th>
          <th>Reference</th>
        </tr>
      </thead>
      <tbody>${historyRows}</tbody>
    </table>
  `;

  const btn = document.getElementById('request-btn');
  if (btn) {
    btn.addEventListener('click', async () => {
      if (!confirm(`Request a payout of ${fmt(b.pendingBalance)}?`)) return;
      btn.disabled = true;
      btn.textContent = 'Requesting…';
      const msgEl = document.getElementById('payout-msg');
      try {
        const res = await authFetch(`${API}/vendor/payouts/request`, { method: 'POST' });
        const json = await res.json();
        if (!res.ok) {
          msgEl.textContent = json.error || 'Request failed.';
          msgEl.className = 'payout-msg error';
          btn.disabled = false;
          btn.textContent = `Request ${fmt(b.pendingBalance)}`;
        } else {
          msgEl.textContent = 'Payout request submitted. Admin will process it shortly.';
          msgEl.className = 'payout-msg success';
          setTimeout(() => load(), 1500);
        }
      } catch {
        msgEl.textContent = 'Network error.';
        msgEl.className = 'payout-msg error';
        btn.disabled = false;
        btn.textContent = `Request ${fmt(b.pendingBalance)}`;
      }
    });
  }
}

load();
