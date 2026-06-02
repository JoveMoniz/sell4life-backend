// ======================================================
// ADMIN ORDER DETAILS — per-item refund support
// ======================================================

const API = window.API_BASE;

function authFetch(url, opts = {}) {
  const token = localStorage.getItem('s4l_token');
  const headers = { ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...opts, credentials: 'include', headers });
}

/* ================================
   GET ORDER ID
================================ */
const params = new URLSearchParams(window.location.search);
const orderId = params.get('id');

if (!orderId) {
  window.location.href = '/account/admin/orders.html';
  throw new Error('Missing order ID');
}

/* ================================
   ELEMENTS
================================ */
const statusSelect   = document.getElementById('statusSelect');
const updateBtn      = document.getElementById('updateStatus');
const result         = document.getElementById('result');
const historyList    = document.getElementById('statusHistory');
const productsTable  = document.getElementById('productsTable');
const refundBtn      = document.getElementById('refundBtn');
const cancelRefundBtn = document.getElementById('cancelRefundBtn');
const orderStatusEl  = document.getElementById('orderStatus');

/* ================================
   STATE
================================ */
let currentOrder = null;
let _refundTarget = { itemId: null, maxQty: 0, price: 0 };

/* ================================
   BADGE HELPERS
================================ */
const RETURN_BADGE = {
  requested:          { label: 'Return Requested',   color: '#b45309', bg: '#fef3c7' },
  approved:           { label: 'Return Approved',    color: '#1d4ed8', bg: '#dbeafe' },
  rejected:           { label: 'Return Rejected',    color: '#b91c1c', bg: '#fee2e2' },
  partially_returned: { label: 'Partially Returned', color: '#c2410c', bg: '#ffedd5' },
  returned:           { label: 'Returned',           color: '#15803d', bg: '#dcfce7' },
};

const REFUND_BADGE = {
  scheduled:          { label: 'Refund Scheduled',  color: '#1d4ed8', bg: '#dbeafe' },
  processing:         { label: 'Processing',        color: '#6d28d9', bg: '#ede9fe' },
  processed:          { label: 'Refunded ✓',        color: '#15803d', bg: '#dcfce7' },
  partially_refunded: { label: 'Partially Refunded', color: '#c2410c', bg: '#ffedd5' },
  failed:             { label: 'Refund Failed',     color: '#b91c1c', bg: '#fee2e2' },
};

function badge(map, status) {
  const b = map[status];
  if (!b) return '';
  return `<span style="background:${b.bg};color:${b.color};padding:1px 6px;border-radius:10px;font-size:0.72rem;font-weight:600;white-space:nowrap">${b.label}</span>`;
}

/* ================================
   ITEM REFUND ELIGIBILITY
================================ */
function canItemRefund(item) {
  const refundable = Number(item.returnQuantity || 0) - Number(item.refundedQuantity || 0);
  return (
    ['partially_returned', 'returned'].includes(item.returnStatus) &&
    !['processing', 'processed'].includes(item.refundStatus) &&
    refundable > 0
  );
}

/* ================================
   PAYMENT LABEL (UNIFIED)
================================ */
function getPaymentLabel(state) {
  switch ((state || '').toLowerCase()) {
    case 'paid':               return 'Paid';
    case 'refund_scheduled':   return 'Refund Scheduled';
    case 'refunded':           return 'Refunded';
    case 'partially_refunded': return 'Partially Refunded';
    case 'failed':             return 'Failed';
    default:                   return 'Unpaid';
  }
}

function getAdminLabel(status) {
  const labels = {
    Cancelled:        'Force Cancel',
    'Return Approved': 'Override Approve Return',
    'Return Rejected': 'Override Reject Return',
  };
  return labels[status] || status;
}

/* ================================
   TABLE HEADER EXPANSION
================================ */
function ensureTableHeaders() {
  const table = productsTable?.closest('table');
  if (!table) return;
  const thead = table.querySelector('thead tr');
  if (!thead || thead.querySelector('[data-ext]')) return;
  ['Return', 'Refund', 'Actions'].forEach(label => {
    const th = document.createElement('th');
    th.setAttribute('data-ext', '1');
    th.textContent = label;
    thead.appendChild(th);
  });
}

