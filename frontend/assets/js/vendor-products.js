/* ======================================================
   SELL4LIFE — VENDOR PRODUCTS
====================================================== */

const IMAGE_BASE = '/assets/images/products/';
const TIER_RANK_VP = { casual: 1, refurbished: 2, professional: 3, enterprise: 4 };
const _isPro = (TIER_RANK_VP[localStorage.getItem('s4l_vendorType')] || 1) >= 3;

let _allProducts = [];
let _archivedProducts = [];
let _currentView = 'grid';
let _currentStatus = 'all';
let _currentSort = 'newest';
let _searchQuery = '';
const _selected = new Set();

/* ── localStorage cache for archived products ────── */
// Keyed per vendor so multiple vendors on same device don't mix
function _archivedKey() {
  return 's4l_vp_archived_' + (localStorage.getItem('s4l_vendorId') || 'v');
}
function _loadArchivedCache() {
  try { return JSON.parse(localStorage.getItem(_archivedKey()) || '[]'); } catch { return []; }
}
function _saveArchivedCache() {
  try { localStorage.setItem(_archivedKey(), JSON.stringify(_archivedProducts)); } catch {}
}

/* ── Helpers ─────────────────────────────────────── */

function getImage(p) {
  const raw = p.images?.[0];
  if (raw && typeof raw === 'string') {
    return raw.startsWith('http') ? raw : IMAGE_BASE + raw;
  }
  return '/assets/images/products/sell4life-placeholder.png';
}

