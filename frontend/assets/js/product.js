// ======================================================
// SELL4LIFE – PRODUCT PAGE
// Loads product data and handles cart actions
// ======================================================

console.log('product.js loaded');

(async function () {
  const $ = (sel) => document.querySelector(sel);

  const API = window.API_BASE || '';
  const IMAGE_BASE = '/assets/images/products/';

  // ======================================================
  // GET PRODUCT ID FROM URL
  // ======================================================

  const params = new URLSearchParams(window.location.search);
  const productId = params.get('id');

  if (!productId) {
    console.warn('No ?id=... in URL');
    return;
  }

  // ======================================================
  // LOAD PRODUCT FROM API
  // ======================================================

  let product = null;

  try {
    const res = await fetch(`${API}/products/${productId}`);

    if (res.ok) {
      product = await res.json();
      console.log('Loaded API product');
    }
  } catch (err) {
    console.log('API product load failed');
  }

  // ======================================================
  // FALLBACK JSON CATALOGUE
  // ======================================================

  if (!product) {
    try {
      const res = await fetch('/data/products.json', { cache: 'no-store' });

      const products = await res.json();

      product = products.find((p) => p.id === productId);

      console.log('Loaded JSON product');
    } catch (err) {
      console.error('JSON fallback failed', err);
    }
  }

  if (!product) {
    console.error('Product not found:', productId);
    return;
  }

  // ======================================================
  // NORMALIZE PRODUCT ID
  // ======================================================

  const pid = product._id || product.id;

  // ======================================================
  // IMAGE HELPER
  // ======================================================

  const firstImage = product.images?.[0] || '';

  const productImage = firstImage.startsWith('http') ? firstImage : IMAGE_BASE + firstImage;

  // ======================================================
  // RENDER PRODUCT INFO
  // ======================================================

  if ($('.product-title')) $('.product-title').textContent = product.name;

  if ($('.product-category')) {
    const category = product.category || '';
    const sub = product.subcategory || '';

    $('.product-category').textContent = sub ? `${category} / ${sub}` : category;
  }

  if ($('.product-price')) $('.product-price').textContent = `£${Number(product.price).toFixed(2)}`;

  if ($('.product-desc')) $('.product-desc').textContent = product.description;

  // ======================================================
  // RENDER PRODUCT IMAGES
  // ======================================================

  const hiddenGallery = document.getElementById('hidden-gallery');

  if (hiddenGallery && Array.isArray(product.images)) {
    hiddenGallery.innerHTML = '';

    product.images.forEach((imgFile) => {
      const img = document.createElement('img');

      img.src = imgFile.startsWith('http') ? imgFile : IMAGE_BASE + imgFile;

      img.alt = product.name;

      hiddenGallery.appendChild(img);
    });

    document.dispatchEvent(new Event('productImagesLoaded'));
  }

  // ======================================================
  // STOCK CHECK
  // ======================================================

  const addBtns = document.querySelectorAll('.btn-add');
  const buyBtn = $('.btn-buy');

  if (product.stock !== undefined && product.stock <= 0) {
    addBtns.forEach((btn) => {
      btn.disabled = true;
      btn.textContent = 'Out of stock';
    });

    if (buyBtn) {
      buyBtn.disabled = true;
      buyBtn.textContent = 'Out of stock';
    }
  }

  // ======================================================
  // ADD TO CART
  // ======================================================

  function addToCart() {
    let cart = JSON.parse(localStorage.getItem('cart') || '[]').filter(
      (i) => i && (i.productId || i.id)
    );

    const existing = cart.find((i) => (i.productId || i.id) === pid);

    if (existing) {
      if (product.trackInventory && existing.quantity >= product.stock) {
        if (window.showToast) {
          window.showToast(`${product.name}: only ${product.stock} left`);
        }
        return { cart, added: false };
      }

      existing.quantity = (existing.quantity || 1) + 1;
    } else {
      cart.push({
        productId: pid,
        _id: pid,
        name: product.name,
        price: product.price,
        image: productImage,
        quantity: 1,
        category: product.category,
        subcategory: product.subcategory,
        vendor: product.vendor,
      });
    }

    localStorage.setItem('cart', JSON.stringify(cart));
    document.dispatchEvent(new Event('cartUpdated'));

    return { cart, added: true };
  }

  // ======================================================
  // ADD TO CART BUTTON
  // ======================================================

  addBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (product.stock !== undefined && product.stock <= 0) {
        if (window.showToast) {
          window.showToast('Out of stock');
        }
        return;
      }
      const result = addToCart();

      const badge = document.querySelector('.basket-qty');

      if (badge) {
        const cart = result.cart;
        const totalQty = cart.reduce((sum, item) => sum + (item.quantity || 0), 0);

        badge.textContent = totalQty;
        badge.classList.remove('hide');
      }

      console.log('Added to basket:', product.name);

      if (result.added && window.showToast) {
        window.showToast('Added to cart');
      }
    });
  });

  // ======================================================
  // BUY NOW
  // ======================================================

  if (buyBtn) {
    buyBtn.addEventListener('click', () => {
      if (!localStorage.getItem('cart_backup')) {
        const existingCart = JSON.parse(localStorage.getItem('cart') || '[]');

        if (existingCart.length) {
          localStorage.setItem('cart_backup', JSON.stringify(existingCart));
        }
      }

      const buyNowCart = [
        {
          productId: pid,
          name: product.name,
          price: product.price,
          image: productImage,
          quantity: 1,
        },
      ];

      localStorage.setItem('cart', JSON.stringify(buyNowCart));
      localStorage.setItem('buyNow', 'true');

      window.location.href = '/cart/checkout.html';
    });
  }

  document.dispatchEvent(new Event('productLoaded'));
})();
