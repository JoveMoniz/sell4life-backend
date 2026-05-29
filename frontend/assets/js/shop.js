// ── URL params ─────────────────────────────────────────────
const params = new URLSearchParams(window.location.search);

const searchQuery = (params.get('q')         || '').toLowerCase().trim();
const vendorId    = (params.get('vendorId')  || '').trim();
const storeName   = (params.get('storeName') || '').trim();

// Category pages link with IDs like "home-garden"; products store "home"
const urlCategory = (params.get('category') || '').toLowerCase().trim();
const CAT_VALUE   = { 'home-garden': 'home', 'health-beauty': 'health' };
const catToFilter = id => CAT_VALUE[id] || id;

// ── State ──────────────────────────────────────────────────
let allProducts    = [];
let activeCategory = urlCategory;
let activeSort     = 'newest';
let categoryList   = [];
let pillsReady     = null; // Promise resolved when categoryList is populated

// ── DOM ────────────────────────────────────────────────────
const grid        = document.getElementById('product-list');
const browse      = document.getElementById('shop-browse');
const pillsWrap   = document.getElementById('shop-cat-pills');
const sortSel     = document.getElementById('shop-sort');
const countEl     = document.getElementById('shop-count');
const filterChip  = document.getElementById('shop-active-filter');
const filterLabel = document.getElementById('shop-filter-label');
const clearBtn    = document.getElementById('shop-clear-filter');
const shopControls = document.querySelector('.shop-controls');

// ── Browse mode flag ───────────────────────────────────────
function isBrowseMode() {
  return !searchQuery && !vendorId && !activeCategory;
}

// ── Vendor banner ──────────────────────────────────────────
if (vendorId && storeName) {
  const titleEl = document.getElementById('shop-title');
  if (titleEl) {
    titleEl.textContent = `Products by ${storeName}`;
    const back = document.createElement('p');
    back.className = 'shop-vendor-back';
    back.innerHTML = '<a href="/stores/">← Back to all stores</a>';
    titleEl.insertAdjacentElement('afterend', back);
  }
}

// ── Skeleton ───────────────────────────────────────────────
function showSkeleton() {
  if (isBrowseMode()) {
    if (browse) {
      browse.style.display = 'block';
      browse.innerHTML = Array(3).fill(`
        <section class="shop-row">
          <div class="shop-row-header">
            <div class="shop-skel-title"></div>
          </div>
          <div class="shop-row-outer">
            <div class="shop-row-track">
              ${Array(5).fill(`
                <div class="shop-skeleton shop-row-skel-card">
                  <div class="shop-skel-img"></div>
                  <div class="shop-skel-line"></div>
                  <div class="shop-skel-line short"></div>
                </div>`).join('')}
            </div>
          </div>
        </section>`).join('');
    }
    grid.style.display = 'none';
  } else {
    if (browse) browse.style.display = 'none';
    grid.style.display = '';
    grid.innerHTML = Array(8).fill(`
      <div class="shop-skeleton">
        <div class="shop-skel-img"></div>
        <div class="shop-skel-line"></div>
        <div class="shop-skel-line short"></div>
      </div>`).join('');
  }
}