function fmt(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function stockMeta(stock) {
  if (stock === 0) return { cls: 'vp-stock-zero', label: '⚠ Out of stock' };
  if (stock <= 5)  return { cls: 'vp-stock-low',  label: `⚠ Low: ${stock}` };
  return { cls: '', label: `Stock: ${stock}` };
}

/* ── Render: grid card ───────────────────────────── */

function renderCard(p) {
  const id     = p._id || p.id;
  const active = p.active !== false;
  const stock  = p.stock ?? 0;
  const { cls, label } = stockMeta(stock);
  const sel = _selected.has(id);

  return `
    <div class="vendor-product-card${sel ? ' vp-selected' : ''}" data-id="${id}">
      <label class="vp-select-wrap" title="Select">
        <input type="checkbox" class="vp-select-cb" data-id="${id}"${sel ? ' checked' : ''} />
      </label>
      <div class="vp-img-wrap">
        <img src="${getImage(p)}" alt="${p.name || 'product'}" loading="lazy" />
        <span class="vp-badge ${active ? 'vp-badge-active' : 'vp-badge-draft'}">${active ? 'Active' : 'Draft'}</span>
        ${p.comingSoon ? '<span class="vp-badge vp-badge-coming-soon">🕐 Coming Soon</span>' : ''}
      </div>

      <div class="vp-card-body">
        <h3 class="vp-name">${p.name || 'Unnamed product'}</h3>

        ${p.category ? `<div class="product-cat">${fmt(p.category)}${p.subcategory ? ' / ' + fmt(p.subcategory) : ''}</div>` : ''}

        <div class="vp-price-row">
          <span class="price">£${Number(p.price || 0).toFixed(2)}</span>
          ${p.comparePrice ? `<span class="vp-compare">£${Number(p.comparePrice).toFixed(2)}</span>` : ''}
        </div>

        <div class="stock ${cls}">${label}</div>
      </div>

      <div class="vendor-product-actions">
        <a href="/account/vendor/edit-product.html?id=${id}" class="btn-edit">Edit</a>
        <a href="/product/product.html?id=${id}" class="btn-view-store" target="_blank" rel="noopener">View</a>
        ${_isPro ? `<button class="btn-duplicate" data-id="${id}" title="Duplicate as draft">Copy</button>` : ''}
        ${p.archived
          ? `<button class="btn-unarchive" data-id="${id}">Unarchive</button>`
          : `<button class="btn-coming-soon-toggle${p.comingSoon ? ' is-coming-soon' : ''}" data-id="${id}" title="${p.comingSoon ? 'Click to unblock — Coming Soon is ON' : 'Click to enable Coming Soon'}">🕐</button>
        <button class="btn-archive" data-id="${id}">Archive</button>`}
        <button class="btn-delete" data-id="${id}">Delete</button>
      </div>
    </div>
  `;
}

/* ── Render: list row ────────────────────────────── */

function renderListRow(p) {
  const id     = p._id || p.id;
  const active = p.active !== false;
  const stock  = p.stock ?? 0;
  const { cls, label } = stockMeta(stock);
  const sel = _selected.has(id);

  return `
    <div class="vp-list-row${sel ? ' vp-selected' : ''}" data-id="${id}">
      <label class="vp-select-wrap vp-select-wrap-list" title="Select">
        <input type="checkbox" class="vp-select-cb" data-id="${id}"${sel ? ' checked' : ''} />
      </label>
      <img src="${getImage(p)}" alt="${p.name || 'product'}" class="vp-list-img" loading="lazy" />

      <div class="vp-list-info">
        <div class="vp-list-name">${p.name || 'Unnamed product'}</div>
        ${p.category ? `<div class="product-cat">${fmt(p.category)}${p.subcategory ? ' / ' + fmt(p.subcategory) : ''}</div>` : ''}
        ${p.sku ? `<div class="vp-list-sku">SKU: ${p.sku}</div>` : ''}
      </div>

      <span class="vp-badge ${active ? 'vp-badge-active' : 'vp-badge-draft'}">${active ? 'Active' : 'Draft'}</span>
      ${p.comingSoon ? '<span class="vp-badge vp-badge-coming-soon">🕐 Coming Soon</span>' : ''}

      <div class="vp-list-price">
        <span class="price">£${Number(p.price || 0).toFixed(2)}</span>
        ${p.comparePrice ? `<span class="vp-compare">£${Number(p.comparePrice).toFixed(2)}</span>` : ''}
      </div>

      <div class="stock ${cls}">${label}</div>

      <div class="vp-list-actions">
        <a href="/account/vendor/edit-product.html?id=${id}" class="btn-edit">Edit</a>
        <a href="/product/product.html?id=${id}" class="btn-view-store" target="_blank" rel="noopener">View</a>
        ${_isPro ? `<button class="btn-duplicate" data-id="${id}" title="Duplicate as draft">Copy</button>` : ''}
        ${p.archived
          ? `<button class="btn-unarchive" data-id="${id}">Unarchive</button>`
          : `<button class="btn-coming-soon-toggle${p.comingSoon ? ' is-coming-soon' : ''}" data-id="${id}" title="${p.comingSoon ? 'Disable Coming Soon' : 'Enable Coming Soon'}">🕐 ${p.comingSoon ? 'Unblock' : 'Coming Soon'}</button>
        <button class="btn-archive" data-id="${id}">Archive</button>`}
        <button class="btn-delete" data-id="${id}">Delete</button>
      </div>
    </div>
  `;
}

/* ── Skeleton loader ─────────────────────────────── */

function showSkeleton(container) {
  container.className = 'vendor-products-grid';
  container.innerHTML = Array.from({ length: 4 }, () => `
    <div class="vp-skeleton">
      <div class="vp-sk-img"></div>
      <div class="vp-sk-line"></div>
      <div class="vp-sk-line vp-sk-short"></div>
      <div class="vp-sk-line vp-sk-short"></div>
    </div>
  `).join('');
}

/* ── Filter + sort + render ──────────────────────── */

function renderProducts() {
  const container = document.getElementById('vendor-products');
  if (!container) return;

  // Toggle bulk bar buttons for archived mode
  const bulkArchive   = document.getElementById('btn-bulk-archive');
  const bulkUnarchive = document.getElementById('btn-bulk-unarchive');
  const isArchiveMode = _currentStatus === 'archived';
  if (bulkArchive)   bulkArchive.hidden   = isArchiveMode;
  if (bulkUnarchive) bulkUnarchive.hidden = !isArchiveMode;

  let items = isArchiveMode ? [..._archivedProducts] : [..._allProducts];

  if (!isArchiveMode && _currentStatus !== 'all') {
    const want = _currentStatus === 'active';
    items = items.filter(p => (p.active !== false) === want);
  }

  if (_searchQuery) {
    const q = _searchQuery.toLowerCase();
    items = items.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.category || '').toLowerCase().includes(q) ||
      (p.sku || '').toLowerCase().includes(q)
    );
  }

  switch (_currentSort) {
    case 'name':
      items.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      break;
    case 'price-asc':
      items.sort((a, b) => (a.price || 0) - (b.price || 0));
      break;
    case 'price-desc':
      items.sort((a, b) => (b.price || 0) - (a.price || 0));
      break;
    case 'stock-asc':
      items.sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0));
      break;
    // newest: keep API order
  }

  if (!items.length) {
    container.className = 'vendor-products-grid';

    if (isArchiveMode) {
      container.innerHTML = `
        <div class="vp-empty">
          <p>No archived products.</p>
          <p style="font-size:0.83rem;color:#9ca3af;margin-top:6px">
            Already archived something? Paste its product page URL or ID below.
          </p>
          <div style="display:flex;gap:8px;margin-top:12px;max-width:420px">
            <input type="text" id="vp-recover-input" class="vp-search"
              placeholder="product.html?id=… or just the ID" style="flex:1;min-width:0" />
            <button class="btn-add-product" id="vp-recover-btn">Recover</button>
          </div>
        </div>`;
      return;
    }

    const msg = _searchQuery || _currentStatus !== 'all'
      ? 'No products match your filters.'
      : 'No products yet.';
    container.innerHTML = `
      <div class="vp-empty">
        <p>${msg}</p>
        ${!_searchQuery && _currentStatus === 'all'
          ? `<a href="/account/vendor/add-product.html" class="btn-add-product">Add your first product</a>`
          : ''}
      </div>
    `;
    return;
  }

  container.className = `vendor-products-grid${_currentView === 'list' ? ' vp-list' : ''}`;
  container.innerHTML = (_currentView === 'list' ? items.map(renderListRow) : items.map(renderCard)).join('');
}

