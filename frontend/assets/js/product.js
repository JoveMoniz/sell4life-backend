console.log('product.js loaded');

(async function () {
  const $ = (sel) => document.querySelector(sel);

  const API = window.API_BASE || '';
  const IMAGE_BASE = '/assets/images/products/';

  // ── Get product ID ─────────────────────────────────────────
  const params = new URLSearchParams(window.location.search);
  const productId = params.get('id');
  if (!productId) { console.warn('No ?id=... in URL'); return; }

  // ── Load product ───────────────────────────────────────────
  let product = null;

  try {
    const res = await fetch(`${API}/products/${productId}`);
    if (res.ok) product = await res.json();
  } catch (e) {}

  if (!product) {
    try {
      const res = await fetch('/data/products.json', { cache: 'no-store' });
      const all = await res.json();
      product = all.find((p) => p.id === productId);
    } catch (e) {}
  }

  if (!product) { console.error('Product not found:', productId); return; }

  const pid = product._id || product.id;

  // Track recently viewed (for shop browse rows)
  try {
    const key     = 's4l_recently_viewed';
    const stored  = JSON.parse(localStorage.getItem(key) || '[]');
    const updated = [pid, ...stored.filter(id => id !== pid)].slice(0, 20);
    localStorage.setItem(key, JSON.stringify(updated));
  } catch { /* storage unavailable */ }
  const firstImage = product.images?.[0] || '';
  const productImage = firstImage.startsWith('http') ? firstImage : IMAGE_BASE + firstImage;

  // ── Title / page title ─────────────────────────────────────
  if ($('.product-title')) $('.product-title').textContent = product.name;
  document.title = `${product.name} | Sell4Life`;

  const _desc = (product.description || product.name).replace(/<[^>]+>/g, '').slice(0, 155);
  const _setMeta = (sel, val) => { const el = document.querySelector(sel); if (el) el.setAttribute('content', val); };
  _setMeta('meta[name="description"]', _desc);
  _setMeta('meta[property="og:title"]', `${product.name} | Sell4Life`);
  _setMeta('meta[property="og:description"]', _desc);

  // ── Category breadcrumb ────────────────────────────────────
  if ($('.product-category')) {
    const cat = product.category || '';
    const sub = product.subcategory || '';
    $('.product-category').textContent = sub ? `${cat} › ${sub}` : cat;
  }

  // ── Price ──────────────────────────────────────────────────
  if ($('.product-price')) {
    $('.product-price').textContent = `£${Number(product.price).toFixed(2)}`;
  }

  // ── Shipping note ─────────────────────────────────────────
  const shippingNote = document.getElementById('pd-shipping-note');
  if (shippingNote) {
    const sc = Number(product.shippingCost || 0);
    shippingNote.textContent = sc > 0 ? `+ £${sc.toFixed(2)} shipping` : 'Free shipping';
    shippingNote.style.display = 'block';
  }

  // ── Compare / RRP price ────────────────────────────────────
  const compareRaw = product.comparePrice ?? product.compare_price ?? null;
  const compareEl = document.getElementById('pd-compare-price');
  if (compareEl && compareRaw && Number(compareRaw) > Number(product.price)) {
    compareEl.textContent = `£${Number(compareRaw).toFixed(2)}`;
  }

  // ── Stock badge ────────────────────────────────────────────
  const stockBadge = document.getElementById('pd-stock-badge');
  if (stockBadge && product.stock !== undefined) {
    if (product.stock > 0 && product.stock <= 2) {
      stockBadge.textContent = `Only ${product.stock} left!`;
      stockBadge.className = 'pd-stock-badge critical';
    } else if (product.stock <= 5) {
      stockBadge.textContent = `Only ${product.stock} left`;
      stockBadge.className = 'pd-stock-badge low';
    }
  }

  // ── Short description ──────────────────────────────────────
  const shortDescEl = document.getElementById('pd-short-desc');
  const shortDesc = product.shortDescription || product.short_description || '';
  if (shortDescEl) {
    if (shortDesc) {
      shortDescEl.textContent = shortDesc;
    } else {
      shortDescEl.style.display = 'none';
    }
  }

  // ── Full description + read more ───────────────────────────
  const descEl = $('.product-desc');
  const descWrap = document.getElementById('pd-desc-wrap');
  const readMoreBtn = document.getElementById('pd-read-more');

  if (descEl) descEl.textContent = product.description || '';

  if (descEl && readMoreBtn) {
    requestAnimationFrame(() => {
      if (descEl.scrollHeight > descEl.clientHeight + 4) {
        readMoreBtn.style.display = 'inline-block';
      }
    });
    readMoreBtn.addEventListener('click', () => {
      const expanded = descWrap.classList.toggle('expanded');
      readMoreBtn.textContent = expanded ? 'Show less ▴' : 'Read more ▾';
    });
  }

  // ── Seller strip ───────────────────────────────────────────
  const sellerStrip = document.getElementById('pd-seller-strip');
  const sellerAvatarEl = document.getElementById('pd-seller-avatar');
  const sellerNameEl = document.getElementById('pd-seller-name');
  const sellerLinkEl = document.getElementById('pd-seller-link');
  const dividerBeforeSeller = document.getElementById('pd-divider-before-seller');
  const dividerAfterSeller = document.getElementById('pd-divider-after-seller');

  const vendorObj = product.vendor;
  if (vendorObj) {
    const vendorId = typeof vendorObj === 'object'
      ? (vendorObj._id || vendorObj.id)
      : vendorObj;
    let displayName = typeof vendorObj === 'object'
      ? (vendorObj.storeName || vendorObj.businessName || vendorObj.name || null)
      : null;

    if (!displayName && vendorId) {
      try {
        const vRes = await fetch(`${API}/vendors/${vendorId}`);
        if (vRes.ok) {
          const v = await vRes.json();
          displayName = v.storeName || v.businessName || v.name || null;
        }
      } catch (e) {}
    }

    displayName = displayName || 'Seller';
    if (sellerNameEl) sellerNameEl.textContent = displayName;
    if (sellerAvatarEl) sellerAvatarEl.textContent = displayName.charAt(0).toUpperCase();
    if (sellerLinkEl && vendorId) sellerLinkEl.href = `/stores/?id=${vendorId}`;

    // Show verified badge when we have a real store name (all active stores are approved)
    const verifiedBadge = document.getElementById('pd-verified-badge');
    if (verifiedBadge && displayName !== 'Seller') {
      verifiedBadge.classList.add('show');
    }
  } else {
    if (sellerStrip) sellerStrip.style.display = 'none';
    if (dividerBeforeSeller) dividerBeforeSeller.style.display = 'none';
    if (dividerAfterSeller) dividerAfterSeller.style.display = 'none';
  }

  // ── Render images ──────────────────────────────────────────
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

  // ── Stock / out-of-stock ───────────────────────────────────
  const addBtns = document.querySelectorAll('.btn-add');
  const buyBtn = $('.btn-buy');
  const isOos = product.stock !== undefined && product.stock <= 0;

  if (isOos) {
    addBtns.forEach((btn) => { btn.disabled = true; btn.textContent = 'Out of stock'; });
    if (buyBtn) { buyBtn.disabled = true; buyBtn.textContent = 'Out of stock'; }
  }

  // ── Quantity stepper ───────────────────────────────────────
  let currentQty = 1;
  const maxStock = (product.trackInventory && product.stock > 0) ? product.stock : 99;
  const qtyValEl = document.getElementById('pd-qty-val');
  const qtyMinus = document.getElementById('pd-qty-minus');
  const qtyPlus = document.getElementById('pd-qty-plus');

  function setQty(n) {
    currentQty = Math.max(1, Math.min(n, maxStock));
    if (qtyValEl) qtyValEl.textContent = currentQty;
    if (qtyMinus) qtyMinus.disabled = currentQty <= 1;
    if (qtyPlus) qtyPlus.disabled = currentQty >= maxStock;
  }

  setQty(1);
  if (qtyMinus) qtyMinus.addEventListener('click', () => setQty(currentQty - 1));
  if (qtyPlus)  qtyPlus.addEventListener('click',  () => setQty(currentQty + 1));

  if (isOos) {
    if (qtyMinus) qtyMinus.disabled = true;
    if (qtyPlus)  qtyPlus.disabled  = true;
  }

  // ── Add to cart ────────────────────────────────────────────
  function addToCart() {
    let cart = JSON.parse(localStorage.getItem('cart') || '[]')
      .filter((i) => i && (i.productId || i.id));

    const existing = cart.find((i) => (i.productId || i.id) === pid);

    if (existing) {
      const desired = existing.quantity + currentQty;
      if (product.trackInventory && desired > product.stock) {
        window.showToast?.(`Only ${product.stock} in stock`);
        existing.quantity = product.stock;
      } else {
        existing.quantity = desired;
      }
    } else {
      cart.push({
        productId: pid, _id: pid,
        name: product.name, price: product.price,
        image: productImage, quantity: currentQty,
        category: product.category, subcategory: product.subcategory,
        vendor: product.vendor,
      });
    }

    localStorage.setItem('cart', JSON.stringify(cart));
    document.dispatchEvent(new Event('cartUpdated'));
    return { cart, added: true };
  }

  addBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      if (isOos) { window.showToast?.('Out of stock'); return; }
      const result = addToCart();
      const badge = document.querySelector('.basket-qty');
      if (badge) {
        const total = result.cart.reduce((s, i) => s + (i.quantity || 0), 0);
        badge.textContent = total;
        badge.classList.remove('hide');
      }
      const label = currentQty > 1 ? `×${currentQty} added to basket` : 'Added to basket';
      window.showToast?.(label);
    });
  });

  // ── Buy Now ────────────────────────────────────────────────
  if (buyBtn) {
    buyBtn.addEventListener('click', () => {
      const existingCart = JSON.parse(localStorage.getItem('cart') || '[]');
      if (existingCart.length && !localStorage.getItem('cart_backup')) {
        localStorage.setItem('cart_backup', JSON.stringify(existingCart));
      }
      localStorage.setItem('cart', JSON.stringify([{
        productId: pid, name: product.name,
        price: product.price, image: productImage,
        quantity: currentQty,
      }]));
      localStorage.setItem('buyNow', 'true');
      window.location.href = '/cart/checkout.html';
    });
  }

  document.dispatchEvent(new Event('productLoaded'));

  // ── Related products ───────────────────────────────────────
  loadRelatedProducts(product.category, pid);

  async function loadRelatedProducts(category, currentPid) {
    const relSection = document.getElementById('pd-related');
    const relGrid = document.getElementById('pd-related-grid');
    if (!relSection || !relGrid || !category) return;

    let products = [];

    try {
      const res = await fetch(`${API}/products?category=${encodeURIComponent(category)}&limit=8`);
      if (res.ok) {
        const data = await res.json();
        products = Array.isArray(data) ? data : (data.products || []);
      }
    } catch (e) {}

    if (!products.length) {
      try {
        const res = await fetch('/data/products.json', { cache: 'no-store' });
        const all = await res.json();
        products = all.filter((p) => p.category === category);
      } catch (e) {}
    }

    products = products
      .filter((p) => (p._id || p.id) !== currentPid)
      .slice(0, 4);

    if (!products.length) return;

    relGrid.innerHTML = products.map((p) => {
      const raw = p.images?.[0] || '';
      const imgSrc = raw ? (raw.startsWith('http') ? raw : IMAGE_BASE + raw) : '';
      const id = p._id || p.id;
      const imgEl = imgSrc
        ? `<img class="pd-rel-img" src="${imgSrc}" alt="${p.name}" loading="lazy" />`
        : `<div class="pd-rel-img"></div>`;
      return `
        <a href="/product/product.html?id=${id}" class="pd-rel-card">
          ${imgEl}
          <div class="pd-rel-info">
            <p class="pd-rel-name">${p.name}</p>
            <p class="pd-rel-price">£${Number(p.price).toFixed(2)}</p>
          </div>
        </a>`;
    }).join('');

    relSection.style.display = 'block';
  }
})();
