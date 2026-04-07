/* ======================================================
   INIT
====================================================== */

console.log('vendor order details loaded');

const params = new URLSearchParams(window.location.search);
const orderId = params.get('id');

const container = document.getElementById('vendor-order-details');

if (!container) {
  console.error('❌ Container not found');
}

const token = localStorage.getItem('s4l_token');

if (!orderId || !token) {
  container.innerHTML = '<p>Invalid access</p>';
  throw new Error('Invalid access');
}

/* ======================================================
   ACTION BUILDER
====================================================== */

function getActionsHTML(order, id) {
  // 🔒 LOCK if refund scheduled
  if (order.status === 'Refund Scheduled') {
    return `<p>Refund scheduled. No actions available.</p>`;
  }

  let html = '';

  // ===============================
  // NORMAL FLOW
  // ===============================

  if (order.status === 'Pending') {
    html += `<button class="btn-process" data-id="${id}">Process</button>`;
    html += `<button class="btn-cancel" data-id="${id}">Cancel</button>`;
  }

  if (order.status === 'Processing') {
    html += `<button class="btn-ship" data-id="${id}">Mark Shipped</button>`;
    html += `<button class="btn-cancel" data-id="${id}">Cancel</button>`;
  }

  if (order.status === 'Shipped') {
    html += `<button class="btn-deliver" data-id="${id}">Mark Delivered</button>`;
  }

  // ===============================
  // RETURN FLOW
  // ===============================

  if (order.status === 'Return Requested') {
    html += `<button class="btn-approve-return" data-id="${id}">Approve Return</button>`;
  }

  if (order.status === 'Return Approved') {
    html += `<button class="btn-mark-returned" data-id="${id}">Mark Returned</button>`;
  }

  // ===============================
  // DANGER ZONE
  // ===============================

  let dangerButtons = '';

  if (
    order.paymentStatus === 'paid' &&
    ['Cancelled', 'Returned', 'Refund Scheduled'].includes(order.status)
  ) {
    dangerButtons += `<button class="btn-refund danger" data-id="${id}">Refund</button>`;
  }

  if (order.status === 'Cancel Requested') {
    dangerButtons += `<button class="btn-approve-cancel danger" data-id="${id}">Approve Cancel</button>`;
  }

  if (order.status === 'Refund Requested') {
    dangerButtons += `<button class="btn-approve-refund danger" data-id="${id}">Approve Refund</button>`;
  }

  if (dangerButtons) {
    html += `
      <div class="danger-zone">
        <button class="btn-danger-toggle">⚠ Actions</button>
        <div class="danger-dropdown">
          ${dangerButtons}
        </div>
      </div>
    `;
  }

  return html;
}

/* ======================================================
   LOAD ORDER
====================================================== */

async function loadOrder() {
  try {
    const res = await fetch(`${API_BASE}/vendor/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error('Order not found');

    const order = await res.json();

    const id = order._id || order.id;
    const displayId = order.shortId ? order.shortId : `S4L-${id.slice(0, 10).toUpperCase()}`;

    const vendorRes = await fetch(`${API_BASE}/vendor/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const vendorData = await vendorRes.json();
    const vendorId = vendorData.vendor?._id;

    const vendorItems = (order.items || []).filter(
      (item) => String(item.vendorId) === String(vendorId)
    );

    const vendorTotal = vendorItems.reduce((sum, item) => {
      return sum + Number(item.price) * Number(item.quantity);
    }, 0);

    container.innerHTML = `
<div class="order-details-card">

<h2>Order ${displayId}</h2>

<div class="order-status">
Status: ${order.status} <br/>
Payment: ${order.paymentStatus}

${
  order.status === 'Refund Scheduled' && order.refundScheduledAt
    ? `<div class="refund-info">
        Refund scheduled at: ${new Date(order.refundScheduledAt).toLocaleString()}
      </div>`
    : ''
}
</div>

<div class="order-actions">
${getActionsHTML(order, id)}
</div>

<div class="order-items">
${
  vendorItems.length === 0
    ? '<p>No items for this vendor</p>'
    : vendorItems
        .map(
          (item) => `
<div class="order-item">

<img 
  src="${item.image || '/assets/images/products/sell4life-placeholder.png'}"
  alt="${item.name}"
  width="60"
  height="60"
  onerror="this.onerror=null;this.src='/assets/images/products/sell4life-placeholder.png';"
/>

<div>
  <div>${item.name}</div>
  <div>Qty: ${item.quantity}</div>
</div>

<div class="order-price">
  £${(Number(item.price) * Number(item.quantity)).toFixed(2)}
</div>

</div>
`
        )
        .join('')
}
</div>

<div class="order-total">
Total: £${vendorTotal.toFixed(2)}
</div>

</div>
`;
  } catch (err) {
    console.error(err);
    container.innerHTML = '<p>Could not load order</p>';
  }
}

/* ======================================================
   INITIAL LOAD
====================================================== */

loadOrder();

/* ======================================================
   ACTION HANDLER
====================================================== */

document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button');

  // ===============================
  // TOGGLE DROPDOWN
  // ===============================
  if (btn && btn.classList.contains('btn-danger-toggle')) {
    const zone = btn.closest('.danger-zone');

    document.querySelectorAll('.danger-zone').forEach((el) => {
      if (el !== zone) el.classList.remove('open');
    });

    zone.classList.toggle('open');
    return;
  }

  // CLOSE dropdown
  if (!e.target.closest('.danger-zone')) {
    document.querySelectorAll('.danger-zone').forEach((el) => {
      el.classList.remove('open');
    });
  }

  if (!btn) return;

  const id = btn.dataset.id;
  if (!id) return;

  try {
    if (btn.classList.contains('btn-process')) {
      await updateStatus(id, 'Processing');
    }

    if (btn.classList.contains('btn-cancel')) {
      if (!confirm('Cancel this order?')) return;
      await updateStatus(id, 'Cancelled');
    }

    if (btn.classList.contains('btn-ship')) {
      await updateStatus(id, 'Shipped');
    }

    if (btn.classList.contains('btn-deliver')) {
      await updateStatus(id, 'Delivered');
    }

    if (btn.classList.contains('btn-approve-return')) {
      await updateStatus(id, 'Return Approved');
    }

    if (btn.classList.contains('btn-mark-returned')) {
      await updateStatus(id, 'Returned');
    }

    if (btn.classList.contains('btn-approve-cancel')) {
      await updateStatus(id, 'Cancelled');
    }

    if (btn.classList.contains('btn-approve-refund')) {
      if (!confirm('Approve refund?')) return;
      await refundOrder(id);
      await updateStatus(id, 'Cancelled');
    }

    if (btn.classList.contains('btn-refund')) {
      const ok = confirm('Refund this order? This cannot be undone.');
      if (!ok) return;

      btn.disabled = true;
      btn.textContent = 'Processing...';

      await refundOrder(id);
    }

    location.reload();
  } catch (err) {
    console.error(err);
    alert('Action failed');
    btn.disabled = false;
  }
});

/* ======================================================
   UPDATE STATUS
====================================================== */

async function updateStatus(id, status) {
  const res = await fetch(`${API_BASE}/vendor/orders/${id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });

  if (!res.ok) throw new Error('Update failed');
}

/* ======================================================
   REFUND
====================================================== */

async function refundOrder(id) {
  const res = await fetch(`${API_BASE}/orders/${id}/refund`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) throw new Error('Refund failed');
}
