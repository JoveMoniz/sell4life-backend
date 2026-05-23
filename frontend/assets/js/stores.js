(() => {
  const BASE = window.API_BASE || 'https://sell4life-backend.onrender.com';
  const grid = document.getElementById('stores-grid');
  const searchInput = document.getElementById('stores-search');
  const countEl = document.getElementById('stores-count');

  let allStores = [];

  function avatarHTML(store) {
    if (store.storeLogo) {
      return `<img src="${store.storeLogo}" alt="${store.storeName}" loading="lazy" />`;
    }
    const initials = store.storeName
      .split(/\s+/)
      .slice(0, 2)
      .map(w => w[0])
      .join('')
      .toUpperCase();
    return initials;
  }

  function renderCards(stores) {
    if (!stores.length) {
      grid.innerHTML = '<div class="stores-empty">No stores found.</div>';
      countEl.textContent = '';
      return;
    }

    countEl.textContent = `${stores.length} store${stores.length === 1 ? '' : 's'}`;

    grid.innerHTML = stores.map(s => `
      <div class="store-card">
        <div class="store-card-avatar">${avatarHTML(s)}</div>
        <div class="store-card-body">
          <div class="store-card-name">${s.storeName}</div>
          <div class="store-card-slug">@${s.storeSlug}</div>
          ${s.storeDescription ? `<div class="store-card-desc">${s.storeDescription}</div>` : ''}
          <div class="store-card-meta">${s.productCount} product${s.productCount === 1 ? '' : 's'}</div>
        </div>
        <a class="store-card-btn" href="/shop/?vendor=${encodeURIComponent(s.storeSlug)}">Browse Products →</a>
      </div>
    `).join('');
  }

  function applyFilter() {
    const q = (searchInput.value || '').trim().toLowerCase();
    if (!q) {
      renderCards(allStores);
      return;
    }
    const filtered = allStores.filter(s =>
      s.storeName.toLowerCase().includes(q) ||
      s.storeSlug.toLowerCase().includes(q) ||
      (s.storeDescription || '').toLowerCase().includes(q)
    );
    renderCards(filtered);
  }

  async function load() {
    try {
      const res = await fetch(`${BASE}/api/stores`);
      if (!res.ok) throw new Error('Failed to load stores');
      const data = await res.json();
      allStores = data.stores || [];
      applyFilter();
    } catch {
      grid.innerHTML = '<div class="stores-empty">Unable to load stores. Please try again later.</div>';
      countEl.textContent = '';
    }
  }

  searchInput.addEventListener('input', applyFilter);
  load();
})();
