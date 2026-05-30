// ======================================================================
// SELL4LIFE CART.JS — CLEAN MERGED VERSION (hybrid-safe)
// SINGLE TOAST SYSTEM
// ======================================================================//

const toast = (msg) => window.showToast && window.showToast(msg);

(async function () {
  // ---------------------------------------------------------
  // 1. LocalStorage SAFE read & write
  // ---------------------------------------------------------
  function readCart() {
    try {
      const arr = JSON.parse(localStorage.getItem('cart') || '[]');
      return Array.isArray(arr) ? arr.filter((x) => x && (x.productId || x.id)) : [];
    } catch {
      return [];
    }
  }

  function saveCart() {
    localStorage.setItem('cart', JSON.stringify(cart));
  }

  let cart = readCart();

  // ---------------------------------------------------------
  // 🔥 SYNC CART WITH BACKEND (REAL STOCK + PRICE)
  // ---------------------------------------------------------
  async function syncCartWithBackend() {
    try {
      const res = await fetch(`${window.API_BASE}/products`, {
        cache: 'no-store',
      });

      const data = await res.json();
      const products = data.products || [];

      cart.forEach((item) => {
        const fresh = products.find((p) => p._id == item.productId);

        if (fresh) {
          item.stock = fresh.stock;
          item.price = fresh.price;
          item.shippingCost = fresh.shippingCost ?? 0;

          if (fresh.trackInventory && item.quantity > fresh.stock) {
            item.quantity = fresh.stock;
            toast(`${fresh.name} stock adjusted`);
          }
        }
      });

      // Safety net: silently remove any of the vendor's own products
      const _myVid = localStorage.getItem('s4l_vendorId');
      if (_myVid) {
        const before = cart.length;
        cart = cart.filter((item) => {
          const vid = typeof item.vendor === 'object'
            ? (item.vendor?._id || item.vendor?.id)
            : item.vendor;
          return !vid || String(vid) !== _myVid;
        });
        if (cart.length < before) {
          toast('Your own listing was removed from the basket');
        }
      }

      saveCart();
    } catch (err) {
      console.error('Cart sync failed:', err);
    }
  }

  // ---------------------------------------------------------
  // 2. DOM references
  // ---------------------------------------------------------
  const miniCartList = document.querySelector('.mini-cart-items');
  const miniCartTotal = document.querySelector('.mini-cart-total');
  const totalSpan = document.getElementById('cart-total');
  const cartRows = document.getElementById('cart-rows');

  // ---------------------------------------------------------
  // 3. BADGE UPDATER
  // ---------------------------------------------------------
  function updateBadge() {
    const count = cart.reduce((s, i) => s + (i.quantity || 0), 0);
    document.querySelectorAll('.basket-qty').forEach((b) => {
      b.textContent = count;
      b.classList.toggle('hide', count === 0);
    });
  }

  // ---------------------------------------------------------
  // 4. UNIVERSAL BASKET STATE
  // ---------------------------------------------------------
  function updateBasketState() {
    const totalQty = cart.reduce((s, i) => s + (i.quantity || 0), 0);

    document.querySelectorAll('.basket-wrapper').forEach((w) => {
      const empty = totalQty === 0;

      w.classList.toggle('empty', empty);
      w.classList.toggle('has-items', !empty);

      // 🔒 Disable interaction when empty
      w.style.pointerEvents = empty ? 'none' : 'auto';
    });
  }

  // ---------------------------------------------------------
  // 5. RENDER MINI CART
  // ---------------------------------------------------------
  function renderMiniCart() {
    if (!miniCartList || !miniCartTotal) return;

    miniCartList.innerHTML = '';

    if (!cart.length) {
      miniCartList.innerHTML = `<li><div class='mini-cart-empty'>No items in basket.</div></li>`;
      miniCartTotal.innerHTML = `£0.00`;
      return;
    }

    let total = 0;

    cart.forEach((item, i) => {
      const price = Number(item.price);
      const qty = Number(item.quantity);
      const sub = price * qty;
      total += sub;

      const variantLabel = item.variant?.attributes
        ? Object.entries(item.variant.attributes).map(([k, v]) => `${k}: ${v}`).join(' / ')
        : '';
      const addOnLabel = item.addOns?.length
        ? item.addOns.map((ao) => ao.name).join(', ')
        : '';

      const li = document.createElement('li');
      li.innerHTML = `
                <div class="mini-cart-item">
                    <div class="mini-cart-thumb-col">
                        <img src="${item.image || '/assets/images/products/sell4life-placeholder.png'}" class="mini-cart-thumb">
                        <button class="mini-cart-remove" data-index="${i}" title="Remove item">&times;</button>
                    </div>
                    <div class="mini-cart-info">
                        <div class="mini-cart-name">${item.name}${variantLabel ? `<span class="mini-cart-variant"> — ${variantLabel}</span>` : ''}</div>
                        ${addOnLabel ? `<div class="mini-cart-variant">+ ${addOnLabel}</div>` : ''}
                        <div class="mini-cart-meta">£${price.toFixed(2)} × ${qty}</div>
                    </div>
                    <div class="mini-cart-sub">£${sub.toFixed(2)}</div>
                </div>
            `;
      miniCartList.appendChild(li);
    });

    miniCartTotal.innerHTML = `
            <div class="mini-cart-total-line">
                <div class="mini-cart-total-left">
                    ${cart.length > 1 ? '<button class="mini-cart-clear-all">CLR</button>' : ''}
                </div>
                <div class="mini-cart-total-right">
                    <span class="mini-cart-total-label">Total:</span>
                    <span class="mini-cart-total-value">£${total.toFixed(2)}</span>
                </div>
            </div>
        `;
  }

  // ---------------------------------------------------------
  // 6. RENDER FULL CART PAGE
  // ---------------------------------------------------------
  function renderCartPage() {
    if (!cartRows) return;

    cartRows.innerHTML = '';
    if (!cart.length) {
      totalSpan.textContent = '£0.00';
      cartRows.innerHTML = `
        <div class="cart-empty">
          <p>Your basket is empty.</p>
          <a href="/shop/" class="btn-shop-now">Browse products →</a>
        </div>`;
      return;
    }

    let total = 0;

    cart.forEach((item, i) => {
      const price = Number(item.price || 0);
      const qty = Number(item.quantity || 0);

      // If stock is missing or invalid, treat it as unknown/high
      const hasRealStock =
        item.stock !== undefined &&
        item.stock !== null &&
        item.stock !== '' &&
        !Number.isNaN(Number(item.stock));

      const stock = hasRealStock ? Number(item.stock) : 999;

      const sub = price * qty;
      total += sub;

      let stockClass = '';
      let stockText = '';

      if (hasRealStock) {
        if (stock <= 0) {
          stockClass = 'out';
          stockText = 'Out of stock';
        } else if (stock <= 2) {
          stockClass = 'critical';
          stockText = `Only ${stock} left`;
        } else if (stock <= 5) {
          stockClass = 'low';
          stockText = `Low stock (${stock})`;
        }
      }

      const disablePlus = hasRealStock && qty >= stock ? 'disabled' : '';

      const row = document.createElement('div');
      row.classList.add('cart-row');

      const cartVariantLabel = item.variant?.attributes
        ? Object.entries(item.variant.attributes).map(([k, v]) => `${k}: ${v}`).join(' / ')
        : '';
      const cartAddOnLabel = item.addOns?.length
        ? item.addOns.map((ao) => `${ao.name} (+£${Number(ao.price).toFixed(2)})`).join(', ')
        : '';

      row.innerHTML = `
  <div class="col-product cart-product-info">
      <img class="cart-thumb" src="${item.image || '/assets/images/products/sell4life-placeholder.png'}">
      <div class="cart-product-text">
        <a class="cart-product-link"
           href="/product/product.html?id=${item.id || item.productId}"
           title="${item.name}">
          <span>${item.name}</span>
        </a>
        ${cartVariantLabel ? `<div class="cart-variant-label">${cartVariantLabel}</div>` : ''}
        ${cartAddOnLabel ? `<div class="cart-variant-label">+ ${cartAddOnLabel}</div>` : ''}
        ${stockText ? `<div class="stock-warning ${stockClass}">${stockText}</div>` : ''}
      </div>
  </div>

  <div class="col-qty qty-control">
      <button class="qty-minus" data-index="${i}">−</button>
      <span>${qty}</span>
      <button class="qty-plus" data-index="${i}" ${disablePlus}>+</button>
      <button class="remove-item" data-index="${i}">×</button>
  </div>

  <div class="col-price">£${price.toFixed(2)}</div>
  <div class="col-subtotal">£${sub.toFixed(2)}</div>

  <div class="m-price-line">
      £${price.toFixed(2)} × ${qty} =
      <span class="m-subtotal">£${sub.toFixed(2)}</span>
  </div>
`;

      cartRows.appendChild(row);
    });

    totalSpan.textContent = `£${total.toFixed(2)}`;

    // Mark names that actually overflow — only those get the scroll animation
    requestAnimationFrame(() => {
      document.querySelectorAll('.cart-product-link').forEach((link) => {
        const span = link.querySelector('span');
        if (span && span.scrollWidth > link.offsetWidth + 2) {
          span.classList.add('scrollable');
        }
      });
    });
  }

  // ---------------------------------------------------------
  // 8. FULL REFRESH
  // ---------------------------------------------------------
  async function refreshAll() {
    cart = readCart();

    await syncCartWithBackend(); // 🔥 THIS IS THE FIX

    renderMiniCart();
    updateBadge();
    updateBasketState();
    renderCartPage();
  }

  await refreshAll();
  document.addEventListener('cartUpdated', refreshAll);

  // =====================================================================
  // 9. TAP SYSTEM FOR BUTTONS
  // =====================================================================

  let tapStartX = 0;
  let tapStartY = 0;
  const TAP_THRESHOLD = 12;

  document.addEventListener('pointerdown', (e) => {
    const btn = e.target.closest('.qty-plus, .qty-minus, .remove-item, .btn-add');
    if (!btn) return;

    tapStartX = e.clientX;
    tapStartY = e.clientY;

    btn.classList.add('tapped');
  });

  document.addEventListener('pointermove', (e) => {
    const btn = e.target.closest('.qty-plus, .qty-minus, .remove-item, .btn-add');
    if (!btn) return;

    const dx = Math.abs(e.clientX - tapStartX);
    const dy = Math.abs(e.clientY - tapStartY);

    if (dx > TAP_THRESHOLD || dy > TAP_THRESHOLD) {
      btn.classList.remove('tapped');
    }
  });

  document.addEventListener('pointerup', (e) => {
    const btn = e.target.closest('.qty-plus, .qty-minus, .remove-item, .btn-add');
    if (!btn) return;

    const dx = Math.abs(e.clientX - tapStartX);
    const dy = Math.abs(e.clientY - tapStartY);

    setTimeout(() => btn.classList.remove('tapped'), 100);

    if (dx > TAP_THRESHOLD || dy > TAP_THRESHOLD) return;

    if (navigator.vibrate) navigator.vibrate(30);

    if (btn.classList.contains('qty-plus')) {
      const i = +btn.dataset.index;

      const maxStock = Number(cart[i].stock || 999);
      const currentQty = Number(cart[i].quantity || 0);

      if (currentQty >= maxStock) {
        window.showToast && window.showToast('Max stock reached');
        return;
      }

      cart[i].quantity = currentQty + 1;

      saveCart();
      refreshAll();
      return;
    }

    if (btn.classList.contains('qty-minus')) {
      const i = +btn.dataset.index;

      // Normal decrement
      if (cart[i].quantity > 1) {
        cart[i].quantity--;
        saveCart();
        refreshAll();
        return;
      }

      // Quantity will reach zero → attempt animation
      const row = btn.closest('.cart-row');

      // If row not found (mobile / layout edge cases)
      if (!row) {
        cart.splice(i, 1);
        saveCart();
        refreshAll();
        return;
      }

      // Lock height before collapse
      row.style.height = row.offsetHeight + 'px';

      requestAnimationFrame(() => {
        row.classList.add('removing');
      });

      setTimeout(() => {
        cart.splice(i, 1);
        saveCart();
        refreshAll();
      }, 350);

      return;
    }

    if (btn.classList.contains('remove-item')) {
      const i = +btn.dataset.index;
      const row = btn.closest('.cart-row');
      if (!row) return;

      // Lock height so it can animate
      row.style.height = row.offsetHeight + 'px';

      // Trigger collapse
      requestAnimationFrame(() => {
        row.classList.add('removing');
      });

      // Remove AFTER animation
      setTimeout(() => {
        cart.splice(i, 1);
        saveCart();
        refreshAll();
      }, 350);

      return;
    }

    if (btn.classList.contains('btn-add')) {
      if (btn.disabled) return; // 🚫 stop if button disabled

      const productId = btn.dataset.id;
      const productName = btn.dataset.name;
      const productPrice = btn.dataset.price;
      const productImage = btn.dataset.image;
      const category = btn.dataset.category;
      const subcategory = btn.dataset.subcategory;
      const rawStock = btn.dataset.stock;
      const hasRealStock = rawStock !== undefined && rawStock !== null && rawStock !== '';
      const stock = hasRealStock ? Number(rawStock) : 999;
      let item = cart.find((p) => p.productId == productId);
      if (item) {
        const maxStock = Number(item.stock || stock || 999);

        if (stock <= 0) {
          toast('This product is out of stock');
          return;
        }

        if (item.quantity >= maxStock) {
          window.showToast && window.showToast('Max stock reached');
          return;
        }

        item.quantity++;
      } else {
        cart.push({
          productId: productId,
          name: productName,
          price: Number(productPrice),
          image: productImage,
          category,
          subcategory,
          quantity: 1,
          stock: stock, // ← THIS LINE
        });
      }

      saveCart();
      refreshAll();
      toast('Added to cart');
    }
  });

  // =====================================================================
  // 10. MOBILE CLEAR CART MODAL
  // =====================================================================
  document.addEventListener('click', (e) => {
    if (e.target.id === 'clear-cart') {
      document.querySelector('.clear-cart-modal')?.classList.add('show');
    }

    if (e.target.classList.contains('confirm-clear')) {
      cart = [];
      saveCart();
      refreshAll();
      document.querySelector('.clear-cart-modal')?.classList.remove('show');
    }

    if (e.target.classList.contains('cancel-clear')) {
      document.querySelector('.clear-cart-modal')?.classList.remove('show');
    }
  });

  // =====================================================================
  // 10b. MINI CART — REMOVE ITEM + CLEAR ALL
  // =====================================================================
  document.addEventListener('click', (e) => {
    // ── Single item remove ──────────────────────────────────────
    if (e.target.classList.contains('mini-cart-remove')) {
      const i   = +e.target.dataset.index;
      const li  = e.target.closest('li');

      if (!li) { cart.splice(i, 1); saveCart(); refreshAll(); return; }

      // Lock current height so it can collapse
      li.style.maxHeight  = li.offsetHeight + 'px';
      li.style.overflow   = 'hidden';

      requestAnimationFrame(() => {
        li.style.transition = 'opacity 0.22s ease, transform 0.22s ease, max-height 0.35s ease 0.15s, padding 0.35s ease 0.15s';
        li.style.opacity    = '0';
        li.style.transform  = 'translateX(-24px)';

        // After fade, collapse height
        setTimeout(() => {
          li.style.maxHeight  = '0';
          li.style.paddingTop = '0';
          li.style.paddingBottom = '0';
        }, 160);
      });

      setTimeout(() => {
        cart.splice(i, 1);
        saveCart();
        refreshAll();
      }, 500);
      return;
    }

    // ── Clear all — staggered cascade ───────────────────────────
    if (e.target.classList.contains('mini-cart-clear-all')) {
      const items = [...document.querySelectorAll('.mini-cart-items li')];

      items.forEach((li, idx) => {
        const delay = idx * 70; // 70 ms stagger per item

        li.style.maxHeight = li.offsetHeight + 'px';
        li.style.overflow  = 'hidden';

        setTimeout(() => {
          li.style.transition = 'opacity 0.2s ease, transform 0.2s ease, max-height 0.3s ease 0.15s';
          li.style.opacity    = '0';
          li.style.transform  = 'translateX(-24px)';

          setTimeout(() => {
            li.style.maxHeight     = '0';
            li.style.paddingTop    = '0';
            li.style.paddingBottom = '0';
          }, 160);
        }, delay);
      });

      // Wait for last item to finish before clearing
      const totalDelay = items.length * 70 + 500;
      setTimeout(() => {
        cart = [];
        saveCart();
        refreshAll();
      }, totalDelay);
      return;
    }
  });

  // =====================================================================
  // 11. MOBILE BASKET CLICK
  // =====================================================================
  document.addEventListener('click', (e) => {
    const mobileBasket = document.querySelector('.s4l-header-mobile .basket-shell');
    if (mobileBasket && mobileBasket.contains(e.target)) {
      window.location.href = '/cart/cart.html';
    }
  });

  // =====================================================================
  // 12. HYBRID DESKTOP: HOVER + TAP MINICART
  // =====================================================================

  const desktopWrapper = document.querySelector('.s4l-header-desktop .basket-wrapper');
  const desktopMini = document.querySelector('.s4l-header-desktop .mini-cart');

  if (desktopWrapper && desktopMini) {
    // Hover (real mouse only)
    window.matchMedia('(hover: hover) and (pointer: fine)').addEventListener('change', () => {});

    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      desktopWrapper.addEventListener('mouseenter', () => {
        if (!cart.length) return;
        desktopMini.style.display = 'block';
        desktopMini.style.opacity = '1';
        desktopMini.style.visibility = 'visible';
      });

      desktopWrapper.addEventListener('mouseleave', () => {
        desktopMini.style.display = 'none';
        desktopMini.style.opacity = '0';
        desktopMini.style.visibility = 'hidden';
      });
    }

    // Touch tap toggle (hybrid laptops)
    desktopWrapper.addEventListener(
      'touchstart',
      (e) => {
        // Only react if the touch happened EXACTLY on the desktop basket icon
        const icon = e.target.closest('.basket-shell, .basket-handle');
        if (!icon) return; // Do NOT block other touches anywhere else

        if (!cart.length) return;

        const open = desktopMini.style.display === 'block';

        if (open) {
          desktopMini.style.display = 'none';
          desktopMini.style.opacity = '0';
          desktopMini.style.visibility = 'hidden';
        } else {
          desktopMini.style.display = 'block';
          desktopMini.style.opacity = '1';
          desktopMini.style.visibility = 'visible';
        }

        e.preventDefault(); // Prevent scroll ONLY for the basket icon
      },
      { passive: false }
    );
  }

})(); // END wrapper

// ======================================================================
// 14. CHECKOUT BUTTON
// ======================================================================
document.addEventListener('click', (e) => {
  const btn = e.target.closest('#btn-buy');
  if (btn) window.location.href = '/cart/checkout.html';
});
