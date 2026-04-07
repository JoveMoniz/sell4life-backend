/* ======================================================
   INIT
====================================================== */

console.log('add product loaded');

const form = document.getElementById('add-product-form');
const categorySelect = document.getElementById('product-category');
const subcategorySelect = document.getElementById('product-subcategory');

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

window.addEventListener('load', () => {
  const categorySelect = document.getElementById('product-category');
  const subcategorySelect = document.getElementById('product-subcategory');

  if (!categorySelect || !subcategorySelect) {
    console.error('❌ Category elements not found');
    return;
  }

  categorySelect.addEventListener('change', () => {
    const selected = categorySelect.value;

    subcategorySelect.innerHTML = '<option value="">Select subcategory</option>';

    if (!selected || !subcategoriesMap[selected]) {
      subcategorySelect.disabled = true;
      return;
    }

    subcategorySelect.disabled = false;

    subcategoriesMap[selected].forEach((sub) => {
      const option = document.createElement('option');
      option.value = sub.toLowerCase();
      option.textContent = sub;
      subcategorySelect.appendChild(option);
    });
  });
});

/* ======================================================
   GUARD
====================================================== */

if (!form) {
  console.error('❌ Form not found');
}

/* ======================================================
   SUBMIT HANDLER
====================================================== */

if (form) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const token = localStorage.getItem('s4l_token');

    if (!token) {
      alert('Not authenticated');
      return;
    }

    const button = form.querySelector('button');
    button.disabled = true;
    button.textContent = 'Creating...';

    const imageValue = document.getElementById('product-image').value.trim();
    const name = document.getElementById('product-name').value.trim();

    const product = {
      name,
      description: document.getElementById('product-description').value.trim(),
      price: Number(document.getElementById('product-price').value),
      stock: Number(document.getElementById('product-stock').value),

      category: categorySelect.value,
      subcategory: subcategorySelect.value || null, // ✅ FIXED

      images: imageValue ? [imageValue] : [],
    };

    /* ======================================================
       VALIDATION
    ====================================================== */

    if (!product.name) {
      showToast('Product name required', 'error');
      button.disabled = false;
      button.textContent = 'Create Product';
      return;
    }

    if (isNaN(product.price) || product.price < 0) {
      showToast('Invalid price', 'error');
      button.disabled = false;
      button.textContent = 'Create Product';
      return;
    }

    if (!product.category) {
      showToast('Select a category', 'error');
      button.disabled = false;
      button.textContent = 'Create Product';
      return;
    }

    if (!product.subcategory) {
      showToast('Select a subcategory', 'error');
      button.disabled = false;
      button.textContent = 'Create Product';
      return;
    }

    /* ======================================================
       API REQUEST
    ====================================================== */

    try {
      const res = await fetch(`${API_BASE}/products`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(product),
      });

      const data = await res.json();

      if (!res.ok) {
        console.error('❌ Backend error:', data);
        throw new Error(data.error || 'Product creation failed');
      }

      console.log('✅ Product created:', data);

      showToast('Product created');

      setTimeout(() => {
        window.location.href = '/account/vendor/products.html';
      }, 1000);
    } catch (err) {
      console.error('❌ Add product error:', err);

      button.disabled = false;
      button.textContent = 'Create Product';

      showToast('Product creation failed', 'error');
    }
  });
}