/* ── Toolbar wiring ──────────────────────────────── */

function bindToolbar() {
  const search = document.getElementById('vp-search');
  if (search) {
    search.addEventListener('input', e => {
      _searchQuery = e.target.value.trim();
      renderProducts();
    });
  }

  document.querySelectorAll('.vp-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.vp-filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _currentStatus = btn.dataset.status;
      _selected.clear();
      updateBulkBar();
      renderProducts();
    });
  });

  const sort = document.getElementById('vp-sort');
  if (sort) {
    sort.addEventListener('change', e => {
      _currentSort = e.target.value;
      renderProducts();
    });
  }

  document.querySelectorAll('.vp-view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.vp-view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      _currentView = btn.dataset.view;
      renderProducts();
    });
  });
}

/* ── Bulk selection ──────────────────────────────── */

function visibleIds() {
  return [...document.querySelectorAll('.vp-select-cb')].map(cb => cb.dataset.id);
}

function updateBulkBar() {
  const bar   = document.getElementById('vp-bulk-bar');
  const count = document.getElementById('vp-bulk-count');
  const selAll = document.getElementById('vp-select-all');
  if (!bar) return;
  bar.hidden = _selected.size === 0;
  if (count) count.textContent = `${_selected.size} selected`;
  if (selAll) {
    const vis = visibleIds();
    selAll.checked = vis.length > 0 && vis.every(id => _selected.has(id));
    selAll.indeterminate = !selAll.checked && _selected.size > 0;
  }
}

