/* ======================================================
   INIT
====================================================== */

console.log('vendor products loaded');

const IMAGE_BASE = '/assets/images/products/';

/* ======================================================
   HELPERS (NEW)
====================================================== */

function formatText(text) {
  if (!text) return '';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/* ======================================================
   LOAD PRODUCTS
====================================================== */

async function loadVendorProducts() {
  const container = document.getElementById('vendor-products');
  const token = localStorage.getItem('s4l_token');

  const addBtn = document.querySelector('.btn-add-product-header');

  if (!container) {
    console.error('❌ Container not found');
    return;
  }

  if (!token) {
    container.innerHTML = '<p>Not authenticated</p>';
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/vendor/products`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) throw new Error('API error');

    const data = await res.json();

    const products = Array.isArray(data) ? data : [];

    if (!products.length) {
      if (addBtn) addBtn.style.display = 'none';

      container.innerHTML = `
        <div class="vendor-empty">
          <p>No products yet.</p>
          <a href="/account/vendor/add-product.html" class="btn-add-product">
            Add your first product
          </a>
        </div>
      `;
      return;
    }

    if (addBtn) addBtn.style.display = 'inline-block';

    container.innerHTML = products
      .map((p) => {
        const rawImage = p.images?.[0];

        const image =
          rawImage && typeof rawImage === 'string'
            ? rawImage.startsWith('http')
              ? rawImage
              : IMAGE_BASE + rawImage
            : '/assets/images/products/sell4life-placeholder.png';

        const id = p._id || p.id;

        return `
          <div class="vendor-product-card" data-id="${id}">

            <img src="${image}" alt="${p.name || 'product'}">

            <h3>${p.name || 'Unnamed product'}</h3>

            <!-- 🔥 NEW: CATEGORY DISPLAY -->
            <div class="product-cat">
              ${formatText(p.category)}${p.subcategory ? ' / ' + formatText(p.subcategory) : ''}
            </div>

            <div class="price">£${Number(p.price || 0).toFixed(2)}</div>
            <div class="stock">Stock: ${p.stock ?? 0}</div>

            <div class="vendor-product-actions">

              <a href="/account/vendor/edit-product.html?id=${id}" class="btn-edit">
                Edit
              </a>

              <button class="btn-delete" data-id="${id}">
                Delete
              </button>

            </div>

          </div>
        `;
      })
      .join('');
  } catch (err) {
    console.error('Vendor products load error:', err);
    container.innerHTML = '<p>Could not load products</p>';
  }
}

/* ======================================================
   ARCHIVE PRODUCT
====================================================== */

document.addEventListener('click', async (e) => {
  if (!e.target.classList.contains('btn-delete')) return;

  const button = e.target;
  const id = button.dataset.id;
  const token = localStorage.getItem('s4l_token');

  if (!token) {
    showToast('Not authenticated', 'error');
    return;
  }

  const confirmed = await confirmAction('Archive this product?');
  if (!confirmed) return;

  try {
    button.disabled = true;
    button.textContent = 'Archiving...';

    await fetch(`${API_BASE}/products/${id}/archive`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!res.ok) throw new Error('Archive failed');

    const card = document.querySelector(`.vendor-product-card[data-id="${id}"]`);
    if (card) card.remove();

    showToast('Product archived');
  } catch (err) {
    console.error(err);

    button.disabled = false;
    button.textContent = 'Archive';

    showToast('Product archive failed', 'error');
  }
});

/* ======================================================
   INIT
====================================================== */

loadVendorProducts();
