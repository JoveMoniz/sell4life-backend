// ============================================================
// STICKY BOTTOM BAR — sell4life
// Separators = standalone <div class="s4l-sep"> elements
// Pills use inner <span> so their visual box is centred
// inside the same 68px slot as the other buttons
// ============================================================
(function () {

  const SEP_COLOR = 'rgba(11,107,106,0.6)';

  const css = document.createElement('style');
  css.textContent = `
    .s4l-sticky-bar {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      z-index: 8500;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 58px;
      background: rgba(11,107,106,0.10);
      transform: translateY(110%);
      pointer-events: none;
    }
    /* ── Separator divs ─────────────────────────────── */
    .s4l-sep {
      width: 1.5px;
      height: 22px;
      background: ${SEP_COLOR};
      flex-shrink: 0;
      align-self: center;
    }
    .s4l-sep-v,
    .s4l-sep-b { display: none; }
    .s4l-sep-v.s4l-show,
    .s4l-sep-b.s4l-show { display: block; }
    /* ── Shared button base ─────────────────────────── */
    .s4l-sticky-btn,
    .s4l-pill {
      width: 68px; height: 58px;
      display: flex; align-items: center; justify-content: center;
      background: none; border: none;
      cursor: pointer; padding: 0; color: #0b6b6a;
      touch-action: manipulation; flex-shrink: 0;
    }
    .s4l-sticky-btn {
      opacity: 0.72; transition: opacity 0.15s;
    }
    .s4l-sticky-btn:hover    { opacity: 1; }
    .s4l-sticky-btn:disabled { opacity: 0.28; cursor: default; }
    /* Pills hidden until notification arrives */
    .s4l-pill { display: none; }
    .s4l-pill.s4l-show { display: flex; }
    /* ── Arrow ──────────────────────────────────────── */
    .s4l-arrow-up {
      font-size: 22px; font-weight: 900; line-height: 1; color: #0b6b6a;
      opacity: 0.72;
    }
    /* ── Basket circle ──────────────────────────────── */
    .s4l-basket-circle {
      width: 34px; height: 34px; border-radius: 50%;
      border: 1px solid rgba(11,107,106,0.7);
      display: flex; align-items: center; justify-content: center;
      position: relative; transition: border-color 0.2s;
    }
    .s4l-basket-circle svg      { opacity: 0.75; transition: opacity 0.2s; }
    .s4l-basket-n {
      position: absolute; inset: 0; display: none;
      align-items: center; justify-content: center;
      font-size: 12px; font-weight: 800; color: #0b6b6a;
      line-height: 1; font-family: inherit;
    }
    .s4l-basket-circle.s4l-has               { border-color: #0b6b6a; }
    .s4l-basket-circle.s4l-has svg           { opacity: 0; }
    .s4l-basket-circle.s4l-has .s4l-basket-n { display: flex; }
    /* ── Pill inner boxes (visual only) ─────────────── */
    /* vendor: square, teal */
    .s4l-pill-vendor .s4l-pill-inner {
      width: 34px; height: 34px;
      border-radius: 5px;
      border: 1px solid rgba(11,107,106,0.7);
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 800; color: #0b6b6a; line-height: 1;
    }
    /* buyer: rectangle, orange */
    .s4l-pill-buyer .s4l-pill-inner {
      min-width: 34px; padding: 0 10px; height: 34px;
      border-radius: 6px;
      border: 1px solid rgba(224,123,26,0.7);
      display: flex; align-items: center; justify-content: center;
      font-size: 13px; font-weight: 800; color: #e07b1a; line-height: 1;
    }
    /* ── Mobile ──────────────────────────────────────── */
    @media (max-width: 768px) {
      .s4l-sticky-btn,
      .s4l-pill          { width: 58px; }
      .s4l-sep           { height: 28px; width: 2px; }
      .s4l-arrow-up      { font-size: 26px; -webkit-text-stroke: 0.6px #0b6b6a; transform: scaleY(1.5); display: inline-block; }
      .s4l-sticky-btn svg { stroke-width: 3; }
      .s4l-basket-circle { width: 40px; height: 40px; border-width: 2.5px; border-color: rgba(11,107,106,0.85); }
      .s4l-basket-circle svg { opacity: 1; stroke-width: 2.4; }
      .s4l-basket-n      { font-size: 16px; font-weight: 900; }
      .s4l-pill-vendor .s4l-pill-inner { width: 40px; height: 40px; border-width: 2.5px; font-size: 16px; font-weight: 900; }
      .s4l-pill-buyer  .s4l-pill-inner { min-width: 40px; height: 40px; border-width: 2.5px; font-size: 16px; font-weight: 900; }
    }
  `;
  document.head.appendChild(css);

  function boot() {

    const bar = document.createElement('div');
    bar.className = 's4l-sticky-bar';
    bar.innerHTML = `
      <button class="s4l-pill s4l-pill-vendor" aria-label="Vendor orders">
        <span class="s4l-pill-inner"></span>
      </button>
      <div class="s4l-sep s4l-sep-v"></div>

      <button class="s4l-sticky-btn s4l-top-btn" aria-label="Back to top">
        <span class="s4l-arrow-up">&#8593;</span>
      </button>
      <div class="s4l-sep"></div>

      <button class="s4l-sticky-btn s4l-account-btn" aria-label="My account">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" stroke-width="2.2"
          stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="8" r="4"/>
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
        </svg>
      </button>
      <div class="s4l-sep"></div>

      <button class="s4l-sticky-btn s4l-cart-btn" aria-label="View basket" disabled>
        <div class="s4l-basket-circle">
          <svg width="18" height="20" viewBox="0 0 24 28" fill="none"
            stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round">
            <path d="M7 13C7 5 17 5 17 13"/>
            <path d="M1 12H23V23Q23 27 19 27H5Q1 27 1 23V12Z"/>
          </svg>
          <span class="s4l-basket-n"></span>
        </div>
      </button>
      <div class="s4l-sep s4l-sep-b"></div>

      <button class="s4l-pill s4l-pill-buyer" aria-label="Your orders">
        <span class="s4l-pill-inner"></span>
      </button>
    `;
    document.body.appendChild(bar);

    // ── Scroll-linked reveal ──────────────────────────────────
    function initVisibility() {
      // Mobile: always show the bar immediately
      if (window.innerWidth <= 1280) {
        bar.style.transform = 'none';
        bar.style.pointerEvents = 'auto';
        let footerObserved = false;
        function tryObserveFooterMobile() {
          if (footerObserved) return;
          const btn = document.querySelector('.back-to-top');
          if (!btn) return;
          footerObserved = true;
          new IntersectionObserver(([e]) => {
            bar.style.transform    = e.isIntersecting ? 'translateY(110%)' : 'none';
            bar.style.pointerEvents = e.isIntersecting ? 'none' : 'auto';
          }, { threshold: 0 }).observe(btn);
        }
        setTimeout(tryObserveFooterMobile, 1000);
        return;
      }
      // Desktop: reveal after scrolling past the header
      const candidates = ['.basket-wrapper:not(.mobile-basket)', '.basket-wrapper', '.s4l-header-desktop', 'header'];
      let headerEl = null;
      for (const sel of candidates) {
        const el = document.querySelector(sel);
        if (el && el.offsetHeight > 0) { headerEl = el; break; }
      }
      const triggerAt  = headerEl ? headerEl.getBoundingClientRect().bottom + window.scrollY - 80 : 10;
      const revealOver = 15;
      let footerVisible = false, footerObserved = false;
      function tryObserveFooter() {
        if (footerObserved) return;
        const btn = document.querySelector('.back-to-top');
        if (!btn) return;
        footerObserved = true;
        new IntersectionObserver(([e]) => { footerVisible = e.isIntersecting; update(); }, { threshold: 0 }).observe(btn);
      }
      function update() {
        tryObserveFooter();
        if (footerVisible) { bar.style.transform = 'translateY(110%)'; bar.style.pointerEvents = 'none'; return; }
        const p = Math.min(1, Math.max(0, (window.scrollY - triggerAt) / revealOver));
        bar.style.transform    = `translateY(${(1 - p) * 110}%)`;
        bar.style.pointerEvents = p > 0.95 ? 'auto' : 'none';
      }
      window.addEventListener('scroll', update, { passive: true });
      update();
    }

    // ── Basket ────────────────────────────────────────────────
    function updateCount() {
      let cart = [];
      try { cart = JSON.parse(localStorage.getItem('cart') || '[]'); } catch {}
      const n = cart.reduce((s, i) => s + (i.quantity || 1), 0);
      bar.querySelector('.s4l-basket-circle').classList.toggle('s4l-has', n > 0);
      bar.querySelector('.s4l-basket-n').textContent = n > 0 ? (n > 99 ? '99+' : n) : '';
      bar.querySelector('.s4l-cart-btn').disabled = n === 0;
    }

    // ── Notifications ─────────────────────────────────────────
    async function loadNotifications() {
      const token    = localStorage.getItem('s4l_token');
      const isVendor = localStorage.getItem('s4l_isVendor') === 'true';
      if (!token) return;

      if (isVendor) {
        try {
          const r = await fetch(`${window.API_BASE}/vendor/orders/pending-count`,
            { headers: { Authorization: `Bearer ${token}` }, credentials: 'include' });
          if (r.ok) {
            const { count } = await r.json();
            if (count > 0) {
              bar.querySelector('.s4l-pill-vendor .s4l-pill-inner').textContent = count > 99 ? '99+' : count;
              bar.querySelector('.s4l-pill-vendor').classList.add('s4l-show');
              bar.querySelector('.s4l-sep-v').classList.add('s4l-show');
            }
          }
        } catch {}
      }

      const since = localStorage.getItem('s4l_orders_seen') || 0;
      try {
        const r = await fetch(`${window.API_BASE}/account/unseen-orders?since=${since}`,
          { headers: { Authorization: `Bearer ${token}` }, credentials: 'include' });
        if (r.ok) {
          const { count } = await r.json();
          if (count > 0) {
            bar.querySelector('.s4l-pill-buyer .s4l-pill-inner').textContent = count > 99 ? '99+' : count;
            bar.querySelector('.s4l-pill-buyer').classList.add('s4l-show');
            bar.querySelector('.s4l-sep-b').classList.add('s4l-show');
          }
        }
      } catch {}
    }

    // ── Init ──────────────────────────────────────────────────
    let _initDone = false;
    function tryInit() { if (_initDone) return; _initDone = true; initVisibility(); }
    document.addEventListener('headerLoaded', tryInit);
    setTimeout(tryInit, 600);
    document.addEventListener('cartUpdated', updateCount);
    updateCount();
    loadNotifications();

    // ── Actions ───────────────────────────────────────────────
    bar.querySelector('.s4l-top-btn').addEventListener('click',    () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    bar.querySelector('.s4l-account-btn').addEventListener('click', () => { window.location.href = localStorage.getItem('s4l_token') ? '/account/orders.html' : '/account/signin.html'; });
    bar.querySelector('.s4l-cart-btn').addEventListener('click',    () => { window.location.href = '/cart/cart.html'; });
    bar.querySelector('.s4l-pill-vendor').addEventListener('click', () => { window.location.href = '/account/vendor/orders.html'; });
    bar.querySelector('.s4l-pill-buyer').addEventListener('click',  () => { window.location.href = '/account/orders.html'; });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