/* ================================
   REFUND MODAL
================================ */
function ensureRefundModal() {
  if (document.getElementById('itemRefundModal')) return;

  const modal = document.createElement('div');
  modal.id = 'itemRefundModal';
  modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;align-items:center;justify-content:center';

  modal.innerHTML = `
    <div style="background:#fff;border-radius:8px;padding:24px;max-width:400px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.3)">
      <h3 style="margin-top:0;margin-bottom:12px">Refund Item</h3>
      <p id="modalItemName" style="color:#374151;margin-bottom:12px;font-weight:500"></p>

      <label style="display:block;margin-bottom:4px;font-size:0.85rem">
        Quantity (max: <span id="modalMaxQty"></span>):
      </label>
      <input id="modalQtyInput" type="number" min="1"
        style="display:block;width:100%;padding:7px;border:1px solid #d1d5db;border-radius:4px;box-sizing:border-box;margin-bottom:8px;font-size:0.9rem" />

      <p id="modalRefundAmt" style="font-size:0.85rem;color:#6b7280;margin-bottom:16px"></p>

      <div style="display:flex;gap:8px">
        <button id="modalConfirmBtn"
          style="padding:8px 18px;background:#b91c1c;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.9rem">
          Confirm Refund
        </button>
        <button id="modalCancelBtn"
          style="padding:8px 18px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:4px;cursor:pointer;font-size:0.9rem">
          Cancel
        </button>
      </div>
    </div>`;

  document.body.appendChild(modal);
}

function openRefundModal(itemId, itemName, maxQty, price) {
  ensureRefundModal();
  _refundTarget = { itemId, maxQty, price };

  document.getElementById('modalItemName').textContent = itemName;
  document.getElementById('modalMaxQty').textContent   = maxQty;

  const input = document.getElementById('modalQtyInput');
  input.value = maxQty;
  input.max   = maxQty;

  updateModalAmount();

  const modal = document.getElementById('itemRefundModal');
  modal.style.display = 'flex';
}

function updateModalAmount() {
  const qty = Number(document.getElementById('modalQtyInput')?.value || 0);
  const el  = document.getElementById('modalRefundAmt');
  if (el) {
    const amt = (qty * _refundTarget.price).toFixed(2);
    el.textContent = qty > 0 ? `Refund amount: £${amt}` : '';
  }
}

/* ================================
   SELLERS SECTION
================================ */
const VENDOR_STATUS_STYLE = {
  approved:  { label: 'Approved',  bg: '#dcfce7', color: '#15803d' },
  pending:   { label: 'Pending',   bg: '#fef9c3', color: '#92400e' },
  suspended: { label: 'Suspended', bg: '#fee2e2', color: '#b91c1c' },
};

