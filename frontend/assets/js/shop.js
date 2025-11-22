// /frontend/assets/js/shop.js
(async function () { 
  const container = document.getElementById("product-list");

  // Always use clean absolute paths in frontend
  const IMAGE_BASE = "/assets/images/products/";

  // 1. Load products.json
  let products = [];
  try {
    const res = await fetch("/data/products.json", { cache: "no-store" });
    products = await res.json();
  } catch (err) {
    console.error("Failed to load /data/products.json:", err);
    container.innerHTML = `<p>Could not load products.</p>`;
    return;
  }

  // 2. Read category + subcategory from URL
  const params = new URLSearchParams(location.search);
  const selectedCategory = params.get("category");
  const selectedSub = params.get("subcategory");

  // 3. Filter the products
  let filtered = products;

  if (selectedCategory) {
    filtered = filtered.filter(p => p.category === selectedCategory);
  }

  if (selectedSub) {
    filtered = filtered.filter(p => p.subcategory === selectedSub);
  }

  // 4. If no results, give user a message
  if (filtered.length === 0) {
    container.innerHTML = `<p>No products found in this category.</p>`;
    return;
  }

  // 5. Render filtered products
  container.innerHTML = filtered.map(p => `
    <div class="product-card">
      <a href="/product/product.html?id=${p.id}">
        <img src="${IMAGE_BASE + p.images[0]}" alt="${p.name}">
        <h3>${p.name}</h3>
        <p>£${p.price.toFixed(2)}</p>
      </a>
    </div>
  `).join("");
})();