// ── Category pills ─────────────────────────────────────────
function loadPills() {
  if (!pillsWrap) { pillsReady = Promise.resolve(); return; }
  pillsReady = (async () => {
    try {
      const res  = await fetch('/data/category.json');
      const cats = await res.json();
      categoryList = cats;

      pillsWrap.innerHTML = [{ id: '', name: 'All' }, ...cats].map(cat => {
        const active = cat.id === '' ? !activeCategory : cat.id === activeCategory;
        return `<button class="shop-cat-pill${active ? ' active' : ''}"
                  type="button" data-cat="${cat.id}">${cat.name}</button>`;
      }).join('');

      pillsWrap.addEventListener('click', e => {
        const btn = e.target.closest('.shop-cat-pill');
        if (!btn) return;
        activeCategory = btn.dataset.cat;
        pillsWrap.querySelectorAll('.shop-cat-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyFilters();
      });
    } catch { /* pills are non-critical */ }
  })();
}

// ── Active filter chip ─────────────────────────────────────
function updateChip() {
  if (!filterChip) return;
  if (activeCategory) {
    const pill = pillsWrap ? pillsWrap.querySelector(`[data-cat="${activeCategory}"]`) : null;
    if (filterLabel) filterLabel.textContent = pill ? pill.textContent : activeCategory;
    filterChip.classList.add('show');
  } else {
    filterChip.classList.remove('show');
  }
}

if (clearBtn) {
  clearBtn.addEventListener('click', () => {
    activeCategory = '';
    if (pillsWrap) {
      pillsWrap.querySelectorAll('.shop-cat-pill').forEach(b => b.classList.remove('active'));
      const all = pillsWrap.querySelector('[data-cat=""]');
      if (all) all.classList.add('active');
    }
    applyFilters();
  });
}

if (sortSel) sortSel.addEventListener('change', () => { activeSort = sortSel.value; applyFilters(); });

// ── Sort ───────────────────────────────────────────────────
function sorted(list) {
  const s = [...list];
  if (activeSort === 'price-asc')  return s.sort((a, b) => Number(a.price) - Number(b.price));
  if (activeSort === 'price-desc') return s.sort((a, b) => Number(b.price) - Number(a.price));
  if (activeSort === 'name-asc')   return s.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  return s; // newest = API order
}

// ── Recently viewed ────────────────────────────────────────
function getRecentlyViewed() {
  try {
    const ids = JSON.parse(localStorage.getItem('s4l_recently_viewed') || '[]');
    const map = new Map(allProducts.map(p => [p._id || p.id, p]));
    return ids.map(id => map.get(id)).filter(Boolean).slice(0, 12);
  } catch { return []; }
}

// ── Card ───────────────────────────────────────────────────
function renderCard(p) {
  const id    = p._id || p.id;
  const price = Number(p.price || 0).toFixed(2);

  // Store for quick-add modal lookup
  window._qaProducts = window._qaProducts || {};
  window._qaProducts[id] = p;

  const compareRaw = p.comparePrice ?? p.compare_price ?? null;
  const compareEl  = compareRaw && Number(compareRaw) > Number(p.price)
    ? `<span class="sp-compare">£${Number(compareRaw).toFixed(2)}</span>` : '';

  let img = '/assets/images/products/sell4life-placeholder.png';
  if (Array.isArray(p.images) && p.images[0]) {
    img = p.images[0].startsWith('http') ? p.images[0] : `/assets/images/products/${p.images[0]}`;
  } else if (p.image) {
    img = p.image;
  }

  const basketBtn = !p.comingSoon ? `
    <button class="sp-quick-add-btn" data-id="${id}" title="Add to basket">
      <svg width="21" height="24" viewBox="0 0 24 28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7 13C7 5 17 5 17 13"/>
        <path d="M1 12H23V23Q23 27 19 27H5Q1 27 1 23V12Z"/>
      </svg>
      <span class="sp-qa-clr" title="Remove from basket">CLR</span>
    </button>` : '';

  return `
    <div class="sp-card-wrap">
      <a href="/product/product.html?id=${id}" class="sp-card${p.comingSoon ? ' sp-card-coming-soon' : ''}">
        <div class="sp-img-wrap">
          <img src="${img}" alt="${p.name}" loading="lazy"
            onerror="this.src='/assets/images/products/sell4life-placeholder.png'" />
          ${p.comingSoon ? '<div class="sp-coming-soon-badge">🕐 Coming Soon</div>' : ''}
        </div>
        <div class="sp-info">
          <p class="sp-name">${p.name}</p>
        </div>
      </a>
      <div class="sp-card-footer">
        <div class="sp-price-row">
          <span class="sp-price">£${price}</span>
          ${compareEl}
        </div>
        ${basketBtn}
      </div>
    </div>`;
}

// ── Build a horizontal scroll row ─────────────────────────
function buildRow(title, products, seeAllHref) {
  if (!products.length) return '';
  const cards  = products.map(renderCard).join('');
  const seeAll = seeAllHref
    ? `<a class="shop-row-see-all" href="${seeAllHref}">See all →</a>`
    : '';
  return `
    <section class="shop-row">
      <div class="shop-row-header">
        <h2 class="shop-row-title">${title}</h2>
        ${seeAll}
      </div>
      <div class="shop-row-outer">
        <button class="shop-row-arrow arrow-left" aria-label="Scroll left" tabindex="-1">‹</button>
        <div class="shop-row-track">${cards}</div>
        <button class="shop-row-arrow arrow-right" aria-label="Scroll right" tabindex="-1">›</button>
      </div>
    </section>`;
}

// ── Render browse mode ─────────────────────────────────────
function renderBrowseMode() {
  if (!browse) return;

  let html = '';

  // New Arrivals (first 12, API order = newest)
  html += buildRow('New Arrivals', allProducts.slice(0, 12), '/shop/');

  // Per-category rows
  const catMap = new Map();
  allProducts.forEach(p => {
    const cat = (p.category || '').toLowerCase();
    if (!cat) return;
    if (!catMap.has(cat)) catMap.set(cat, []);
    catMap.get(cat).push(p);
  });

  const cats = categoryList.length
    ? categoryList
    : [...catMap.keys()].map(id => ({ id, name: id.charAt(0).toUpperCase() + id.slice(1) }));

  cats.forEach(cat => {
    const catVal   = catToFilter(cat.id);
    const products = catMap.get(catVal) || [];
    if (products.length < 2) return;
    html += buildRow(cat.name, products.slice(0, 12), `/shop/?category=${cat.id}`);
  });

  // Recently Viewed
  const recent = getRecentlyViewed();
  if (recent.length >= 2) {
    html += buildRow('Recently Viewed', recent, '');
  }

  browse.innerHTML = html;
  browse.style.display = 'block';
  grid.style.display = 'none';

  // Arrow click handlers
  browse.querySelectorAll('.shop-row').forEach(row => {
    const track = row.querySelector('.shop-row-track');
    row.querySelector('.arrow-left')?.addEventListener('click', () =>
      track.scrollBy({ left: -600, behavior: 'smooth' }));
    row.querySelector('.arrow-right')?.addEventListener('click', () =>
      track.scrollBy({ left: 600, behavior: 'smooth' }));
  });
}

// ── Filter → render pipeline ───────────────────────────────
function applyFilters() {
  const browseMode = isBrowseMode();

  if (shopControls) shopControls.style.display = browseMode ? 'none' : '';
  updateChip();

  if (browseMode) {
    if (countEl) countEl.textContent = '';
    renderBrowseMode();
    return;
  }

  let list = allProducts;

  if (vendorId) {
    list = list.filter(p => {
      const pv = p.vendor?._id ? String(p.vendor._id) : String(p.vendor || '');
      return pv === vendorId;
    });
  }

  if (activeCategory) {
    const val = catToFilter(activeCategory);
    list = list.filter(p => (p.category || '').toLowerCase() === val);
  }

  list = sorted(list);

  if (countEl) countEl.textContent = `${list.length} product${list.length !== 1 ? 's' : ''}`;

  if (browse) browse.style.display = 'none';
  grid.style.display = '';
  renderProducts(list);
}

// ── Grid render ────────────────────────────────────────────
function renderProducts(list) {
  grid.innerHTML = list.length
    ? list.map(renderCard).join('')
    : `<div class="shop-empty">
         <strong>No products found</strong>
         Try a different category or clear the filter.
       </div>`;
}

// ── Load ───────────────────────────────────────────────────
async function loadProducts() {
  showSkeleton();

  const qs  = ['limit=500'];
  if (searchQuery) qs.push(`search=${encodeURIComponent(searchQuery)}`);
  if (vendorId)    qs.push(`vendor=${encodeURIComponent(vendorId)}`);
  const url = `${window.API_BASE}/products?${qs.join('&')}`;

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error('API error');
    const data = await res.json();
    allProducts = Array.isArray(data) ? data : (Array.isArray(data.products) ? data.products : []);
  } catch {
    if (browse) browse.style.display = 'none';
    grid.style.display = '';
    grid.innerHTML = `<div class="shop-empty">
      <strong>Could not load products</strong>Please try again later.</div>`;
    return;
  }

  // Ensure categoryList is loaded before rendering browse rows
  if (pillsReady) await pillsReady;

  applyFilters();
}

// ── Start ──────────────────────────────────────────────────
loadPills();
loadProducts();
