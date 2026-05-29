// ======================================================
// ADMIN CHARGEBACKS / DISPUTES
// ======================================================

const API = window.API_BASE;

function authFetch(url, opts = {}) {
  const token = localStorage.getItem('s4l_token');
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...opts, credentials: 'include', headers });
}

const STATUS_LABELS = {
  needs_response: 'Needs Response',
  under_review: 'Under Review',
  won: 'Won',
  lost: 'Lost',
  charge_refunded: 'Charge Refunded',
  warning_closed: 'Closed',
};

(async function load() {
  const body = document.getElementById('dp-body');
  try {
    const res = await authFetch(`${API}/admin/vendors/disputes`);
    if (res.status === 401 || res.status === 403) {
      window.location.href = '/account/admin/signin.html';
      return;
    }
    const { disputes } = await res.json();

    if (!disputes.length) {
      body.innerHTML = '<div class="dp-empty">No chargebacks found.</div>';
      return;
    }

    body.innerHTML = disputes.map((d) => renderCard(d)).join('');

    // Toggle expand
    body.addEventListener('click', (e) => {
      const header = e.target.closest('.dp-card-header');
      if (!header) return;
      const cardBody = header.nextElementSibling;
      const icon = header.querySelector('.dp-expand');
      cardBody.classList.toggle('open');
      if (icon) icon.textContent = cardBody.classList.contains('open') ? '▲' : '▼';
    });

    // Form submissions
    body.addEventListener('click', async (e) => {
      const btn = e.target.closest('.dp-btn-save, .dp-btn-submit');
      if (!btn) return;
      const card = btn.closest('.dp-card');
      const disputeId = card.dataset.disputeId;
      const shouldSubmit = btn.classList.contains('dp-btn-submit');
      await submitEvidence(card, disputeId, shouldSubmit);
    });
  } catch (err) {
    console.error('Disputes load error:', err);
    body.innerHTML = '<div class="dp-empty">Failed to load chargebacks.</div>';
  }
})();

function renderCard(d) {
  const statusLabel = STATUS_LABELS[d.status] || d.status;
  const dueStr = d.evidenceDueBy
    ? `Due ${new Date(d.evidenceDueBy).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`
    : '';
  const createdStr = new Date(d.createdAt).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
  const reason = (d.reason || '').replace(/_/g, ' ');

  const canRespond = ['needs_response', 'under_review'].includes(d.status);

  return `<div class="dp-card" data-dispute-id="${esc(d.stripeDisputeId)}">
    <div class="dp-card-header">
      <span class="dp-order-ref">Order ${esc(d.orderRef)}</span>
      <span class="dp-amount">–£${Number(d.amount).toFixed(2)}</span>
      <span class="dp-status ${esc(d.status)}">${esc(statusLabel)}</span>
      ${dueStr ? `<span class="dp-due">${esc(dueStr)}</span>` : ''}
      <span class="dp-meta">${esc(d.buyerEmail)} · ${esc(createdStr)}</span>
      <span class="dp-stripe-id">${esc(d.stripeDisputeId)}</span>
      <span class="dp-expand">▼</span>
    </div>
    <div class="dp-card-body">
      <div class="dp-reason">
        <strong>Dispute Reason</strong>${esc(reason) || '—'}
      </div>
      ${
        canRespond
          ? `
      <div class="dp-field">
        <label>Product / Service Description</label>
        <textarea name="product_description" placeholder="Describe the product or service delivered…"></textarea>
      </div>
      <div class="dp-field">
        <label>Customer Communication</label>
        <textarea name="customer_communication" placeholder="Paste any relevant emails, messages, or transcripts…"></textarea>
      </div>
      <div class="dp-field">
        <label>Additional Evidence</label>
        <textarea name="uncategorized_text" placeholder="Any other supporting information…"></textarea>
      </div>
      <div class="dp-field">
        <label>Customer Name (on receipt)</label>
        <input type="text" name="customer_name" placeholder="Full name as on order" />
      </div>
      <div class="dp-actions">
        <button type="button" class="dp-btn-save">Save Draft</button>
        <button type="button" class="dp-btn-submit">Submit to Stripe</button>
        <span class="dp-msg"></span>
      </div>`
          : `<p style="font-size:13px;color:#6b7280;margin:0">This dispute is <strong>${esc(statusLabel)}</strong> — no further evidence can be submitted.</p>`
      }
    </div>
  </div>`;
}

async function submitEvidence(card, disputeId, shouldSubmit) {
  const msgEl = card.querySelector('.dp-msg');
  const btns = card.querySelectorAll('.dp-btn-save, .dp-btn-submit');
  btns.forEach((b) => {
    b.disabled = true;
  });
  if (msgEl) {
    msgEl.textContent = 'Saving…';
    msgEl.className = 'dp-msg';
  }

  const body = {
    product_description: card.querySelector('[name="product_description"]')?.value || '',
    customer_communication: card.querySelector('[name="customer_communication"]')?.value || '',
    uncategorized_text: card.querySelector('[name="uncategorized_text"]')?.value || '',
    customer_name: card.querySelector('[name="customer_name"]')?.value || '',
    submit: shouldSubmit,
  };

  try {
    const res = await authFetch(
      `${API}/admin/vendors/disputes/${encodeURIComponent(disputeId)}/respond`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      }
    );
    const json = await res.json();
    if (!res.ok) {
      if (msgEl) {
        msgEl.textContent = json.error || 'Error.';
        msgEl.className = 'dp-msg error';
      }
    } else {
      if (msgEl) {
        msgEl.textContent = shouldSubmit ? 'Submitted to Stripe.' : 'Draft saved.';
        msgEl.className = 'dp-msg success';
      }
    }
  } catch {
    if (msgEl) {
      msgEl.textContent = 'Network error.';
      msgEl.className = 'dp-msg error';
    }
  } finally {
    btns.forEach((b) => {
      b.disabled = false;
    });
  }
}

function esc(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
