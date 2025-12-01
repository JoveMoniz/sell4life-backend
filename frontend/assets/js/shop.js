// /frontend/assets/js/shop.js

(async function () { 
  console.log("shop.js loaded");

  const container = document.getElementById("product-list");
  const IMAGE_BASE = "/assets/images/products/";

  // ---------------------------------------------------------
  // 1. Load products.json
  // ---------------------------------------------------------
  let products = [];
  try {
    const res = await fetch("/data/products.json", { cache: "no-store" });
    products = await res.json();
  } catch (err) {
    console.error("Failed to load /data/products.json:", err);
    container.innerHTML = `<p>Could not load products.</p>`;
    return;
  }

  // ---------------------------------------------------------
  // 2. Read URL parameters
  // ---------------------------------------------------------
  const params = new URLSearchParams(window.location.search);

  const searchTerm = (params.get("q") || "").trim().toLowerCase();
  const selectedCategory = (params.get("category") || "").trim().toLowerCase();
  const selectedSub = (params.get("subcategory") || "").trim().toLowerCase();

  console.log("Search term:", searchTerm);
  console.log("Category:", selectedCategory);
  console.log("Subcategory:", selectedSub);

  // ---------------------------------------------------------
  // 3. BASE FILTER
  // ---------------------------------------------------------
  let filtered = products;

  // CATEGORY (case-insensitive)
  if (selectedCategory) {
    filtered = filtered.filter(p =>
      p.category.toLowerCase() === selectedCategory
    );
  }

  // SUBCATEGORY
  if (selectedSub) {
    filtered = filtered.filter(p =>
      p.subcategory.toLowerCase() === selectedSub
    );
  }

  // SEARCH FILTER
  if (searchTerm) {
    filtered = filtered.filter(p => {
      const name = p.name.toLowerCase();
      const cat  = p.category.toLowerCase();
      const sub  = p.subcategory.toLowerCase();

      return (
        name.includes(searchTerm) ||
        cat.includes(searchTerm) ||
        sub.includes(searchTerm)
      );
    });
  }

  // ---------------------------------------------------------
  // 4. HANDLE EMPTY RESULTS
  // ---------------------------------------------------------
  if (filtered.length === 0) {
    container.innerHTML = `<p>No products found.</p>`;
    return;
  }

  // ---------------------------------------------------------
  // 5. RENDER PRODUCTS
  // ---------------------------------------------------------
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
