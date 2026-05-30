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

  // ── Short description (tagline) ────────────────────────────
  const shortDescEl = document.getElementById('pd-short-desc');
  const shortDesc = product.shortDescription || product.short_description || '';

  if (shortDescEl) {
    if (shortDesc) {
      shortDescEl.textContent = shortDesc;
    } else {
      shortDescEl.style.display = 'none';
    }
  }

  // ── Bullet points: gallery info (desktop) + product info ───
  const bulletPoints = product.bulletPoints || '';

  function renderBullets(text) {
    const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length > 1) {
      return '<ul class="pd-bullets">' +
        lines.map(l => `<li>${l.replace(/^[•\-\*✓]\s*/, '')}</li>`).join('') +
        '</ul>';
    }
    return `<p class="pd-gallery-short">${text}</p>`;
  }

  // ── Gallery info: bullets under slider (desktop only) ──────
  const galleryInfoEl = document.getElementById('pd-gallery-info');
  if (galleryInfoEl && bulletPoints) {
    galleryInfoEl.innerHTML = renderBullets(bulletPoints);
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
  const variantImageMap = {}; // variantIndex → 1-based gallery slide index
  const toSrc = (s) => (s && s.startsWith('http')) ? s : IMAGE_BASE + s;

  if (hiddenGallery && Array.isArray(product.images)) {
    hiddenGallery.innerHTML = '';
    const addedSrcs = new Set();
    product.images.forEach((imgFile) => {
      const src = toSrc(imgFile);
      const img = document.createElement('img');
      img.setAttribute('src', src);
      img.alt = product.name;
      hiddenGallery.appendChild(img);
      addedSrcs.add(src);
    });
    if (Array.isArray(product.variants)) {
      product.variants.forEach((v, i) => {
        if (!v.image) return;
        const src = toSrc(v.image);
        // Only map to an existing gallery slide — never add variant images as new slides
        const children = Array.from(hiddenGallery.children);
        const found = children.findIndex((el) => el.getAttribute('src') === src);
        if (found !== -1) variantImageMap[i] = found + 1;
      });
    }
    [product.videoUrl, product.videoUrl2].forEach((url) => {
      if (!url) return;
      const vDiv = document.createElement('div');
      vDiv.className = 'video-slide-src';
      vDiv.dataset.url = url;
      hiddenGallery.appendChild(vDiv);
    });
    document.dispatchEvent(new Event('productImagesLoaded'));
  }

  // ── Variant selectors ─────────────────────────────────────
  let currentVariant = null;
  const variantsEl = document.getElementById('pd-variants');
  const variantDivider = document.getElementById('pd-divider-variants');
  const priceEl = $('.product-price');

  if (product.variants && product.variants.length > 0 && variantsEl) {
    const sampleAttrs = product.variants[0].attributes || {};
    const attrNames = Object.keys(sampleAttrs);

    if (attrNames.length > 0) {
      // Build colorMap: { attrName: { attrValue: hexColor } }
      const colorMap = {};
      product.variants.forEach((v) => {
        if (!v.color) return;
        attrNames.forEach((name) => {
          const val = v.attributes[name];
          if (!val) return;
          if (!colorMap[name]) colorMap[name] = {};
          if (!colorMap[name][val]) colorMap[name][val] = v.color;
        });
      });

      const html = attrNames.map((attrName) => {
        const values = [...new Set(product.variants.map((v) => v.attributes[attrName]).filter(Boolean))];
        let hasSwatch = false;
        const buttons = values.map((val) => {
          const v = product.variants.find(v2 => v2.attributes[attrName] === val);
          const useImg = v?.displayMode === 'image' || (!v?.displayMode && product.variantDisplay === 'image');
          if (useImg) {
            hasSwatch = true;
            const imgSrc = v?.image ? toSrc(v.image) : '';
            return `<button type="button" class="pd-img-swatch" data-attr="${attrName}" data-val="${val}" title="${val}">${
              imgSrc ? `<img src="${imgSrc}" alt="${val}" loading="lazy" />` : `<span>${val}</span>`
            }</button>`;
          }
          const hex = v?.color || colorMap[attrName]?.[val];
          const forceColor = v?.displayMode === 'color' || (!v?.displayMode && !v?.image);
          if (hex || forceColor) {
            hasSwatch = true;
            return `<button type="button" class="pd-color-swatch" data-attr="${attrName}" data-val="${val}" style="background:${hex || '#e5e7eb'}" title="${val}"></button>`;
          }
          return `<button type="button" class="pd-variant-pill" data-attr="${attrName}" data-val="${val}">${val}</button>`;
        }).join('');
        const selector = `<div class="pd-variant-pills">${buttons}${hasSwatch ? '<span class="pd-swatch-selected-name"></span>' : ''}</div>`;
        return `<div class="pd-variant-group"><div class="pd-variant-label">${attrName}</div>${selector}</div>`;
      }).join('');

      variantsEl.innerHTML = html;
      if (variantDivider) variantDivider.style.display = '';

      const selections = {};

      function findMatchingVariant() {
        return product.variants.find((v) =>
          attrNames.every((name) => (v.attributes[name] || '') === (selections[name] || ''))
        ) || null;
      }

      function switchGalleryToVariant(v) {
        if (!v) return;
        const vi = product.variants.indexOf(v);
        const slideIdx = variantImageMap[vi];
        if (slideIdx == null) return;
        const thumbs = document.querySelectorAll('.thumb-img');
        const thumb = thumbs[slideIdx - 1];
        if (thumb) thumb.click();
      }

      function applyVariant() {
        const v = findMatchingVariant();
        currentVariant = v;
        const price = (v && v.price != null) ? v.price : product.price;
        const stockVal = (v && v.stock != null) ? v.stock : product.stock;
        if (priceEl) priceEl.textContent = `£${Number(price).toFixed(2)}`;
        // Don't change buttons if product is Coming Soon
        if (!product.comingSoon) {
          const oos = stockVal !== undefined && stockVal <= 0;
          addBtns.forEach((btn) => {
            btn.disabled = oos;
            btn.textContent = oos ? 'Out of stock' : 'Add to Basket';
          });
          if (buyBtn) { buyBtn.disabled = oos; buyBtn.textContent = oos ? 'Out of stock' : 'Buy Now'; }
        }
        switchGalleryToVariant(v);
      }

      variantsEl.addEventListener('click', (e) => {
        const pill      = e.target.closest('.pd-variant-pill');
        const swatch    = e.target.closest('.pd-color-swatch');
        const imgSwatch = e.target.closest('.pd-img-swatch');
        const target = pill || swatch || imgSwatch;
        if (!target) return;
        const attr = target.dataset.attr;
        variantsEl.querySelectorAll(
          `.pd-variant-pill[data-attr="${attr}"], .pd-color-swatch[data-attr="${attr}"], .pd-img-swatch[data-attr="${attr}"]`
        ).forEach((p) => p.classList.remove('selected'));
        target.classList.add('selected');
        if (swatch || imgSwatch) {
          const nameEl = target.closest('.pd-variant-pills')?.querySelector('.pd-swatch-selected-name');
          if (nameEl) nameEl.textContent = target.dataset.val;
          const val = target.dataset.val;
          const vi = product.variants.findIndex((v) => v.attributes[attr] === val && v.image);
          if (vi >= 0 && variantImageMap[vi] != null) {
            const thumbs = document.querySelectorAll('.thumb-img');
            const thumb = thumbs[variantImageMap[vi] - 1];
            if (thumb) thumb.click();
          }
        }
        selections[attr] = target.dataset.val;
        applyVariant();
      });
    }
  }

  // ── Add-ons ────────────────────────────────────────────────
  let selectedAddOns = [];
  const addOnsEl = document.getElementById('pd-addons');
  const addOnsDivider = document.getElementById('pd-divider-addons');

  if (product.addOns && product.addOns.length > 0 && addOnsEl) {
    const html = `
      <div class="pd-addons-label">Optional Extras</div>
      ${product.addOns.map((ao, i) => `
        <label class="pd-addon-item" data-index="${i}">
          <input type="checkbox" class="pd-addon-check" data-index="${i}" data-price="${ao.price}" />
          ${ao.image ? `<img src="${ao.image}" class="pd-addon-thumb" alt="${ao.name}" />` : ''}
          <div class="pd-addon-info">
            <div class="pd-addon-name">${ao.name}</div>
            ${ao.description ? `<div class="pd-addon-desc">${ao.description}</div>` : ''}
          </div>
          <div class="pd-addon-price">+£${Number(ao.price).toFixed(2)}</div>
        </label>
      `).join('')}
    `;
    addOnsEl.innerHTML = html;
    if (addOnsDivider) addOnsDivider.style.display = '';

    function updateAddOnsTotal() {
      selectedAddOns = [];
      addOnsEl.querySelectorAll('.pd-addon-check:checked').forEach((cb) => {
        const i = parseInt(cb.dataset.index, 10);
        selectedAddOns.push(product.addOns[i]);
      });
      const basePrice = (currentVariant && currentVariant.price != null) ? currentVariant.price : product.price;
      const addOnTotal = selectedAddOns.reduce((s, ao) => s + ao.price, 0);
      if (priceEl) priceEl.textContent = `£${(basePrice + addOnTotal).toFixed(2)}`;
    }

    addOnsEl.addEventListener('change', (e) => {
      if (!e.target.classList.contains('pd-addon-check')) return;
      const label = e.target.closest('.pd-addon-item');
      if (label) label.classList.toggle('selected', e.target.checked);
      updateAddOnsTotal();
    });
  }

  // ── Stock / out-of-stock ───────────────────────────────────
  const addBtns = document.querySelectorAll('.btn-add');
  const buyBtn = $('.btn-buy');
  const isOos = product.stock !== undefined && product.stock <= 0 && (!product.variants || product.variants.length === 0);

  if (isOos) {
    addBtns.forEach((btn) => { btn.disabled = true; btn.textContent = 'Out of stock'; });
    if (buyBtn) { buyBtn.disabled = true; buyBtn.textContent = 'Out of stock'; }
  }

  // ── Prevent vendor from purchasing their own product ──────────────────
  const _myVendorId = localStorage.getItem('s4l_vendorId');
  const _productVendorId = typeof product.vendor === 'object'
    ? (product.vendor?._id || product.vendor?.id)
    : product.vendor;
  if (_myVendorId && _productVendorId && _myVendorId === String(_productVendorId)) {
    const _pid = product._id || product.id;
    addBtns.forEach((btn) => {
      btn.disabled = true;
      btn.textContent = 'Your listing';
      btn.style.cssText = 'background:#f0faf9;color:#0b6b6a;border:1.5px solid rgba(11,107,106,0.3);cursor:default;opacity:0.75';
    });
    if (buyBtn) {
      buyBtn.disabled = false;
      buyBtn.textContent = '✏️ Edit product';
      buyBtn.style.cssText = 'background:#0b6b6a;color:#fff';
      buyBtn.onclick = (e) => {
        e.preventDefault();
        window.location.href = `/account/vendor/edit-product.html?id=${_pid}`;
      };
    }
  }

  // ── Coming Soon ────────────────────────────────────────────
  if (product.comingSoon) {
    // Disable all buy buttons and replace text
    addBtns.forEach((btn) => { btn.disabled = true; btn.textContent = '🕐 Coming Soon'; btn.classList.add('btn-coming-soon'); });
    if (buyBtn) { buyBtn.disabled = true; buyBtn.textContent = '🕐 Coming Soon'; buyBtn.classList.add('btn-coming-soon'); }
    // Disable quantity stepper
    const qMinus = document.getElementById('pd-qty-minus');
    const qPlus  = document.getElementById('pd-qty-plus');
    if (qMinus) qMinus.disabled = true;
    if (qPlus)  qPlus.disabled  = true;
    // Insert banner below the price
    const priceBlock = $('.product-price')?.closest('.pd-price-row') || $('.product-price');
    if (priceBlock) {
      const banner = document.createElement('div');
      banner.className = 'pd-coming-soon-banner';
      banner.innerHTML = '🕐 <strong>Coming Soon</strong> — This product is not yet available for purchase.';
      priceBlock.insertAdjacentElement('afterend', banner);
    }
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
    const hasVariants = product.variants && product.variants.length > 0;
    if (hasVariants && !currentVariant) {
      window.showToast?.('Please select a variant first');
      return { added: false };
    }

    let cart = JSON.parse(localStorage.getItem('cart') || '[]')
      .filter((i) => i && (i.productId || i.id));

    const addOnTotal = selectedAddOns.reduce((s, ao) => s + ao.price, 0);
    const effectivePrice = ((currentVariant && currentVariant.price != null) ? currentVariant.price : product.price) + addOnTotal;

    const existing = cart.find((i) => {
      if ((i.productId || i.id) !== pid) return false;
      if (!currentVariant && !i.variant) return true;
      if (!currentVariant || !i.variant) return false;
      return JSON.stringify(currentVariant.attributes) === JSON.stringify(i.variant.attributes);
    });

    if (existing) {
      const stockToCheck = (currentVariant && currentVariant.stock != null) ? currentVariant.stock : product.stock;
      const desired = existing.quantity + currentQty;
      if (product.trackInventory && desired > stockToCheck) {
        window.showToast?.(`Only ${stockToCheck} in stock`);
        existing.quantity = stockToCheck;
      } else {
        existing.quantity = desired;
      }
    } else {
      cart.push({
        productId: pid, _id: pid,
        name: product.name,
        price: effectivePrice,
        image: productImage,
        quantity: currentQty,
        category: product.category,
        subcategory: product.subcategory,
        vendor: product.vendor,
        variant: currentVariant
          ? { attributes: currentVariant.attributes, sku: currentVariant.sku, price: currentVariant.price }
          : undefined,
        addOns: selectedAddOns.length ? selectedAddOns.map((ao) => ({ name: ao.name, price: ao.price })) : undefined,
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
      const hasVariants = product.variants && product.variants.length > 0;
      if (hasVariants && !currentVariant) {
        window.showToast?.('Please select a variant first');
        return;
      }
      const buyAddOnTotal = selectedAddOns.reduce((s, ao) => s + ao.price, 0);
      const buyPrice = ((currentVariant && currentVariant.price != null) ? currentVariant.price : product.price) + buyAddOnTotal;
      localStorage.setItem('cart', JSON.stringify([{
        productId: pid, name: product.name,
        price: buyPrice, image: productImage,
        quantity: currentQty,
        variant: currentVariant ? { attributes: currentVariant.attributes, sku: currentVariant.sku, price: currentVariant.price } : undefined,
        addOns: selectedAddOns.length ? selectedAddOns.map((ao) => ({ name: ao.name, price: ao.price })) : undefined,
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
