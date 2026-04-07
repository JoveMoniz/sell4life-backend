console.log('vendor orders loaded');

let currentStatus = 'all';
let currentQuery = '';

const FILTER_MAP = {
  all: null,
  active: ['Pending', 'Processing', 'Shipped'],
  issues: ['Cancel Requested', 'Return Requested'],
  completed: ['Delivered', 'Returned', 'Cancelled', 'Refund Scheduled'],
};

async function loadVendorOrders(status = 'all', q = '') {
  const container = document.getElementById('vendor-orders');
  const token = localStorage.getItem('s4l_token');

  if (!container || !token) return;

  const vendorRes = await fetch(`${API_BASE}/vendor/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  const vendorData = await vendorRes.json();
  const vendorId = vendorData.vendor?._id;

  try {
    let url = `${API_BASE}/vendor/orders`;

    const params = [];

    if (status !== 'all') {
      params.push(`status=${status}`);
    }

    if (q) {
      params.push(`q=${encodeURIComponent(q)}`);
    }

    if (params.length) {
      url += `?${params.join('&')}`;
    }

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      container.innerHTML = '<p>Failed to load orders</p>';
      return;
    }

    const data = await res.json();
    const orders = Array.isArray(data) ? data : data.orders || [];

    if (!orders.length) {
      container.innerHTML = '<p>No orders yet</p>';
      return;
    }

    container.innerHTML = orders
      .map((o) => {
        const id = o._id || o.id;

        const displayId = o.shortId ? o.shortId : `S4L-${id.slice(0, 10).toUpperCase()}`;

        const vendorTotal = (o.items || [])
          .filter((item) => String(item.vendorId) === String(vendorId))
          .reduce((sum, item) => {
            return sum + Number(item.price) * Number(item.quantity);
          }, 0);

        return `
  <div class="order-row">

    <div class="order-info">
      <a class="order-id" href="/account/vendor/order-details.html?id=${id}">
        ${displayId}
      </a>

      <div class="order-email">
        ${o.email || o.user?.email || '-'}
      </div>
    </div>

    <span class="order-status">
      ${o.status}

      ${
        o.status === 'Refund Scheduled' && o.refundScheduledAt
          ? `<div class="mini-refund-timer">
              Refund in ${Math.max(
                0,
                Math.floor((new Date(o.refundScheduledAt) - new Date()) / (1000 * 60 * 60))
              )}h
            </div>`
          : ''
      }
    </span>

    <div class="order-actions">

      ${
        o.status === 'Pending'
          ? `
        <button class="btn-process" data-id="${id}" data-label="Process">Process</button>
        <button class="btn-cancel" data-id="${id}" data-label="Cancel">Cancel</button>
      `
          : ''
      }

      ${
        o.status === 'Processing'
          ? `<button class="btn-ship" data-id="${id}" data-label="Mark Shipped">Mark Shipped</button>`
          : ''
      }

      ${
        o.status === 'Shipped'
          ? `<button class="btn-deliver" data-id="${id}" data-label="Mark Delivered">Mark Delivered</button>`
          : ''
      }

      ${
        o.status === 'Cancel Requested'
          ? `<button class="btn-cancel-approve" data-id="${id}" data-label="Approve Cancel">Approve Cancel</button>`
          : ''
      }

      ${
        o.status === 'Return Requested'
          ? `<button class="btn-approve-return" data-id="${id}" data-label="Approve Return">Approve Return</button>`
          : ''
      }

      ${
        o.status === 'Return Approved'
          ? `<button class="btn-mark-returned" data-id="${id}" data-label="Mark Returned">Mark Returned</button>`
          : ''
      }

    </div>

    <span class="order-price">£${vendorTotal.toFixed(2)}</span>

  </div>
`;
      })
      .join('');
  } catch (err) {
    console.error('Vendor orders load error:', err);
    container.innerHTML = '<p>Could not load orders</p>';
  }
}

/* ======================================================
   ACTION HANDLERS
====================================================== */

document.addEventListener('click', async (e) => {
  const token = localStorage.getItem('s4l_token');
  if (!token) return;

  const btn = e.target.closest('button');
  if (!btn) return;

  const id = btn.dataset.id;

  try {
    if (btn.classList.contains('btn-process')) {
      btn.disabled = true;
      btn.textContent = 'Updating...';
      await updateStatus(id, 'Processing', btn);
    }

    if (btn.classList.contains('btn-cancel')) {
      btn.disabled = true;
      btn.textContent = 'Updating...';
      await updateStatus(id, 'Cancelled', btn);
    }

    if (btn.classList.contains('btn-ship')) {
      btn.disabled = true;
      btn.textContent = 'Updating...';
      await updateStatus(id, 'Shipped', btn);
    }

    if (btn.classList.contains('btn-deliver')) {
      btn.disabled = true;
      btn.textContent = 'Updating...';
      await updateStatus(id, 'Delivered', btn);
    }

    if (btn.classList.contains('btn-cancel-approve')) {
      btn.disabled = true;
      btn.textContent = 'Updating...';
      await updateStatus(id, 'Cancelled', btn);
    }

    if (btn.classList.contains('btn-approve-return')) {
      btn.disabled = true;
      btn.textContent = 'Updating...';
      await updateStatus(id, 'Return Approved', btn);
    }

    if (btn.classList.contains('btn-mark-returned')) {
      btn.disabled = true;
      btn.textContent = 'Updating...';
      await updateStatus(id, 'Returned', btn);
    }

    loadVendorOrders(currentStatus, currentQuery);
  } catch (err) {
    console.error(err);
    alert('Action failed');

    btn.disabled = false;
    btn.textContent = btn.dataset.label;
  }
});

/* ======================================================
   UPDATE STATUS
====================================================== */

async function updateStatus(id, status, button) {
  const token = localStorage.getItem('s4l_token');

  const res = await fetch(`${API_BASE}/vendor/orders/${id}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ status }),
  });

  if (!res.ok) throw new Error('Status update failed');
}

/* ======================================================
   INIT
====================================================== */

loadVendorOrders(currentStatus, currentQuery);
