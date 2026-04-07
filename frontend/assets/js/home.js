// ======================================================
// LOAD CATEGORIES
// ======================================================

async function loadCategories() {
  try {
    const res = await fetch('/data/category.json');
    const categories = await res.json();

    const container = document.getElementById('s4l-categories');
    if (!container) return;

    container.innerHTML = categories
      .map(
        (cat) => `
      <div class="category-card">
        <a href="/category/${cat.id}.html">
          <img src="${cat.image}" alt="${cat.name}">
        </a>
      </div>
    `
      )
      .join('');
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

// ======================================================
// LOAD FEATURED PRODUCTS
// ======================================================

async function loadFeaturedProducts() {
  const container = document.querySelector('.featured-products-grid');
  if (!container) return;

  let products = [];

  try {
    const res = await fetch('https://sell4life-backend.onrender.com/api/products');
    const data = await res.json();

    // backend returns { products: [...] }
    products = data.products;

    if (!Array.isArray(products) || products.length === 0) {
      throw new Error('API empty or invalid');
    }

    console.log('Featured products from API');
  } catch (err) {
    console.log('Fallback to products.json');

    const res = await fetch('/data/products.json');
    products = await res.json();
  }

  const featured = products.slice(0, 4);

  container.innerHTML = featured
    .map((p) => {
      // ---------------------------
      // IMAGE HANDLING (FULLY MERGED)
      // ---------------------------
      const image = p.images?.[0] || '';

      const imageSrc = image
        ? image.startsWith('http')
          ? image
          : `/assets/images/products/${image}`
        : '/assets/images/products/sell4life-placeholder.png';

      return `
      <div class="product-card">
        <a href="/product/product.html?id=${p._id || p.id}">
          <img src="${imageSrc}" alt="${p.name}">
          <h3>${p.name}</h3>
          <p class="price">£${Number(p.price).toFixed(2)}</p>
        </a>
      </div>
    `;
    })
    .join('');
}

// ======================================================
// INIT HOMEPAGE
// ======================================================

function initHomePage() {
  loadCategories();
  loadFeaturedProducts();
}

// run immediately
initHomePage();

// run again after layout loads (important for your system)
document.addEventListener('layoutReady', initHomePage);