function toggleSelect(id) {
  const card = document.querySelector(`[data-id="${id}"]`);
  const cb   = card?.querySelector('.vp-select-cb');
  if (_selected.has(id)) {
    _selected.delete(id);
    card?.classList.remove('vp-selected');
    if (cb) cb.checked = false;
  } else {
    _selected.add(id);
    card?.classList.add('vp-selected');
    if (cb) cb.checked = true;
  }
  updateBulkBar();
}

// Click anywhere on card to select (ignore action buttons/links)
document.addEventListener('click', (e) => {
  if (e.target.closest('.vendor-product-actions, .vp-list-actions, a, button')) return;
  const card = e.target.closest('.vendor-product-card, .vp-list-row');
  if (!card) return;
  toggleSelect(card.dataset.id);
});

// Checkbox still works independently
document.addEventListener('change', (e) => {
  if (!e.target.classList.contains('vp-select-cb')) return;
  toggleSelect(e.target.dataset.id);
});

document.getElementById('vp-select-all')?.addEventListener('change', (e) => {
  visibleIds().forEach(id => {
    if (e.target.checked) _selected.add(id);
    else _selected.delete(id);
    const card = document.querySelector(`[data-id="${id}"]`);
    const cb   = card?.querySelector('.vp-select-cb');
    card?.classList.toggle('vp-selected', e.target.checked);
    if (cb) cb.checked = e.target.checked;
  });
  updateBulkBar();
});

document.getElementById('btn-bulk-clear')?.addEventListener('click', () => {
  _selected.clear();
  document.querySelectorAll('.vp-select-cb').forEach(cb => cb.checked = false);
  document.querySelectorAll('.vp-selected').forEach(el => el.classList.remove('vp-selected'));
  updateBulkBar();
});

