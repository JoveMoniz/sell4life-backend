async function loadCategories() {
  try {
    const res = await fetch('../../data/category.json');
    const categories = await res.json();

    const container = document.getElementById('s4l-categories');
    if (!container) return;

    container.innerHTML = categories.map(cat => `
      <div class="category-card">
        <a href="/category/${cat.id}.html">
          <img src="${cat.image}" alt="${cat.name}">
        </a>
      </div>
    `).join('');
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

// ✅ stub — keeps console clean, future-proof
async function loadFeaturedProducts() {
  // intentionally empty for now
}

document.addEventListener('DOMContentLoaded', () => {
  loadCategories();
  loadFeaturedProducts();
});
