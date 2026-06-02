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
      background: transparent;
      transform: translateY(110%);
      pointer-events: none;
      padding-bottom: 4px;
    }
    /* Frosted pill — only the button group gets a background */
    .s4l-bar-inner {
      display: flex;
      align-items: center;
      height: 46px;
      padding: 0 6px;
      border-radius: 30px;
      background: rgba(255, 255, 255, 0.88);
      -webkit-backdrop-filter: blur(10px);
      backdrop-filter: blur(10px);
      border: 1px solid rgba(11, 107, 106, 0.18);
      box-shadow: 0 2px 16px rgba(0, 0, 0, 0.13);
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
      width: 58px; height: 46px;
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
    .s4l-basket-circle.s4l-has                           { border-color: #0b6b6a; }
    /* Fill only the basket body path (last path = body), leave handle as stroke */
    .s4l-basket-circle.s4l-has svg path:last-child       { fill: #0b6b6a; stroke: #0b6b6a; }
    .s4l-basket-circle.s4l-has svg                       { opacity: 1; }
    .s4l-basket-circle.s4l-has .s4l-basket-n             { display: flex; color: #fff; font-size: 10px; font-weight: 900; transform: translateY(3px); }
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
      .s4l-pill          { width: 52px; }
      .s4l-sep           { height: 24px; width: 1.5px; }
      .s4l-arrow-up      { font-size: 24px; -webkit-text-stroke: 0.6px #0b6b6a; transform: scaleY(1.4); display: inline-block; }
      .s4l-sticky-btn svg { stroke-width: 2.6; }
      .s4l-basket-circle { width: 36px; height: 36px; border-width: 2px; border-color: rgba(11,107,106,0.85); }
      .s4l-basket-circle svg { opacity: 1; stroke-width: 2.2; }
      .s4l-basket-n      { font-size: 14px; font-weight: 900; }
      .s4l-pill-vendor .s4l-pill-inner { width: 36px; height: 36px; border-width: 2px; font-size: 14px; font-weight: 900; }
      .s4l-pill-buyer  .s4l-pill-inner { min-width: 36px; height: 36px; border-width: 2px; font-size: 14px; font-weight: 900; }
    }
  `;
  document.head.appendChild(css);

  function boot() {

    const bar = document.createElement('div');
    bar.className = 's4l-sticky-bar';
    bar.innerHTML = `
      <div class="s4l-bar-inner">
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
      </div>
    `;
    document.body.appendChild(bar);

    // ── Scroll-linked reveal ──────────────────────────────────
    function initVisibility() {
      // Mobile: show only when header has scrolled off screen
      if (window.innerWidth <= 1280) {
        const mobileHeader = document.querySelector('.s4l-header-mobile');
        let footerVisible = false;

        function setBar(show) {
          bar.style.transform    = show ? 'none' : 'translateY(110%)';
          bar.style.pointerEvents = show ? 'auto' : 'none';
        }

        if (mobileHeader) {
          new IntersectionObserver(([e]) => {
            if (!footerVisible) setBar(!e.isIntersecting);
          }, { threshold: 0 }).observe(mobileHeader);
        }

        let footerObserved = false;
        function tryObserveFooterMobile() {
          if (footerObserved) return;
          const btn = document.querySelector('.back-to-top');
          if (!btn) return;
          footerObserved = true;
          new IntersectionObserver(([e]) => {
            footerVisible = e.isIntersecting;
            setBar(!e.isIntersecting && window.scrollY > (mobileHeader ? mobileHeader.offsetHeight : 0));
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
    // Cart button: tap/click → go to cart. Hold 600ms → clear basket popup
    (function() {
      const cartBtn = bar.querySelector('.s4l-cart-btn');
      let holdTimer = null;
      let held = false;

      function startHold() {
        held = false;
        holdTimer = setTimeout(() => {
          held = true;
          showClearPopup();
        }, 600);
      }
      function cancelHold() { clearTimeout(holdTimer); }

      function showClearPopup() {
        // Remove any existing popup
        document.getElementById('s4l-clear-popup')?.remove();

        const pop = document.createElement('div');
        pop.id = 's4l-clear-popup';
        pop.style.cssText = `
          position:fixed;bottom:72px;left:50%;transform:translateX(-50%);
          background:#fff;border:1px solid #e5e7eb;border-radius:12px;
          padding:14px 16px;box-shadow:0 4px 20px rgba(0,0,0,0.15);
          display:flex;flex-direction:column;align-items:center;gap:10px;
          z-index:9999;min-width:180px;text-align:center;
        `;
        pop.innerHTML = `
          <span style="font-size:0.85rem;font-weight:600;color:#111827">Clear basket?</span>
          <div style="display:flex;gap:8px;width:100%">
            <button id="s4l-clear-confirm" style="flex:1;padding:8px;background:#dc2626;color:#fff;border:none;border-radius:7px;font-size:0.82rem;font-weight:700;cursor:pointer">Clear</button>
            <button id="s4l-clear-cancel"  style="flex:1;padding:8px;background:#f3f4f6;color:#374151;border:none;border-radius:7px;font-size:0.82rem;font-weight:600;cursor:pointer">Cancel</button>
          </div>
        `;
        document.body.appendChild(pop);

        document.getElementById('s4l-clear-confirm').addEventListener('click', () => {
          localStorage.removeItem('cart');
          document.dispatchEvent(new Event('cartUpdated'));
          pop.remove();
        });
        document.getElementById('s4l-clear-cancel').addEventListener('click', () => pop.remove());

        // Close if tapping anywhere else
        setTimeout(() => {
          document.addEventListener('click', function outsideClick(e) {
            if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', outsideClick); }
          });
        }, 10);
      }

      // Touch events (mobile)
      cartBtn.addEventListener('touchstart',  () => startHold(), { passive: true });
      cartBtn.addEventListener('touchend',    () => { cancelHold(); if (!held) window.location.href = '/cart/cart.html'; held = false; });
      cartBtn.addEventListener('touchcancel', () => { cancelHold(); held = false; });

      // Mouse events (desktop)
      cartBtn.addEventListener('mousedown',  () => startHold());
      cartBtn.addEventListener('mouseup',    () => { cancelHold(); if (!held) window.location.href = '/cart/cart.html'; });
      cartBtn.addEventListener('mouseleave', () => { cancelHold(); held = false; });

      // Swallow the click event that fires after a hold — prevents it from closing the popup
      cartBtn.addEventListener('click', (e) => { if (held) { e.stopImmediatePropagation(); held = false; } });

      // Desktop hover hint
      cartBtn.title = 'Go to basket (hold to clear)';
    })();
    bar.querySelector('.s4l-pill-vendor').addEventListener('click', () => { window.location.href = '/account/vendor/orders.html'; });
    bar.querySelector('.s4l-pill-buyer').addEventListener('click',  () => { window.location.href = '/account/orders.html'; });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
