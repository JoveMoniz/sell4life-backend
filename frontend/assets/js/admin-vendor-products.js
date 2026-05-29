// ======================================================
// ADMIN VENDOR PRODUCTS
// ======================================================

const API = window.API_BASE;
const PER_PAGE = 24;

let allProducts = [];
let currentFilter = 'active';
let currentPage = 1;

function authFetch(url, opts = {}) {
  const token = localStorage.getItem('s4l_token');
  const headers = { ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...opts, credentials: 'include', headers });
}

(function init() {
  const params = new URLSearchParams(window.location.search);
  const vendorId = params.get('id');
  if (!vendorId) {
    document.getElementById('vp-grid').innerHTML =
      '<div class="vp-loading">No vendor ID in URL.</div>';
    return;
  }
  loadProducts(vendorId);
})();

async function loadProducts(vendorId) {
  try {
    const res = await authFetch(`${API}/admin/vendors/${vendorId}/products`);
    if (res.status === 401 || res.status === 403) {
      window.location.href = '/account/admin/signin.html';
      return;
    }
    const data = await res.json();
    allProducts = data.products || [];
    renderInfoBar(data.vendor);
    renderStats(data);
    renderPage(1);
  } catch (err) {
    console.error('Vendor products error:', err);
    document.getElementById('vp-grid').innerHTML = '<div class="vp-loading">Failed to load.</div>';
  }
}

function filteredProducts() {
  if (currentFilter === 'active') return allProducts.filter((p) => !p.archived);
  if (currentFilter === 'archived') return allProducts.filter((p) => p.archived);
  return allProducts;
}

function renderPage(page) {
  currentPage = page;
  const items = filteredProducts();
  const pages = Math.ceil(items.length / PER_PAGE);
  const slice = items.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const countEl = document.getElementById('vp-count');
  if (countEl) {
    countEl.textContent = items.length
      ? `${(page - 1) * PER_PAGE + 1}–${Math.min(page * PER_PAGE, items.length)} of ${items.length}`
      : '0 products';
  }

  renderGrid(slice);
  renderPagination(page, pages);
}

function renderInfoBar(v) {
  if (!v) return;
  const bar = document.getElementById('vp-info-bar');
  if (!bar) return;
  const statusStyle =
    v.status === 'approved'
      ? 'background:#dcfce7;color:#166534'
      : v.status === 'suspended'
        ? 'background:#fee2e2;color:#991b1b'
        : 'background:#fef9c3;color:#854d0e';
  bar.innerHTML = `
    <strong>${v.storeName}</strong>
    ${v.storeSlug ? `<span style="color:#9ca3af;font-size:11px">@${v.storeSlug}</span>` : ''}
    <span style="${statusStyle};padding:1px 8px;border-radius:10px;font-size:11px;font-weight:600;text-transform:capitalize">${v.status}</span>
    <span style="font-size:11px;color:#9ca3af">${v.email}</span>
  `;
  bar.style.display = 'flex';
  document.getElementById('page-title').textContent = `${v.storeName} – Products`;
}

function renderStats(data) {
  const el = document.getElementById('vp-stats');
  if (!el) return;
  el.innerHTML = `
    <span><strong>${data.total}</strong> total</span>
    <span><strong>${data.active}</strong> active</span>
    <span><strong>${data.archived}</strong> archived</span>
  `;
}

function renderGrid(products) {
  const grid = document.getElementById('vp-grid');
  if (!grid) return;

  if (!products.length) {
    grid.innerHTML = '<div class="vp-loading">No products found.</div>';
    return;
  }

  grid.innerHTML = products
    .map((p) => {
      const img =
        p.images && p.images[0]
          ? `<img class="vp-card-img" src="${p.images[0]}" alt="${p.name}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
          : '';
      const placeholder = `<div class="vp-card-img-placeholder" ${img ? 'style="display:none"' : ''}>📦</div>`;
      const price = p.price != null ? `£${Number(p.price).toFixed(2)}` : '—';
      const stock = p.stock != null ? `${p.stock} in stock` : '';
      const category = p.category || '';
      const created = new Date(p.createdAt).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
      const archivedTag = p.archived ? '<span class="vp-archived-tag">archived</span>' : '';

      return `<div class="vp-card">
      ${img}${placeholder}
      <div class="vp-card-body">
        <div class="vp-card-name">${p.name}${archivedTag}</div>
        <div class="vp-card-price">${price}</div>
        <div class="vp-card-meta">${[stock, category, created].filter(Boolean).join(' · ')}</div>
      </div>
    </div>`;
    })
    .join('');
}

function renderPagination(page, pages) {
  const container = document.getElementById('vp-pagination');
  if (!container) return;
  container.innerHTML = '';
  if (pages <= 1) return;

  const prev = document.createElement('button');
  prev.textContent = '← Prev';
  prev.className = 'vp-pg-btn';
  prev.disabled = page <= 1;
  prev.onclick = () => {
    renderPage(page - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  container.appendChild(prev);

  const info = document.createElement('span');
  info.textContent = ` Page ${page} of ${pages} `;
  info.className = 'vp-pg-info';
  container.appendChild(info);

  const next = document.createElement('button');
  next.textContent = 'Next →';
  next.className = 'vp-pg-btn';
  next.disabled = page >= pages;
  next.onclick = () => {
    renderPage(page + 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  container.appendChild(next);
}

// Filter buttons
document.addEventListener('click', (e) => {
  const btn = e.target.closest('.vp-filter-btn');
  if (!btn) return;
  document.querySelectorAll('.vp-filter-btn').forEach((b) => b.classList.remove('active'));
  btn.classList.add('active');
  currentFilter = btn.dataset.filter;
  renderPage(1);
});
