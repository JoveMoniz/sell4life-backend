console.log('vendor dashboard loaded');

/* ======================================================
   LOAD DASHBOARD STATS
====================================================== */

async function loadVendorDashboard() {
  const token = localStorage.getItem('s4l_token');
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE}/vendor/dashboard`, {
      headers: { Authorization: 'Bearer ' + token },
    });

    if (!res.ok) throw new Error('Dashboard API error');

    const data = await res.json();

    document.getElementById('stat-products').textContent = data.products || 0;
    document.getElementById('stat-orders').textContent = data.orders || 0;
    document.getElementById('stat-revenue').textContent =
      '£' + Number(data.revenue || 0).toFixed(2);
  } catch (err) {
    console.error('Vendor dashboard load error:', err);
  }
}

/* ======================================================
   LOAD RECENT ORDERS
====================================================== */

async function loadRecentOrders() {
  const container = document.getElementById('recent-orders');
  const token = localStorage.getItem('s4l_token');
  const vendorRes = await fetch(`${API_BASE}/vendor/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const vendorData = await vendorRes.json();
  const vendorId = vendorData.vendor?._id;

  if (!container || !token) return;

  try {
    const res = await fetch(`${API_BASE}/vendor/orders`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();
    const orders = Array.isArray(data) ? data : data.orders || [];
    if (!Array.isArray(orders) || orders.length === 0) {
      container.innerHTML = '<p>No orders yet</p>';
      return;
    }

    const latest = orders.slice(0, 5);

    container.innerHTML = latest
      .map((o) => {
        const id = o.id;

        const displayId = o.shortId || `S4L-${id.slice(0, 10).toUpperCase()}`;

        const vendorTotal = (o.items || [])
          .filter((item) => String(item.vendorId) === String(vendorId))
          .reduce((sum, item) => {
            return sum + Number(item.price) * Number(item.quantity);
          }, 0);

        return `
    <div class="order-row">

      <a class="order-id" href="/account/vendor/order-details.html?id=${id}">
        ${displayId}
      </a>

      <span class="order-status">${o.status}</span>

      <span class="order-price">£${vendorTotal.toFixed(2)}</span>

    </div>
  `;
      })
      .join('');
  } catch (err) {
    console.error('Recent orders load error:', err);
    container.innerHTML = '<p>Could not load orders</p>';
  }
}

/* ======================================================
   INIT
====================================================== */

loadVendorDashboard();
loadRecentOrders();
