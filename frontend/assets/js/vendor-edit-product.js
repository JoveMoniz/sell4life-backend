/* ======================================================
   INIT
====================================================== */

console.log('edit product loaded');

const params = new URLSearchParams(window.location.search);
const productId = params.get('id');

const categorySelect = document.getElementById('product-category');
const subcategorySelect = document.getElementById('product-subcategory');

/* ======================================================
   GUARD (PRODUCT ID CHECK)
====================================================== */

if (!productId) {
  alert('Product ID missing');
  window.location.href = '/account/vendor/products.html';
}

/* ======================================================
   AUTH TOKEN
====================================================== */

const token = localStorage.getItem('s4l_token');

if (!token) {
  alert('Not authenticated');
  window.location.href = '/account/signin.html';
}

/* ======================================================
   SUBCATEGORY LOGIC
====================================================== */

const subcategoriesMap = {
  fashion: ['Tops', 'Bottoms', 'Footwear', 'Accessories'],

  books: ['Fiction', 'Non-fiction', 'Children', 'Education'],

  electronics: ['Audio', 'Computers', 'Mobile', 'Gaming'],

  toys: ['Educational', 'Action Figures', 'Puzzles', 'Outdoor Play'],

  home: ['Kitchen', 'Decor', 'Furniture', 'Garden Tools'],

  health: ['Skincare', 'Haircare', 'Supplements', 'Grooming'],
};

categorySelect?.addEventListener('change', () => {
  const selected = categorySelect.value;

  subcategorySelect.innerHTML = '<option value="">Select subcategory</option>';

  if (!selected || !subcategoriesMap[selected]) {
    subcategorySelect.disabled = true;
    return;
  }

  subcategoriesMap[selected].forEach((sub) => {
    const option = document.createElement('option');
    option.value = sub.toLowerCase();
    option.textContent = sub;
    subcategorySelect.appendChild(option);
  });

  subcategorySelect.disabled = false;
});

/* ======================================================
   LOAD PRODUCT
====================================================== */

async function loadProduct() {
  try {
    // 🔥 CHECK VENDOR STATUS FIRST
    const vendorRes = await fetch(`${API_BASE}/vendor/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const vendorData = await vendorRes.json();
    const vendor = vendorData.vendor;

    if (!vendor) {
      alert('Create your store first');
      window.location.href = '/account/vendor/products.html';
      return;
    }

    if (vendor.status === 'pending') {
      alert('Your store is under review');
      window.location.href = '/account/vendor/products.html';
      return;
    }

    if (vendor.status === 'suspended') {
      alert('Your store is suspended');
      window.location.href = '/account/vendor/products.html';
      return;
    }
    const res = await fetch(`${API_BASE}/products/${productId}`);

    if (!res.ok) {
      alert('Product not accessible');
      window.location.href = '/account/vendor/products.html';
      return;
    }

    const product = await res.json();
    console.log('Loaded product:', product);

    /* ======================================================
       FILL BASIC FIELDS
    ====================================================== */

    document.getElementById('product-name').value = product.name || '';
    document.getElementById('product-description').value = product.description || '';
    document.getElementById('product-price').value = product.price || '';
    document.getElementById('product-stock').value = product.stock || '';
    document.getElementById('product-image').value = product.images?.[0] || '';

    /* ======================================================
       CATEGORY + SUBCATEGORY (CRITICAL ORDER)
    ====================================================== */

    categorySelect.value = product.category || '';

    // 🔥 trigger subcategory population
    categorySelect.dispatchEvent(new Event('change'));

    // 🔥 now set subcategory
    if (product.subcategory) {
      subcategorySelect.value = product.subcategory.toLowerCase();
    }
  } catch (err) {
    console.error('❌ Could not load product', err);
  }
}

/* ======================================================
   INITIAL LOAD
====================================================== */

loadProduct();

/* ======================================================
   FORM INIT
====================================================== */

const form = document.getElementById('edit-product-form');

if (!form) {
  console.error('❌ Form not found');
}

/* ======================================================
   SUBMIT HANDLER
====================================================== */

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const button = form.querySelector('button');

    button.disabled = true;
    button.textContent = 'Updating...';

    const imageValue = document.getElementById('product-image').value.trim();

    const product = {
      name: document.getElementById('product-name').value.trim(),
      description: document.getElementById('product-description').value.trim(),
      price: Number(document.getElementById('product-price').value),
      stock: Number(document.getElementById('product-stock').value),

      category: categorySelect.value,
      subcategory: subcategorySelect.value || null,

      images: imageValue ? [imageValue] : product.images || [],
    };

    /* ======================================================
       VALIDATION
    ====================================================== */

    if (!product.name) {
      showToast('Product name required', 'error');
      button.disabled = false;
      button.textContent = 'Update Product';
      return;
    }

    if (!Number.isFinite(product.price) || product.price < 0) {
      showToast('Invalid price', 'error');
      button.disabled = false;
      button.textContent = 'Update Product';
      return;
    }

    if (!product.category) {
      showToast('Select a category', 'error');
      button.disabled = false;
      button.textContent = 'Update Product';
      return;
    }

    if (!product.subcategory) {
      showToast('Select a subcategory', 'error');
      button.disabled = false;
      button.textContent = 'Update Product';
      return;
    }

    /* ======================================================
       API REQUEST
    ====================================================== */

    try {
      const res = await fetch(`${API_BASE}/products/${productId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(product),
      });

      if (!res.ok) {
        const data = await res.json();
        console.error('❌ Backend error:', data);
        throw new Error(data.error || 'Update failed');
      }

      showToast('Product updated');

      setTimeout(() => {
        window.location.href = '/account/vendor/products.html';
      }, 1000);
    } catch (err) {
      console.error('❌ Product update error:', err);

      button.disabled = false;
      button.textContent = 'Update Product';

      showToast('Product update failed', 'error');
    }
  });
}