function renderSellers(vendorOrders) {
  const section = document.getElementById('sellersSection');
  const el      = document.getElementById('sellersBody');
  if (!section || !el) return;

  if (!vendorOrders.length) return;
  section.style.display = 'block';

  el.innerHTML = vendorOrders.map(vo => {
      const storeName  = vo.vendorStoreName || vo.vendorName || '';
      const shortVId   = '...' + String(vo.vendorId || '').slice(-6).toUpperCase();
      const subStatus  = vo.status || '—';
      const total     = Number(vo.total || 0).toFixed(2);
      const acct      = VENDOR_STATUS_STYLE[vo.accountStatus] || null;
      const verified  = vo.verified ? '<span title="Verified" style="color:#1d4ed8;font-size:0.75rem">✓ Verified</span>' : '';
      const typeLabel = vo.accountType ? `<span style="font-size:0.75rem;color:#6b7280;text-transform:capitalize">${vo.accountType}</span>` : '';
      const acctBadge = acct
        ? `<span style="background:${acct.bg};color:${acct.color};padding:1px 7px;border-radius:10px;font-size:0.72rem;font-weight:600">${acct.label}</span>`
        : '';
      const emailLink = vo.email
        ? `<a href="mailto:${vo.email}" style="font-size:0.82rem;color:#1d4ed8">${vo.email}</a>`
        : '<span style="font-size:0.82rem;color:#9ca3af">No email</span>';

      return `
        <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-start;padding:10px 0;border-bottom:1px solid #e5e7eb">
          <div style="min-width:160px;flex:1">
            ${storeName ? `<div style="font-weight:600;font-size:0.9rem">${storeName}</div>` : ''}
            <div style="margin-top:${storeName ? 2 : 0}px"><strong style="font-family:monospace;font-size:0.78rem;color:#6b7280">${shortVId}</strong></div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin-top:3px">
              ${acctBadge} ${verified} ${typeLabel}
            </div>
            <div style="margin-top:4px">${emailLink}</div>
          </div>
          <div style="min-width:120px">
            <div style="font-size:0.75rem;color:#6b7280;margin-bottom:2px">Sub-order status</div>
            <span class="status status-${subStatus.toLowerCase().replace(/\s+/g, '-')}" style="font-size:0.8rem">${subStatus}</span>
          </div>
          <div style="min-width:80px;text-align:right">
            <div style="font-size:0.75rem;color:#6b7280;margin-bottom:2px">Subtotal</div>
            <strong>£${total}</strong>
          </div>
        </div>`;
  }).join('');
}

/* ================================
   STATUS HISTORY (split per vendor)
================================ */
function renderStatusHistory(order) {
  historyList.innerHTML = '';

  // Global order activity
  const globalHistory = order.statusHistory || [];
  if (globalHistory.length) {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'margin-bottom:16px';

    const label = document.createElement('div');
    label.style.cssText = 'font-size:0.75rem;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:6px';
    label.textContent = 'Order Activity';
    wrap.appendChild(label);

    globalHistory.slice()
      .sort((a, b) => {
        const diff = new Date(b.date) - new Date(a.date);
        if (diff !== 0) return diff;
        const rank = { Cancelled: 0, Refunded: 1, Refund: 2 };
        const ra = Object.keys(rank).find(k => String(a.status).includes(k));
        const rb = Object.keys(rank).find(k => String(b.status).includes(k));
        return (rank[ra] ?? 99) - (rank[rb] ?? 99);
      })
      .forEach(h => {
        const row = document.createElement('div');
        row.style.cssText = 'font-size:0.82rem;color:#374151;margin-bottom:3px';
        row.innerHTML = `<span style="color:#9ca3af">${new Date(h.date).toLocaleString()}</span> — ${h.status}`;
        wrap.appendChild(row);
      });

    historyList.appendChild(wrap);
  }

  // Per-vendor item return history
  const vendorOrders = order.vendorOrders || [];
  vendorOrders.forEach(vo => {
    const vendorItems = (order.items || []).filter(
      item => String(item.vendorId) === String(vo.vendorId)
    );

    const hasHistory = vendorItems.some(
      item => Array.isArray(item.returnHistory) && item.returnHistory.length
    );
    if (!hasHistory) return;

    const vendorName = vo.vendorStoreName || vo.vendorName || `Vendor …${String(vo.vendorId).slice(-6)}`;

    const section = document.createElement('div');
    section.style.cssText = 'margin-bottom:12px;padding:10px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px';

    const sectionLabel = document.createElement('div');
    sectionLabel.style.cssText = 'font-size:0.75rem;font-weight:700;text-transform:uppercase;color:#6b7280;margin-bottom:8px';
    sectionLabel.textContent = vendorName;
    section.appendChild(sectionLabel);

    vendorItems.forEach(item => {
      if (!Array.isArray(item.returnHistory) || !item.returnHistory.length) return;

      const itemWrap = document.createElement('div');
      itemWrap.style.cssText = 'margin-top:6px;padding-top:6px;border-top:1px solid #e5e7eb';

      const itemLabel = document.createElement('div');
      itemLabel.style.cssText = 'font-size:0.8rem;font-weight:500;color:#374151;margin-bottom:4px';
      itemLabel.textContent = item.name || 'Item';
      itemWrap.appendChild(itemLabel);

      item.returnHistory
        .slice()
        .sort((a, b) => new Date(a.at) - new Date(b.at))
        .forEach(h => {
          const row = document.createElement('div');
          row.style.cssText = 'font-size:0.78rem;color:#374151;margin-bottom:2px';
          row.innerHTML = `<span style="color:#9ca3af">${new Date(h.at).toLocaleString()}</span> — ${h.note || h.type}${h.quantity > 0 ? ` ×${h.quantity}` : ''}`;
          itemWrap.appendChild(row);
        });

      section.appendChild(itemWrap);
    });

    historyList.appendChild(section);
  });

  if (!historyList.innerHTML) {
    historyList.innerHTML = '<span style="color:#9ca3af;font-size:0.85rem">No history yet</span>';
  }
}

