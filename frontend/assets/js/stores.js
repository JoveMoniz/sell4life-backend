(() => {
  const BASE = window.API_BASE || 'https://sell4life-backend.onrender.com/api';
  const grid = document.getElementById('stores-grid');
  const searchInput = document.getElementById('stores-search');
  const countEl = document.getElementById('stores-count');

  let allStores = [];

  // ?id=vendorId — set when arriving from a product page "Visit Store" link
  const urlParams = new URLSearchParams(window.location.search);
  let activeVendorId = urlParams.get('id') || '';

  // ── Banner shown when filtered to a single store ──────────
  function setBanner(show) {
    let banner = document.getElementById('stores-vendor-banner');
    if (show && !banner) {
      banner = document.createElement('div');
      banner.id = 'stores-vendor-banner';
      banner.className = 'stores-vendor-banner';
      banner.innerHTML =
        'Viewing a specific store from a product page. ' +
        '<button type="button" id="stores-show-all">View all stores ›</button>';
      const toolbar = document.querySelector('.stores-toolbar');
      toolbar.parentNode.insertBefore(banner, toolbar);
      document.getElementById('stores-show-all').addEventListener('click', () => {
        activeVendorId = '';
        setBanner(false);
        searchInput.value = '';
        renderCards(allStores);
      });
    } else if (!show && banner) {
      banner.remove();
    }
  }

  // ── Avatar initials or logo ────────────────────────────────
  function avatarHTML(store) {
    if (store.storeLogo) {
      return `<img src="${store.storeLogo}" alt="${store.storeName}" loading="lazy" />`;
    }
    return store.storeName
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase();
  }

  // ── Render cards ───────────────────────────────────────────
  function renderCards(stores) {
    if (!stores.length) {
      grid.innerHTML = '<div class="stores-empty">No stores found.</div>';
      countEl.textContent = '';
      return;
    }

    countEl.textContent = `${stores.length} store${stores.length === 1 ? '' : 's'}`;

    grid.innerHTML = stores
      .map(
        (s) => `
      <div class="store-card" data-id="${s._id}">
        <div class="store-card-avatar">${avatarHTML(s)}</div>
        <div class="store-card-body">
          <div class="store-card-name">${s.storeName}</div>
          <div class="store-card-slug">@${s.storeSlug}</div>
          ${s.storeDescription ? `<div class="store-card-desc">${s.storeDescription}</div>` : ''}
          <div class="store-card-meta">${s.productCount} product${s.productCount === 1 ? '' : 's'}</div>
        </div>
        <a class="store-card-btn" href="/shop/?vendorId=${s._id}&storeName=${encodeURIComponent(s.storeName)}">Browse Products →</a>
      </div>`
      )
      .join('');
  }

  // ── Filter logic ───────────────────────────────────────────
  function applyFilter() {
    const q = (searchInput.value || '').trim().toLowerCase();

    // Vendor ID filter (from ?id= param, cleared once user types)
    if (activeVendorId && !q) {
      const match = allStores.filter((s) => String(s._id) === activeVendorId);
      setBanner(true);
      renderCards(match.length ? match : allStores);
      return;
    }

    setBanner(false);

    if (!q) {
      renderCards(allStores);
      return;
    }

    renderCards(
      allStores.filter(
        (s) =>
          s.storeName.toLowerCase().includes(q) ||
          s.storeSlug.toLowerCase().includes(q) ||
          (s.storeDescription || '').toLowerCase().includes(q)
      )
    );
  }

  // ── Load ───────────────────────────────────────────────────
  async function load() {
    try {
      const res = await fetch(`${BASE}/stores`);
      if (!res.ok) throw new Error('Failed');
      const data = await res.json();
      allStores = data.stores || [];
      applyFilter();
    } catch {
      grid.innerHTML =
        '<div class="stores-empty">Unable to load stores. Please try again later.</div>';
      countEl.textContent = '';
    }
  }

  searchInput.addEventListener('input', () => {
    activeVendorId = ''; // typing overrides the vendor ID filter
    applyFilter();
  });

  load();
})();
