// ============================================================
// QUICK-ADD POPUP — sell4life
// Opens a compact modal to pick a variant and add to cart.
// Works with shop.js and category-page.js cards.
// ============================================================
if (window.__quickAddLoaded) { /* already loaded by layout.js */ }
else {
window.__quickAddLoaded = true;
(function () {

  // ── Modal DOM — created lazily on first open() call ──────
  // This prevents the unstyled modal from appearing on pages
  // that don't load quick-add.css (e.g. signin, vendor pages).
  let modal = null;

  function ensureModal() {
    if (modal) return;
    modal = document.createElement('div');
    modal.id = 'qa-modal';
    modal.className = 'qa-modal';
    modal.innerHTML = `
      <div class="qa-backdrop"></div>
      <div class="qa-box">
        <button class="qa-close" aria-label="Close">&times;</button>
        <div class="qa-header">
          <img class="qa-img" src="" alt="">
          <div class="qa-meta">
            <div class="qa-name"></div>
            <div class="qa-price"></div>
          </div>
        </div>
        <div class="qa-variants"></div>
        <button class="qa-confirm" disabled>Select an option</button>
        <button class="qa-clear-cart">🗑 Clear cart</button>
      </div>
    `;
    document.body.appendChild(modal);

    modal.addEventListener('click', (e) => {
      if (e.target.classList.contains('qa-backdrop') ||
          e.target.classList.contains('qa-close')) {
        close(); return;
      }
      const vBtn = e.target.closest('.qa-v');
      if (vBtn && !vBtn.disabled) {
        modal.querySelectorAll('.qa-v').forEach(b => b.classList.remove('qa-v-sel'));
        vBtn.classList.add('qa-v-sel');
        const vi = +vBtn.dataset.vi;
        _variant  = _product.variants[vi];
        const price = Number(_variant.price || _product.price || 0);
        setPrice(price);
        const confirm = modal.querySelector('.qa-confirm');
        confirm.disabled    = false;
        confirm.textContent = 'Add to Basket';
        return;
      }
      if (e.target.classList.contains('qa-confirm') && !e.target.disabled) {
        addToCart(); return;
      }
      if (e.target.classList.contains('qa-clear-cart')) {
        localStorage.setItem('cart', '[]');
        document.dispatchEvent(new Event('cartUpdated'));
        refreshBasketBtns();
        close();
      }
    });
  }

  let _product   = null;
  let _variant   = null;
  let _sourceBtn = null;   // the card button that triggered the popup

  // ── Helpers ───────────────────────────────────────────────
  // A variant is "real" only if it has a visible label (non-empty colour or attributes)
  function variantLabel(v) {
    if (v.color && v.color.trim()) return v.color.trim();
    if (v.attributes && typeof v.attributes === 'object') {
      const vals = Object.values(v.attributes).map(x => String(x || '').trim()).filter(Boolean);
      if (vals.length) return vals.join(' / ');
    }
    return '';
  }

  // ── Open ──────────────────────────────────────────────────
  function open(product) {
    ensureModal();
    _product = product;
    _variant = null;

    // Filter to variants that actually have something to show
    const realVariants = (product.variants || []).filter(v => variantLabel(v));

    // No real options → skip the popup entirely, add directly
    if (!realVariants.length) {
      directAddToCart(product);
      return;
    }

    const id  = product._id || product.id;
    const img = (Array.isArray(product.images) && product.images[0])
      ? (product.images[0].startsWith('http') ? product.images[0] : `/assets/images/products/${product.images[0]}`)
      : (product.image || '/assets/images/products/sell4life-placeholder.png');

    modal.querySelector('.qa-img').src    = img;
    modal.querySelector('.qa-name').textContent = product.name;

    const confirmBtn = modal.querySelector('.qa-confirm');
    const variantsEl = modal.querySelector('.qa-variants');

    variantsEl.innerHTML = realVariants.map((v, i) => {
      const label   = variantLabel(v);
      const soldOut = v.stock !== undefined && Number(v.stock) <= 0;
      return `<button class="qa-v${soldOut ? ' qa-v-out' : ''}" data-vi="${i}"${soldOut ? ' disabled' : ''}>${label}</button>`;
    }).join('');

    // Store only the real variants so addToCart picks the right one
    _product = { ...product, variants: realVariants };

    confirmBtn.disabled    = true;
    confirmBtn.textContent = 'Select an option';
    setPrice(Number(product.price || 0));

    modal.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function setPrice(n) {
    modal.querySelector('.qa-price').textContent = `£${n.toFixed(2)}`;
  }

  function close() {
    modal.classList.remove('open');
    document.body.style.overflow = '';
  }


  // ── Add to localStorage cart ──────────────────────────────
  function addToCart() {
    let cart = [];
    try { cart = JSON.parse(localStorage.getItem('cart') || '[]'); } catch {}

    const pid   = _product._id || _product.id;
    const v     = _variant;
    const price = Number(v ? (v.price || _product.price) : _product.price || 0);
    const stock = v ? v.stock : _product.stock;
    const img   = (v?.image) || (Array.isArray(_product.images) && _product.images[0]
      ? (_product.images[0].startsWith('http') ? _product.images[0] : `/assets/images/products/${_product.images[0]}`)
      : _product.image || '/assets/images/products/sell4life-placeholder.png');

    const variantKey = v ? JSON.stringify(v.attributes) : null;

    const existing = cart.find(item =>
      item.productId === pid &&
      JSON.stringify(item.variant?.attributes ?? null) === variantKey
    );

    if (existing) {
      const max = Number(stock ?? 999);
      if (existing.quantity >= max) { return; }
      existing.quantity++;
    } else {
      cart.push({
        productId: pid,
        id: pid,
        name: _product.name,
        price,
        image: img,
        category: _product.category,
        subcategory: _product.subcategory,
        quantity: 1,
        stock: stock !== undefined && stock !== null ? Number(stock) : 999,
        ...(v ? { variant: { attributes: v.attributes } } : {}),
      });
    }

    localStorage.setItem('cart', JSON.stringify(cart));
    document.dispatchEvent(new Event('cartUpdated'));

    // Update the exact button that was clicked — guaranteed to work
    if (_sourceBtn) {
      const total = cart.reduce((s, i) =>
        (i.productId || i.id) === pid ? s + (i.quantity || 1) : s, 0);
      applyBtnState(_sourceBtn, total);
      _sourceBtn.classList.add('just-added');
      _sourceBtn.addEventListener('mouseleave', () => _sourceBtn.classList.remove('just-added'), { once: true });
    }

    refreshBasketBtns();   // sync any duplicates on page (browse rows)
    close();
  }

  // ── Apply/remove filled state on ONE button ───────────────
  // In-cart = bag body fills solid teal. No number. No circle change.
  function applyBtnState(btn, qty) {
    const body   = btn.querySelector('svg path:last-child');
    const handle = btn.querySelector('svg path:first-child');

    if (qty > 0) {
      btn.classList.add('has-qty');
      if (body)   { body.style.fill = '#0b6b6a'; body.style.stroke = '#0b6b6a'; }
      if (handle) { handle.style.stroke = '#0b6b6a'; handle.style.fill = 'none'; }
    } else {
      btn.classList.remove('has-qty');
      if (body)   { body.style.fill = ''; body.style.stroke = ''; }
      if (handle) { handle.style.stroke = ''; handle.style.fill = ''; }
    }
  }

  // ── Direct add (no variants) ──────────────────────────────
  function directAddToCart(product) {
    let cart = [];
    try { cart = JSON.parse(localStorage.getItem('cart') || '[]'); } catch {}

    const pid   = product._id || product.id;
    const price = Number(product.price || 0);
    const stock = product.stock;
    const img   = (Array.isArray(product.images) && product.images[0])
      ? (product.images[0].startsWith('http') ? product.images[0] : `/assets/images/products/${product.images[0]}`)
      : product.image || '/assets/images/products/sell4life-placeholder.png';

    const existing = cart.find(item =>
      (item.productId || item.id) === pid && !item.variant
    );

    if (existing) {
      const max = Number(stock ?? 999);
      if (existing.quantity >= max) { return; }
      existing.quantity++;
    } else {
      cart.push({
        productId: pid, id: pid, name: product.name, price, image: img,
        category: product.category, subcategory: product.subcategory,
        quantity: 1, stock: stock != null ? Number(stock) : 999,
      });
    }

    localStorage.setItem('cart', JSON.stringify(cart));
    document.dispatchEvent(new Event('cartUpdated'));
    if (_sourceBtn) {
      const total = cart.reduce((s, i) =>
        (i.productId || i.id) === pid ? s + (i.quantity || 1) : s, 0);
      applyBtnState(_sourceBtn, total);
      _sourceBtn.classList.add('just-added');
      _sourceBtn.addEventListener('mouseleave', () => _sourceBtn.classList.remove('just-added'), { once: true });
    }
    refreshBasketBtns();
  }

  // ── Refresh ALL basket buttons (page load / cart change) ──
  function refreshBasketBtns() {
    let cart = [];
    try { cart = JSON.parse(localStorage.getItem('cart') || '[]'); } catch {}

    const qtyMap = {};
    cart.forEach(item => {
      const id = item.productId || item.id;
      if (id) qtyMap[id] = (qtyMap[id] || 0) + (item.quantity || item.qty || 1);
    });

    document.querySelectorAll('.sp-quick-add-btn[data-id], .cp-quick-add-btn[data-id]')
      .forEach(btn => applyBtnState(btn, qtyMap[btn.dataset.id] || 0));
  }

  // ── Global open hook (called by card buttons) ─────────────
  window.openQuickAdd = open;

  // ── Delegate clicks from card buttons ────────────────────
  document.addEventListener('click', (e) => {

    // CLR overlay → remove this product from cart
    const clrEl = e.target.closest('.sp-qa-clr, .cp-qa-clr');
    if (clrEl) {
      e.preventDefault();
      e.stopPropagation();
      const btn = clrEl.closest('[data-id]');
      if (!btn) return;
      let cart = [];
      try { cart = JSON.parse(localStorage.getItem('cart') || '[]'); } catch {}
      cart = cart.filter(i => (i.productId || i.id) !== btn.dataset.id);
      localStorage.setItem('cart', JSON.stringify(cart));
      document.dispatchEvent(new Event('cartUpdated'));
      applyBtnState(btn, 0);
      return;
    }

    // Basket button → toggle: remove if already in cart, add/popup if not
    const btn = e.target.closest('.sp-quick-add-btn, .cp-quick-add-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    // Already in cart → remove immediately on any device, no popup
    if (btn.classList.contains('has-qty')) {
      let cart = [];
      try { cart = JSON.parse(localStorage.getItem('cart') || '[]'); } catch {}
      cart = cart.filter(i => (i.productId || i.id) !== btn.dataset.id);
      localStorage.setItem('cart', JSON.stringify(cart));
      applyBtnState(btn, 0);
      document.dispatchEvent(new Event('cartUpdated'));
      return;
    }

    // Not in cart → open() decides: popup if real variants, direct add if not
    _sourceBtn = btn;
    const product = (window._qaProducts || {})[btn.dataset.id];
    if (!product) return;
    if (product.variants && product.variants.length > 0) {
      open(product);            // open() filters blank rows; falls to directAddToCart if none real
    } else {
      directAddToCart(product); // no variants at all → add straight away
    }
  });

  // ── Keyboard close ────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal) close();
  });

  // ── Sync on cart changes (cart page remove / clear) ───────
  document.addEventListener('cartUpdated', refreshBasketBtns);

  // ── Init on load ──────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', refreshBasketBtns);
  // Also run immediately in case DOMContentLoaded already fired
  if (document.readyState !== 'loading') refreshBasketBtns();

})();
} // end __quickAddLoaded guard