/* ================================
   LOAD ORDER
================================ */
async function loadOrder() {
  try {
    const res = await authFetch(`${API_BASE}/admin/orders/${orderId}`);

    if (res.status === 401 || res.status === 403) {
      window.location.href = '/account/admin/signin.html';
      return;
    }
    if (!res.ok) throw new Error('Failed to load order');

    const order = await res.json();
    currentOrder = order;

    const id = order.id || order._id;

    /* ========= SUMMARY ========= */
    document.getElementById('orderId').textContent =
      order.shortId || `S4L-${id.slice(0, 10).toUpperCase()}`;
    document.getElementById('orderUser').textContent  = order.user?.email || '-';
    document.getElementById('orderDate').textContent  = new Date(order.createdAt).toLocaleString();
    document.getElementById('orderTotal').textContent = '£' + Number(order.total).toFixed(2);

    /* ========= STATUS + TIMER ========= */
    orderStatusEl.textContent = order.status;
    if (order.paymentStatus === 'refund_scheduled') {
      orderStatusEl.textContent += ' • refund pending';
    }

    /* ========= PAYMENT ========= */
    const paymentState  = (order.paymentStatus || 'pending').toLowerCase();
    const isFinalState  = order.isFinal;
    const paymentLabel  = getPaymentLabel(paymentState);

    const paymentStatusEl = document.getElementById('paymentStatus');
    const paymentMethodEl = document.getElementById('paymentMethod');

    if (paymentStatusEl) {
      paymentStatusEl.className = `payment-status ${paymentState}`;
      paymentStatusEl.innerHTML = `
        ${paymentLabel}
        ${order.paymentStatus === 'refund_scheduled' && order.refundScheduledAt
          ? `<span class="refund-badge" data-time="${order.refundScheduledAt}">
               <span class="refund-timer"></span>
             </span>`
          : ''}`;
    }

    if (paymentMethodEl) {
      paymentMethodEl.textContent = order.paymentIntentId
        ? `Stripe (${order.paymentIntentId.slice(0, 12)}...)`
        : 'Stripe';
    }

    /* ========= BLOCK / ENABLE ACTIONS ========= */
    const lockOrder = paymentState === 'pending' || paymentState === 'failed' || isFinalState;

    statusSelect.disabled = false;
    updateBtn.disabled    = false;

    if (lockOrder) {
      statusSelect.disabled = true;
      updateBtn.disabled    = true;
      result.textContent    = isFinalState
        ? 'Order is finalized'
        : 'Cannot change status — payment not completed';
      result.className = 'error';
    } else {
      result.textContent = '';
      result.className   = '';
    }

    /* ========= ORDER-LEVEL REFUND BUTTON (hidden — replaced by per-item) ========= */
    if (refundBtn) refundBtn.style.display = 'none';

    /* ========= CANCEL SCHEDULED REFUND ========= */
    if (cancelRefundBtn) {
      cancelRefundBtn.style.display = order.canCancelRefund ? 'block' : 'none';
    }

    /* ========= STATUS SELECT ========= */
    statusSelect.innerHTML = '';

    const currentOption   = document.createElement('option');
    currentOption.value   = order.status;
    currentOption.textContent = order.status;
    currentOption.selected = true;
    statusSelect.appendChild(currentOption);

    (order.allowedActions || []).forEach(s => {
      const option = document.createElement('option');
      option.value = s;
      option.textContent = getAdminLabel(s);
      statusSelect.appendChild(option);
    });

    /* ========= SELLERS SECTION ========= */
    renderSellers(order.vendorOrders || []);

    /* ========= PRODUCTS TABLE ========= */
    ensureTableHeaders();
    ensureRefundModal();

    productsTable.innerHTML = '';

    const items = order.items || [];

    if (!items.length) {
      productsTable.innerHTML = `<tr><td colspan="7">No products found</td></tr>`;
    } else {
      items.forEach(item => {
        const qty   = Number(item.quantity || 0);
        const price = Number(item.price || 0);

        const returnedQty   = Number(item.returnQuantity || 0);
        const refundableQty = returnedQty - Number(item.refundedQuantity || 0);
        const showRefund    = canItemRefund(item);
        const returnSt      = item.returnStatus || '';

        const actionBtns = [];

        if (returnSt === 'requested') {
          actionBtns.push(
            `<button class="approve-return-btn"
              data-item-id="${item._id}"
              data-qty="${Number(item.returnRequestedQuantity || qty)}"
              style="padding:3px 8px;background:#1d4ed8;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.75rem;margin-right:4px">
              Approve
            </button>`,
            `<button class="reject-return-btn"
              data-item-id="${item._id}"
              style="padding:3px 8px;background:#b91c1c;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.75rem">
              Reject
            </button>`
          );
        }

        if (returnSt === 'approved') {
          const approvedQty = Number(item.returnApprovedQuantity || qty);
          const retQty      = Number(item.returnQuantity || 0);
          const remainingQty = Math.max(1, approvedQty - retQty);
          actionBtns.push(
            `<select class="mark-returned-condition" style="padding:3px;border:1px solid #d1d5db;border-radius:4px;font-size:0.75rem;margin-right:4px">
              <option value="used">Used</option>
              <option value="good">Good</option>
              <option value="new">New</option>
              <option value="damaged">Damaged</option>
            </select>`,
            `<button class="mark-returned-btn"
              data-item-id="${item._id}"
              data-qty="${remainingQty}"
              style="padding:3px 8px;background:#111;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.75rem">
              Mark Returned
            </button>`
          );
        }

        const returnEligible = ['partially_returned', 'returned'].includes(item.returnStatus);
        if (returnEligible) {
          const fullyRefunded    = item.refundStatus === 'processed' || refundableQty <= 0;
          const refundProcessing = item.refundStatus === 'processing';

          if (fullyRefunded) {
            actionBtns.push(
              `<button disabled title="Already refunded"
                style="padding:3px 8px;background:#e5e7eb;color:#9ca3af;border:none;border-radius:4px;cursor:not-allowed;font-size:0.75rem;margin-top:2px">
                Refunded ✓
              </button>`
            );
          } else if (refundProcessing) {
            actionBtns.push(
              `<button disabled title="Refund in progress"
                style="padding:3px 8px;background:#e5e7eb;color:#9ca3af;border:none;border-radius:4px;cursor:not-allowed;font-size:0.75rem;margin-top:2px">
                Processing…
              </button>`
            );
          } else if (showRefund) {
            actionBtns.push(
              `<button class="refund-item-btn"
                data-item-id="${item._id}"
                data-item-name="${(item.name || '').replace(/"/g, '&quot;')}"
                data-max-qty="${refundableQty}"
                data-price="${price}"
                style="padding:3px 8px;background:#b91c1c;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.75rem;margin-top:2px">
                Refund
              </button>`
            );
          }
        }

        const itemHistory = Array.isArray(item.returnHistory) && item.returnHistory.length
          ? item.returnHistory.slice().sort((a, b) => new Date(a.at) - new Date(b.at))
              .map(h => `${new Date(h.at).toLocaleString()} — ${h.note || h.type}${h.quantity > 0 ? ` ×${h.quantity}` : ''}`)
              .join('<br>')
          : '';

        const nameCell = itemHistory
          ? `${item.name}<br><details style="font-size:0.75rem;color:#6b7280;margin-top:4px"><summary style="cursor:pointer">History</summary>${itemHistory}</details>`
          : item.name;

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td>${nameCell}</td>
          <td>${qty}</td>
          <td>£${price.toFixed(2)}</td>
          <td>£${(qty * price).toFixed(2)}</td>
          <td>${badge(RETURN_BADGE, item.returnStatus)}</td>
          <td>${badge(REFUND_BADGE, item.refundStatus)}</td>
          <td style="white-space:nowrap">${actionBtns.join('')}</td>`;

        productsTable.appendChild(tr);
      });
    }

    /* ========= HISTORY ========= */
    renderStatusHistory(order);

    /* ========= TIMER ========= */
    initRefundTimers();
  } catch (err) {
    console.error(err);
    result.textContent = 'Failed to load order';
    result.className   = 'error';
  }
}

/* ================================
   TIMER
================================ */
function initRefundTimers() {
  const elements = document.querySelectorAll('.refund-badge');
  if (!elements.length) return;

  function update() {
    const now = Date.now();
    elements.forEach(el => {
      const target  = new Date(el.dataset.time).getTime();
      const timerEl = el.querySelector('.refund-timer');
      if (!timerEl) return;
      const diff = target - now;
      if (diff <= 0) { timerEl.textContent = ' • processing...'; return; }
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const s = Math.floor((diff % (1000 * 60)) / 1000);
      timerEl.textContent = ` • ${h}h ${m}m ${s}s`;
    });
  }

  update();
  setInterval(update, 1000);
}

/* ================================
   CLICK HANDLER (delegated)
================================ */
document.addEventListener('click', async (e) => {
  /* --- Approve return --- */
  const approveBtn = e.target.closest('.approve-return-btn');
  if (approveBtn) {
    approveBtn.disabled = true;
    approveBtn.textContent = '...';
    try {
      const res = await authFetch(
        `${API_BASE}/admin/orders/${orderId}/items/${approveBtn.dataset.itemId}/approve-return`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quantity: Number(approveBtn.dataset.qty) }) }
      );
      const data = await res.json();
      if (!res.ok) { await showAlert(data.error || 'Failed'); return; }
      loadOrder();
    } catch (err) { showAlert('Something went wrong'); }
    finally { approveBtn.disabled = false; approveBtn.textContent = 'Approve'; }
    return;
  }

  /* --- Reject return --- */
  const rejectBtn = e.target.closest('.reject-return-btn');
  if (rejectBtn) {
    const reason = (await showPrompt('Rejection reason (optional):')) ?? '';
    rejectBtn.disabled = true;
    rejectBtn.textContent = '...';
    try {
      const res = await authFetch(
        `${API_BASE}/admin/orders/${orderId}/items/${rejectBtn.dataset.itemId}/reject-return`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason }) }
      );
      const data = await res.json();
      if (!res.ok) { await showAlert(data.error || 'Failed'); return; }
      loadOrder();
    } catch (err) { showAlert('Something went wrong'); }
    finally { rejectBtn.disabled = false; rejectBtn.textContent = 'Reject'; }
    return;
  }

  /* --- Mark returned --- */
  const markReturnedBtn = e.target.closest('.mark-returned-btn');
  if (markReturnedBtn) {
    const td        = markReturnedBtn.closest('td');
    const condition = td?.querySelector('.mark-returned-condition')?.value || 'used';
    markReturnedBtn.disabled = true;
    markReturnedBtn.textContent = '...';
    try {
      const res = await authFetch(
        `${API_BASE}/admin/orders/${orderId}/items/${markReturnedBtn.dataset.itemId}/mark-returned`,
        { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ quantity: Number(markReturnedBtn.dataset.qty), condition }) }
      );
      const data = await res.json();
      if (!res.ok) { await showAlert(data.error || 'Failed'); return; }
      loadOrder();
    } catch (err) { showAlert('Something went wrong'); }
    finally { markReturnedBtn.disabled = false; markReturnedBtn.textContent = 'Mark Returned'; }
    return;
  }

  /* --- Open refund modal --- */
  const refundItemBtn = e.target.closest('.refund-item-btn');
  if (refundItemBtn) {
    openRefundModal(
      refundItemBtn.dataset.itemId,
      refundItemBtn.dataset.itemName,
      Number(refundItemBtn.dataset.maxQty),
      Number(refundItemBtn.dataset.price),
    );
    return;
  }

  /* --- Cancel modal --- */
  if (e.target.id === 'modalCancelBtn') {
    document.getElementById('itemRefundModal').style.display = 'none';
    return;
  }

  /* --- Close on backdrop click --- */
  if (e.target.id === 'itemRefundModal') {
    e.target.style.display = 'none';
    return;
  }

  /* --- Confirm refund --- */
  if (e.target.id === 'modalConfirmBtn') {
    const qty = Number(document.getElementById('modalQtyInput').value);

    if (!qty || qty < 1 || qty > _refundTarget.maxQty) {
      await showAlert(`Enter a quantity between 1 and ${_refundTarget.maxQty}`);
      return;
    }

    const btn = e.target;
    btn.disabled    = true;
    btn.textContent = 'Processing...';

    try {
      const res = await authFetch(
        `${API_BASE}/admin/orders/${orderId}/items/${_refundTarget.itemId}/refund`,
        {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ quantity: qty }),
        }
      );

      const data = await res.json();

      if (!res.ok) {
        await showAlert(data.error || 'Refund failed');
        return;
      }

      document.getElementById('itemRefundModal').style.display = 'none';
      await showAlert(`Refund of £${Number(data.refundedAmount || 0).toFixed(2)} processed successfully.`);
      loadOrder();
    } catch (err) {
      console.error(err);
      await showAlert('Something went wrong. Please try again.');
    } finally {
      btn.disabled    = false;
      btn.textContent = 'Confirm Refund';
    }
  }
});

/* ================================
   QTY INPUT → live amount preview
================================ */
document.addEventListener('input', e => {
  if (e.target.id === 'modalQtyInput') updateModalAmount();
});

/* ================================
   INIT
================================ */
loadOrder();

updateBtn.addEventListener('click', async () => {
  const newStatus = statusSelect.value;
  if (!newStatus) return;

  try {
    updateBtn.disabled    = true;
    updateBtn.textContent = 'Updating...';

    const res = await authFetch(`${API_BASE}/admin/orders/${orderId}/status`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: newStatus }),
    });

    const data = await res.json();

    if (!res.ok) {
      await showAlert(data.error || 'Update failed');
      return;
    }

    loadOrder();
  } catch (err) {
    console.error(err);
    await showAlert('Something went wrong');
  } finally {
    updateBtn.textContent = 'Update Status';
  }
});

/* ================================
   CANCEL REFUND SCHEDULE
================================ */
if (cancelRefundBtn) {
  cancelRefundBtn.addEventListener('click', async () => {
    try {
      cancelRefundBtn.disabled    = true;
      cancelRefundBtn.textContent = 'Cancelling...';

      const res = await authFetch(`${API_BASE}/admin/orders/${orderId}/cancel-refund`, {
        method: 'PATCH',
      });

      const data = await res.json();

      if (!res.ok) {
        await showAlert(data.error || 'Failed to cancel refund');
        return;
      }

      await showAlert('Refund schedule cancelled');
      loadOrder();
    } catch (err) {
      console.error(err);
      await showAlert('Something went wrong');
    } finally {
      cancelRefundBtn.disabled    = false;
      cancelRefundBtn.textContent = 'Cancel Refund';
    }
  });
}

startLiveUpdates(() => {
  loadOrder();
});