async function bulkAction(action) {
  if (_selected.size === 0) return;
  const token = localStorage.getItem('s4l_token');
  const ids = [..._selected];
  const n = ids.length;
  const msg = action === 'delete'
    ? `Permanently delete ${n} product${n > 1 ? 's' : ''}? This cannot be undone.`
    : action === 'unarchive'
      ? `Restore ${n} product${n > 1 ? 's' : ''}? They will be active and visible to buyers again.`
      : `Archive ${n} product${n > 1 ? 's' : ''}? They will be hidden from buyers.`;
  const confirmed = await window.confirmAction?.(msg);
  if (!confirmed) return;

  const bar = document.getElementById('vp-bulk-bar');
  if (bar) bar.querySelector('.vp-bulk-actions').innerHTML = `<span class="vp-bulk-spinner"></span><span style="font-size:0.85rem;color:#6b7280">Processing…</span>`;

  let ok = 0;
  await Promise.all(ids.map(async (id) => {
    try {
      const url = action === 'delete'
        ? `${window.API_BASE}/products/${id}`
        : `${window.API_BASE}/products/${id}/${action}`;
      const res = await fetch(url, {
        method: action === 'delete' ? 'DELETE' : 'PATCH',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        if (action === 'unarchive') {
          const restored = _archivedProducts.find(p => (p._id || p.id) === id);
          _archivedProducts = _archivedProducts.filter(p => (p._id || p.id) !== id);
          if (restored) { restored.archived = false; _allProducts.push(restored); }
        } else {
          _allProducts = _allProducts.filter(p => (p._id || p.id) !== id);
        }
        _selected.delete(id);
        ok++;
      }
    } catch {}
  }));

  renderProducts();
  updateBulkBar();
  const label = action === 'delete' ? 'deleted' : action === 'unarchive' ? 'restored' : 'archived';
  window.showToast?.(`${ok} product${ok !== 1 ? 's' : ''} ${label}`);
}

document.getElementById('btn-bulk-archive')?.addEventListener('click',   () => bulkAction('archive'));
document.getElementById('btn-bulk-unarchive')?.addEventListener('click', () => bulkAction('unarchive'));
document.getElementById('btn-bulk-delete')?.addEventListener('click',    () => bulkAction('delete'));

/* ── Bulk price/stock edit ────────────────────────────── */

document.getElementById('btn-bulk-price')?.addEventListener('click', () => {
  const panel = document.getElementById('vp-bulk-edit-panel');
  const label = document.getElementById('vp-bulk-edit-label');
  const input = document.getElementById('vp-bulk-edit-value');
  if (label) label.textContent = 'Set price (£)';
  if (input) { input.type = 'number'; input.value = ''; }
  if (panel) panel.hidden = false;
  if (input) input.focus();
  panel?.dataset.mode = 'price';
});

document.getElementById('btn-bulk-stock')?.addEventListener('click', () => {
  const panel = document.getElementById('vp-bulk-edit-panel');
  const label = document.getElementById('vp-bulk-edit-label');
  const input = document.getElementById('vp-bulk-edit-value');
  if (label) label.textContent = 'Set stock (qty)';
  if (input) { input.type = 'number'; input.value = ''; input.step = '1'; }
  if (panel) panel.hidden = false;
  if (input) input.focus();
  panel?.dataset.mode = 'stock';
});

document.getElementById('btn-bulk-edit-cancel')?.addEventListener('click', () => {
  const panel = document.getElementById('vp-bulk-edit-panel');
  if (panel) { panel.hidden = true; delete panel.dataset.mode; }
});

document.getElementById('btn-bulk-edit-apply')?.addEventListener('click', async () => {
  const panel = document.getElementById('vp-bulk-edit-panel');
  const input = document.getElementById('vp-bulk-edit-value');
  const mode = panel?.dataset.mode;
  const value = input?.value?.trim();

  if (!mode || !value) return;
  if (_selected.size === 0) { window.showToast?.('No products selected', 'error'); return; }

  const token = localStorage.getItem('s4l_token');
  const ids = [..._selected];
  const n = ids.length;
  const field = mode === 'price' ? 'price' : 'stock';
  const fieldVal = mode === 'price' ? parseFloat(value) : parseInt(value, 10);

  if (isNaN(fieldVal) || fieldVal < 0) {
    window.showToast?.(`Invalid ${field}`, 'error');
    return;
  }

  const msg = `Update ${field} to ${fieldVal} for ${n} product${n > 1 ? 's' : ''}?`;
  const confirmed = await window.confirmAction?.(msg);
  if (!confirmed) return;

  const actBtn = document.getElementById('btn-bulk-edit-apply');
  if (actBtn) { actBtn.disabled = true; actBtn.textContent = 'Applying…'; }

  try {
    const body = { ids };
    if (mode === 'price') body.price = fieldVal;
    else body.stock = fieldVal;

    const res = await fetch(`${window.API_BASE}/products/bulk`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const data = await res.json();
      throw new Error(data.error || `HTTP ${res.status}`);
    }

    const data = await res.json();
    const updated = data.updated || ids.length;

    _allProducts.forEach(p => {
      const pid = p._id || p.id;
      if (ids.includes(pid)) {
        if (mode === 'price') p.price = fieldVal;
        else p.stock = fieldVal;
      }
    });

    _selected.clear();
    renderProducts();
    updateBulkBar();
    if (panel) { panel.hidden = true; delete panel.dataset.mode; }
    window.showToast?.(`Updated ${updated} product${updated !== 1 ? 's' : ''}`);
  } catch (err) {
    console.error(err);
    window.showToast?.(err.message || 'Update failed', 'error');
  } finally {
    if (actBtn) { actBtn.disabled = false; actBtn.textContent = 'Apply to selected'; }
  }
});

/* ── Load ────────────────────────────────────────── */

async function loadVendorProducts() {
  const container = document.getElementById('vendor-products');
  const token = localStorage.getItem('s4l_token');

  if (!container) return;

  if (!token) {
    container.innerHTML = '<p>Not authenticated.</p>';
    return;
  }

  showSkeleton(container);

  try {
    const vendorRes = await fetch(`${window.API_BASE}/vendor/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { vendor } = await vendorRes.json();

    if (!vendor) {
      container.innerHTML = '<p>Create your store first.</p>';
      return;
    }

    if (vendor.status === 'pending') {
      container.innerHTML = `
        <div class="vendor-pending-message">
          <h2>Store Under Review</h2>
          <p>Your store is being reviewed. You'll be able to manage products once approved.</p>
        </div>`;
      return;
    }

    if (vendor.status === 'suspended') {
      container.innerHTML = `
        <div class="vendor-pending-message vendor-suspended-message">
          <h2>Store Suspended</h2>
          <p>Please contact support for assistance.</p>
        </div>`;
      return;
    }

    const res = await fetch(`${window.API_BASE}/vendor/products`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const all  = Array.isArray(data) ? data : [];
    _allProducts = all.filter(p => !p.archived);

    // Merge: localStorage cache + anything the API returns as archived
    const apiArchived  = all.filter(p => p.archived);
    const cached       = _loadArchivedCache();
    const merged       = new Map();
    cached.forEach(p    => merged.set(p._id || p.id, p));
    apiArchived.forEach(p => merged.set(p._id || p.id, p)); // API wins
    // Drop any that came back as non-archived (restored elsewhere)
    const activeIds = new Set(_allProducts.map(p => p._id || p.id));
    _archivedProducts = [...merged.values()].filter(p => !activeIds.has(p._id || p.id));
    _saveArchivedCache();

    document.getElementById('vp-toolbar')?.removeAttribute('hidden');
    bindToolbar();

    renderProducts();
  } catch (err) {
    console.error('Vendor products load error:', err);
    container.innerHTML = `
      <div class="vp-empty">
        <p>Could not load products.</p>
        <button class="btn-retry" onclick="loadVendorProducts()">Try again</button>
      </div>`;
  }
}

/* ── Recover archived product by ID ─────────────── */

document.addEventListener('click', async (e) => {
  if (e.target.id !== 'vp-recover-btn') return;
  const input = document.getElementById('vp-recover-input');
  if (!input) return;
  const raw = input.value.trim();
  if (!raw) return;

  // Accept full URL (…?id=XXX) or bare ID
  let id = raw;
  try {
    const u = raw.includes('?') ? new URL(raw, location.origin) : null;
    if (u) id = u.searchParams.get('id') || raw;
  } catch {}

  const token = localStorage.getItem('s4l_token');
  if (!token) { window.showToast?.('Not authenticated', 'error'); return; }

  const btn = e.target;
  btn.disabled = true; btn.textContent = 'Fetching…';

  try {
    const res = await fetch(`${window.API_BASE}/vendor/products/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw new Error('Not found');
    const product = await res.json();

    if (!product.archived) {
      window.showToast?.('That product is not archived', 'error');
      btn.disabled = false; btn.textContent = 'Recover';
      return;
    }

    // Check not already in list
    if (!_archivedProducts.find(p => (p._id || p.id) === id)) {
      _archivedProducts.push(product);
      _saveArchivedCache();
    }
    renderProducts();
    window.showToast?.('Product recovered ✓');
  } catch {
    window.showToast?.('Product not found', 'error');
    btn.disabled = false; btn.textContent = 'Recover';
  }
});

/* ── Duplicate ───────────────────────────────────── */

document.addEventListener('click', async (e) => {
  if (!e.target.classList.contains('btn-duplicate')) return;
  const btn = e.target;
  const id  = btn.dataset.id;
  const token = localStorage.getItem('s4l_token');
  btn.disabled = true;
  btn.textContent = '…';
  try {
    const res = await fetch(`${API_BASE}/products/${id}/duplicate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      credentials: 'include',
    });
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Duplicate failed', 'error'); return; }
    // Navigate to edit the new copy immediately
    window.location.href = `/account/vendor/edit-product.html?id=${data.product._id}`;
  } catch {
    showToast('Server error — please try again.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Copy';
  }
});

/* ── Archive ─────────────────────────────────────── */

document.addEventListener('click', async (e) => {
  if (!e.target.classList.contains('btn-archive')) return;

  const button = e.target;
  const id = button.dataset.id;
  const token = localStorage.getItem('s4l_token');

  if (!token) { window.showToast?.('Not authenticated', 'error'); return; }

  const confirmed = await window.confirmAction?.('Archive this product? It will be hidden from buyers.');
  if (!confirmed) return;

  try {
    button.disabled = true;
    button.textContent = 'Archiving…';

    const res = await fetch(`${window.API_BASE}/products/${id}/archive`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error('Archive failed');

    const product = _allProducts.find(p => (p._id || p.id) === id);
    if (product) { product.archived = true; _archivedProducts.push(product); }
    _allProducts = _allProducts.filter(p => (p._id || p.id) !== id);
    _saveArchivedCache();
    renderProducts();
    window.showToast?.('Product archived');
  } catch (err) {
    console.error(err);
    button.disabled = false;
    button.textContent = 'Archive';
    window.showToast?.('Archive failed', 'error');
  }
});

/* ── Unarchive ───────────────────────────────────── */

document.addEventListener('click', async (e) => {
  if (!e.target.classList.contains('btn-unarchive')) return;

  const button = e.target;
  const id = button.dataset.id;
  const token = localStorage.getItem('s4l_token');

  if (!token) { window.showToast?.('Not authenticated', 'error'); return; }

  const confirmed = await window.confirmAction?.('Restore this product? It will be active and visible to buyers again.');
  if (!confirmed) return;

  try {
    button.disabled = true;
    button.textContent = 'Restoring…';

    const res = await fetch(`${window.API_BASE}/products/${id}/unarchive`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) throw new Error('Unarchive failed');

    const restored = _archivedProducts.find(p => (p._id || p.id) === id);
    _archivedProducts = _archivedProducts.filter(p => (p._id || p.id) !== id);
    if (restored) {
      restored.archived = false;
      _allProducts.push(restored);
    }
    _saveArchivedCache();
    renderProducts();
    window.showToast?.('Product restored');
  } catch (err) {
    console.error(err);
    button.disabled = false;
    button.textContent = 'Unarchive';
    window.showToast?.('Restore failed', 'error');
  }
});

/* ── Delete ──────────────────────────────────────── */

document.addEventListener('click', async (e) => {
  if (!e.target.classList.contains('btn-delete')) return;

  const button = e.target;
  const id = button.dataset.id;
  const token = localStorage.getItem('s4l_token');

  if (!token) { window.showToast?.('Not authenticated', 'error'); return; }

  const confirmed = await window.confirmAction?.('Permanently delete this product? This cannot be undone.');
  if (!confirmed) return;

  try {
    button.disabled = true;
    button.textContent = 'Deleting…';

    const res = await fetch(`${window.API_BASE}/products/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Delete failed');

    _allProducts = _allProducts.filter(p => (p._id || p.id) !== id);
    renderProducts();
    window.showToast?.('Product deleted');
  } catch (err) {
    console.error(err);
    button.disabled = false;
    button.textContent = 'Delete';
    window.showToast?.(err.message || 'Delete failed', 'error');
  }
});

/* ── Coming Soon toggle ──────────────────────────── */

document.addEventListener('click', async (e) => {
  if (!e.target.classList.contains('btn-coming-soon-toggle')) return;

  const btn   = e.target;
  const id    = btn.dataset.id;
  const token = localStorage.getItem('s4l_token');
  if (!token) return;

  const product = _allProducts.find(p => (p._id || p.id) === id);
  if (!product) return;

  const newVal = !product.comingSoon;

  btn.disabled = true;
  btn.textContent = '…';

  try {
    const res = await fetch(`${window.API_BASE}/products/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ comingSoon: newVal }),
    });

    if (!res.ok) throw new Error('Failed');

    product.comingSoon = newVal;
    renderProducts();
    window.showToast?.(newVal ? '🕐 Coming Soon enabled' : '✓ Product unblocked');
  } catch (err) {
    console.error(err);
    btn.disabled = false;
    btn.textContent = '🕐';
    window.showToast?.('Update failed', 'error');
  }
});

/* ── CSV Import ──────────────────────────────────── */

function showCsvResult(created, skipped, skippedDetails) {
  const existing = document.getElementById('csv-result-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'csv-result-banner';

  if (skipped === 0) {
    banner.className = 'csv-result success';
    banner.textContent = `✓ ${created} product${created !== 1 ? 's' : ''} imported successfully.`;
  } else if (created === 0) {
    banner.className = 'csv-result error';
    banner.textContent = `Import failed — ${skipped} row${skipped !== 1 ? 's' : ''} had errors. Check your CSV and try again.`;
  } else {
    banner.className = 'csv-result partial';
    banner.textContent = `${created} imported, ${skipped} skipped (errors on rows: ${skippedDetails.map(s => s.row).join(', ')}).`;
  }

  const header = document.querySelector('.vp-page-header');
  header?.insertAdjacentElement('afterend', banner);
  setTimeout(() => banner.remove(), 8000);
}

function downloadCsvTemplate() {
  const header = 'name,price,comparePrice,shippingCost,stock,category,subcategory,sku,description,image1,image2';
  const example = 'Example Product,19.99,24.99,2.99,100,electronics,mobile,SKU001,Product description here,https://example.com/image1.jpg,';
  const blob = new Blob([header + '\n' + example], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'sell4life-import-template.csv';
  a.click();
  URL.revokeObjectURL(a.href);
}

const csvBtn   = document.getElementById('btn-import-csv');
const csvInput = document.getElementById('csv-file-input');

if (csvBtn && csvInput) {
  csvBtn.addEventListener('click', () => csvInput.click());

  csvInput.addEventListener('change', async () => {
    const file = csvInput.files?.[0];
    if (!file) return;

    csvBtn.textContent = 'Importing...';
    csvBtn.disabled = true;

    try {
      const text = await file.text();
      const token = localStorage.getItem('s4l_token');

      const res = await fetch(`${window.API_BASE}/vendor/products/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/csv',
          Authorization: `Bearer ${token}`,
        },
        body: text,
      });

      const data = await res.json();

      if (!res.ok) {
        showCsvResult(0, 1, [{ row: '—', reason: data.error || 'Unknown error' }]);
      } else {
        showCsvResult(data.created, data.skipped, data.skippedDetails || []);
        if (data.created > 0) await loadVendorProducts();
      }
    } catch (err) {
      console.error('CSV import error:', err);
      showCsvResult(0, 1, [{ row: '—', reason: 'Network error' }]);
    } finally {
      csvBtn.textContent = '↑ Import CSV';
      csvBtn.disabled = false;
      csvInput.value = '';
    }
  });
}

/* ── Auto-import from Tools page ─────────────────── */

async function runPendingCsvImport() {
  const csv = sessionStorage.getItem('s4l_pending_csv');
  if (!csv) return;
  sessionStorage.removeItem('s4l_pending_csv');

  if (csvBtn) { csvBtn.textContent = 'Importing...'; csvBtn.disabled = true; }

  try {
    const token = localStorage.getItem('s4l_token');
    const res = await fetch(`${window.API_BASE}/vendor/products/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/csv', Authorization: `Bearer ${token}` },
      body: csv,
    });
    const data = await res.json();
    if (!res.ok) {
      showCsvResult(0, 1, [{ row: '—', reason: data.error || 'Unknown error' }]);
    } else {
      showCsvResult(data.created, data.skipped, data.skippedDetails || []);
      if (data.created > 0) await loadVendorProducts();
    }
  } catch (err) {
    console.error('CSV import error:', err);
    showCsvResult(0, 1, [{ row: '—', reason: 'Network error' }]);
  } finally {
    if (csvBtn) { csvBtn.textContent = '↑ Import CSV'; csvBtn.disabled = false; }
  }
}

/* ── Start ───────────────────────────────────────── */

loadVendorProducts().then(runPendingCsvImport);
