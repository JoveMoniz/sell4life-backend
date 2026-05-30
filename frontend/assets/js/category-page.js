// ======================================================
// CATEGORY PAGE (MODERN + DEFENSIVE VERSION)
// ======================================================

(async function () {
  console.log('category-page.js loaded');

  // ======================================================
  // CONFIG
  // ======================================================
  const API_URL = 'https://sell4life-backend.onrender.com/api/products';
  const CATEGORY_JSON_URL = '/data/category.json';
  const IMAGE_BASE = '/assets/images/products/';
  const FALLBACK_IMAGE = '/assets/images/products/sell4life-placeholder.png';

  // ======================================================
  // HELPERS
  // ======================================================

  const $ = (sel, root = document) => root.querySelector(sel);

  const normalize = (str = '') => str.toLowerCase().replace(/\s+/g, '-');

  const makePrice = (p) => {
    const currency = p.currency || '£';
    const value = Number(p.price || 0);
    return currency + value.toFixed(2);
  };

  const getProductId = (p) => p._id || p.id;

  const resolveImage = (p) => {
    const img = p.images?.[0] || '';

    if (!img) return FALLBACK_IMAGE;

    return img.startsWith('http') ? img : IMAGE_BASE + img;
  };

  // ======================================================
  // LOAD PRODUCTS (API + FALLBACK)
  // ======================================================
  async function loadProducts() {
    try {
      const res = await fetch(API_URL);
      const data = await res.json();

      const products = data.products;

      if (Array.isArray(products) && products.length > 0) {
        console.log('Using API products');
        return products;
      }

      throw new Error('API empty');
    } catch (err) {
      console.warn('Fallback to products.json');

      const res = await fetch('/data/products.json', { cache: 'no-store' });
      return res.json();
    }
  }

  // ======================================================
  // HTML BUILDERS
  // ======================================================

  function productCardHtml(p) {
    const id = getProductId(p);

    // Store for quick-add modal lookup
    window._qaProducts = window._qaProducts || {};
    window._qaProducts[id] = p;

    const basketBtn = p.comingSoon ? '' : `
      <button class="cp-quick-add-btn" data-id="${id}" title="Add to basket">
        <svg width="21" height="24" viewBox="0 0 24 28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 13C7 5 17 5 17 13"/>
          <path d="M1 12H23V23Q23 27 19 27H5Q1 27 1 23V12Z"/>
        </svg>
        <span class="cp-qa-clr" title="Remove from basket">CLR</span>
      </button>`;

    return `
      <div class="cp-card-wrap product-card${p.comingSoon ? ' card-coming-soon' : ''}">
        <a href="/product/product.html?id=${encodeURIComponent(id)}">
          <div style="position:relative">
            <img src="${resolveImage(p)}" alt="${p.name}">
            ${p.comingSoon ? '<div class="sp-coming-soon-badge">🕐 Coming Soon</div>' : ''}
          </div>
          <h3>${p.name}</h3>
        </a>
        <div class="sp-card-footer">
          <p class="product-price" style="margin:0">${makePrice(p)}</p>
          ${basketBtn}
        </div>
      </div>
    `;
  }

  function featuredCardHtml(p) {
    return `
      <a class="featured-item" href="/product/product.html?id=${encodeURIComponent(getProductId(p))}">
        <img src="${resolveImage(p)}" alt="${p.name}">
        <h3>${p.name}</h3>
        <div class="price">${makePrice(p)}</div>
      </a>
    `;
  }

  // ======================================================
  // RESOLVE CATEGORY FROM URL
  // ======================================================

  function getCategoryIdFromPath() {
    const parts = location.pathname.split('/').filter(Boolean);
    const last = parts[parts.length - 1] || '';
    return last.replace('.html', '').toLowerCase();
  }

  const categoryId = getCategoryIdFromPath();
  if (!categoryId) return;

  // ======================================================
  // LOAD DATA
  // ======================================================

  let categories = [];
  let products = [];

  try {
    const [catRes, prodData] = await Promise.all([
      fetch(CATEGORY_JSON_URL, { cache: 'no-store' }),
      loadProducts(),
    ]);

    categories = await catRes.json();
    products = prodData;
  } catch (err) {
    console.error('Failed loading data:', err);
    return;
  }

  // ======================================================
  // MATCH CATEGORY
  // ======================================================

  const category = categories.find((c) => normalize(c.id) === categoryId);

  // ======================================================
  // FUTURE-PROOF CATEGORY + SUBCATEGORY FILTER
  // ======================================================

  const urlParams = new URLSearchParams(location.search);
  const subcategoryId = normalize(urlParams.get('subcategory') || '');

  console.log('Category:', categoryId);
  console.log('Subcategory:', subcategoryId);

  const catProducts = products.filter((p) => {
    if (!p.category) return false;

    const matchCategory = normalize(p.category) === categoryId;

    // no subcategory yet → only filter by category
    if (!subcategoryId) return matchCategory;

    // future: filter by subcategory too
    const matchSubcategory = p.subcategory && normalize(p.subcategory) === subcategoryId;

    return matchCategory && matchSubcategory;
  });
  // ======================================================
  // FEATURED SECTION
  // ======================================================

  const featuredWrap = $('#featured-list');

  if (featuredWrap) {
    const featured = catProducts.slice(0, 2);

    featuredWrap.innerHTML = featured.length
      ? featured.map(featuredCardHtml).join('')
      : `<p class="empty-note">No featured products yet.</p>`;
    window.s4l_markOwnListings?.();
  }

  // ======================================================
  // SUBCATEGORIES
  // ======================================================

  const subcatWrap = $('#subcategory-cards');

  if (subcatWrap && category?.subcategories) {
    subcatWrap.innerHTML = category.subcategories
      .map((sub) => {
        const href = `/shop/index.html?category=${encodeURIComponent(category.id)}&subcategory=${encodeURIComponent(sub.id)}`;
        const imgSrc = sub.image || `/assets/images/category/${category.id}/${sub.id}.png`;

        return `
          <a href="${href}" class="subcat-card">
            <div class="subcat-thumb">
              <img src="${imgSrc}" alt="${sub.name}">
            </div>
            <span class="subcat-name">${sub.name}</span>
          </a>
        `;
      })
      .join('');
  }

  // ======================================================
  // ALL PRODUCTS GRID
  // ======================================================

  const productsWrap = $('#category-product-grid');

  if (productsWrap) {
    productsWrap.innerHTML = catProducts.length
      ? catProducts.map(productCardHtml).join('')
      : `<p class="empty-note">No products found in this category yet.</p>`;
    window.s4l_markOwnListings?.();
  }

  // ======================================================
  // UI TITLES
  // ======================================================

  if (category) {
    const title = $('.category-products h2');
    if (title) title.textContent = `All ${category.name}`;

    const shopBtn = $('.btn-shop-all');
    if (shopBtn) {
      shopBtn.textContent = `Shop All ${category.name}`;
      shopBtn.href = `/shop/index.html?category=${encodeURIComponent(category.id)}`;
    }
  }
})();
