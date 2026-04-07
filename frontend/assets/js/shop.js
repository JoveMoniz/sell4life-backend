// =====================================================
// SELL4LIFE SHOP PAGE (API ONLY - STABLE VERSION)
// =====================================================

console.log('shop.js loaded');

let products = [];

// -----------------------------------------------------
// URL PARAMS
// -----------------------------------------------------

const params = new URLSearchParams(window.location.search);

const searchQuery = (params.get('q') || '').toLowerCase().trim();
const selectedCategory = (params.get('category') || '').toLowerCase().trim();
const selectedSubcategory = (params.get('subcategory') || '').toLowerCase().trim();

const normalize = (str = '') => str.toLowerCase().trim();

const grid = document.getElementById('product-list');

// =====================================================
// LOAD PRODUCTS (API ONLY)
// =====================================================

async function loadProducts() {
  try {
    let url = `${API_BASE}/products`;

    // Backend handles search
    if (searchQuery) {
      url += `?search=${encodeURIComponent(searchQuery)}`;
    }

    const res = await fetch(url);

    if (!res.ok) {
      throw new Error('API error');
    }

    const data = await res.json();

    products = Array.isArray(data.products) ? data.products : [];

    // -------------------------------------------------
    // FILTER (CATEGORY + SUBCATEGORY ONLY)
    // -------------------------------------------------

    const filtered = products.filter((p) => {
      const cat = normalize(p.category);
      const sub = normalize(p.subcategory);

      const matchCategory = selectedCategory ? cat === selectedCategory : true;

      const matchSubcategory = selectedSubcategory ? sub === selectedSubcategory : true;

      return matchCategory && matchSubcategory;
    });

    renderProducts(filtered);
  } catch (err) {
    console.error('LOAD PRODUCTS ERROR:', err);
    renderProducts([]);
  }
}

// =====================================================
// RENDER GRID
// =====================================================

function renderProducts(list) {
  if (!grid) return;

  if (!Array.isArray(list) || list.length === 0) {
    grid.innerHTML = '<p>No products found.</p>';
    return;
  }

  grid.innerHTML = list.map(renderProductCard).join('');
}

// =====================================================
// PRODUCT CARD
// =====================================================

function renderProductCard(product) {
  const id = product._id || product.id;
  const name = product.name || 'Product';
  const price = Number(product.price || 0).toFixed(2);

  let image = '/assets/images/products/sell4life-placeholder.png';

  if (product.image && typeof product.image === 'string') {
    const img = product.image.trim();

    if (img.includes('.') && !img.endsWith('/')) {
      image = img;
    }
  } else if (Array.isArray(product.images) && product.images.length) {
    const first = product.images[0];

    if (typeof first === 'string' && first.includes('.')) {
      image = `/assets/images/products/${first}`;
    }
  }

  return `
    <a href="/product/product.html?id=${id}" class="product-card">
      <img 
        src="${image}" 
        alt="${name}"
        onerror="this.src='/assets/images/products/sell4life-placeholder.png'"
      >
      <div class="product-info">
        <h3>${name}</h3>
        <p class="product-price">£${price}</p>
      </div>
    </a>
  `;
}

// =====================================================
// START
// =====================================================

loadProducts();
