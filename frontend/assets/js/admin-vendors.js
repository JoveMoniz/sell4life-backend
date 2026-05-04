console.log('admin vendors loaded');

const API = window.API_BASE;
/* =========================================
   LOAD VENDORS
========================================= */

async function loadVendors() {
  const container = document.getElementById('vendors-list');
  const loading = document.getElementById('vendors-loading');

  const token = localStorage.getItem('s4l_token');

  if (!token) {
    container.innerHTML = 'Not logged in';
    return;
  }

  try {
    const res = await fetch(`${API}/admin/vendors`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await res.json();

    loading.style.display = 'none';

    renderVendors(data.vendors || []);
  } catch (err) {
    console.error(err);
    loading.textContent = 'Failed to load vendors';
  }
}

/* =========================================
   RENDER
========================================= */

function renderVendors(vendors) {
  const container = document.getElementById('vendors-list');

  if (!vendors.length) {
    container.innerHTML = '<p>No vendors found</p>';
    return;
  }

  container.innerHTML = vendors
    .map((v) => {
      return `
  <div class="vendor-card">

    <div class="vendor-top">
      <div class="vendor-info">
        <h3>${v.storeName || 'No Name'}</h3>
        <p class="vendor-email">${v.userId?.email || 'No email'}</p>
      </div>

      <div class="vendor-status status-${v.status}">
        ${v.status}
      </div>
    </div>

<div class="vendor-actions">

${
  v.status === 'pending'
    ? `
  <button onclick="approveVendor('${v._id}')">
    Approve
  </button>
`
    : ''
}

${
  v.status === 'approved'
    ? `
  <button onclick="suspendVendor('${v._id}', '${v.status}')">
    Suspend
  </button>
`
    : ''
}

${
  v.status === 'suspended'
    ? `
  <button onclick="reactivateVendor('${v._id}', '${v.status}')">
    Reactivate
  </button>
`
    : ''
}

</div>
`;
    })
    .join('');
}

/* =========================================
   ACTIONS
========================================= */

async function approveVendor(id) {
  const token = localStorage.getItem('s4l_token');

  const res = await fetch(`${API}/admin/vendors/${id}/approve`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();
  console.log(data);

  loadVendors();
}

async function suspendVendor(id, status) {
  if (status !== 'approved') {
    console.warn('Blocked: not approved');
    return;
  }
  const token = localStorage.getItem('s4l_token');

  const res = await fetch(`${API}/admin/vendors/${id}/suspend`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();
  console.log(data);

  loadVendors();
}

async function reactivateVendor(id, status) {
  if (status !== 'suspended') {
    console.warn('Blocked: not suspended');
    return;
  }

  const token = localStorage.getItem('s4l_token');

  const res = await fetch(`${API}/admin/vendors/${id}/reactivate`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await res.json();
  console.log(data);

  loadVendors();
}

/* =========================================
   INIT
========================================= */

document.addEventListener('DOMContentLoaded', loadVendors);
