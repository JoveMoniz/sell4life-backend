// ── Live stats (product count + seller count) ──────────────
async function loadStats() {
  try {
    const [pRes, sRes] = await Promise.allSettled([
      fetch(`${window.API_BASE}/products`),
      fetch(`${window.API_BASE}/stores`),
    ]);

    if (pRes.status === 'fulfilled' && pRes.value.ok) {
      const d = await pRes.value.json();
      const count = Array.isArray(d.products) ? d.products.length : 0;
      const el = document.getElementById('stat-products');
      if (el && count > 0) el.textContent = count + '+';
    }

    if (sRes.status === 'fulfilled' && sRes.value.ok) {
      const d = await sRes.value.json();
      const count = (d.stores || []).length;
      const el = document.getElementById('stat-sellers');
      if (el && count > 0) el.textContent = count + '+';
    }
  } catch (e) { /* leave defaults */ }
}

// ── Category icons ─────────────────────────────────────────
async function loadCategories() {
  try {
    const res = await fetch('/data/category.json');
    const categories = await res.json();
    const container = document.getElementById('s4l-categories');
    if (!container) return;

    container.innerHTML = categories.map(cat => `
      <a href="/shop/?category=${cat.id}" class="home-cat-item">
        <div class="home-cat-icon">
          <img src="${cat.image}" alt="${cat.name}" loading="lazy" />
        </div>
        <span class="home-cat-label">${cat.name}</span>
      </a>`
    ).join('');
  } catch (err) {
    console.error('Failed to load categories:', err);
  }
}

// ── Promo slider ───────────────────────────────────────────
async function initPromoSlider() {
  const track  = document.getElementById('promo-track');
  const dotsEl = document.getElementById('promo-dots');
  const prev   = document.getElementById('promo-prev');
  const next   = document.getElementById('promo-next');
  if (!track) return;

  let banners = [];
  try {
    const res = await fetch('/data/banners.json');
    banners = await res.json();
  } catch { return; }

  if (!banners.length) return;

  // Render slides
  track.innerHTML = banners.map((b, i) => `
    <div class="promo-slide${i === 0 ? ' active' : ''}" data-index="${i}">
      <div class="promo-slide-bg" style="${
        b.image
          ? `background-image:url('${b.image}');`
          : `background-color:${b.bg || '#0b6b6a'};`
      }"></div>
      <div class="promo-slide-overlay"></div>
      <div class="promo-slide-content">
        <h2>${b.headline}</h2>
        <p>${b.subtext}</p>
        <a href="${b.href}" class="promo-slide-cta">${b.cta}</a>
      </div>
    </div>
  `).join('');

  // Render dots
  if (dotsEl) {
    dotsEl.innerHTML = banners.map((_, i) => `
      <button type="button" class="promo-dot${i === 0 ? ' active' : ''}" data-index="${i}" aria-label="Slide ${i + 1}"></button>
    `).join('');
  }

  const slides = track.querySelectorAll('.promo-slide');
  const dots   = dotsEl ? dotsEl.querySelectorAll('.promo-dot') : [];
  let current  = 0;
  let timer;

  function goTo(n) {
    slides[current].classList.remove('active');
    if (dots[current]) dots[current].classList.remove('active');
    current = (n + banners.length) % banners.length;
    track.style.transform = `translateX(-${current * 100}%)`;
    slides[current].classList.add('active');
    if (dots[current]) dots[current].classList.add('active');
  }

  function startAuto() {
    timer = setInterval(() => goTo(current + 1), 5000);
  }

  function stopAuto() {
    clearInterval(timer);
  }

  if (prev) prev.addEventListener('click', () => { stopAuto(); goTo(current - 1); startAuto(); });
  if (next) next.addEventListener('click', () => { stopAuto(); goTo(current + 1); startAuto(); });

  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      stopAuto();
      goTo(parseInt(dot.dataset.index, 10));
      startAuto();
    });
  });

  // Touch swipe
  let touchX = 0;
  track.addEventListener('touchstart', e => { touchX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dx) > 40) { stopAuto(); goTo(dx < 0 ? current + 1 : current - 1); startAuto(); }
  }, { passive: true });

  // Pause on hover
  track.addEventListener('mouseenter', stopAuto);
  track.addEventListener('mouseleave', startAuto);

  if (banners.length > 1) startAuto();
}

// ── Featured products ──────────────────────────────────────
async function loadFeaturedProducts() {
  const container = document.querySelector('.featured-products-grid');
  if (!container) return;

  let products = [];

  try {
    const res = await fetch(`${window.API_BASE}/products`);
    const data = await res.json();
    products = Array.isArray(data.products) ? data.products : [];
    if (!products.length) throw new Error('empty');
  } catch {
    try {
      const res = await fetch('/data/products.json');
      products = await res.json();
    } catch (e) {}
  }

  const featured = products.slice(0, 8);

  if (!featured.length) {
    container.innerHTML = '<p style="text-align:center;color:#888;padding:40px 0">No products yet.</p>';
    return;
  }

  window._qaProducts = window._qaProducts || {};

  container.innerHTML = featured.map(p => {
    const id    = p._id || p.id;
    const price = Number(p.price || 0).toFixed(2);
    const raw   = p.images?.[0] || '';
    const img   = raw
      ? (raw.startsWith('http') ? raw : `/assets/images/products/${raw}`)
      : '/assets/images/products/sell4life-placeholder.png';

    window._qaProducts[id] = p;

    const basketBtn = p.comingSoon ? '' : `
      <button class="sp-quick-add-btn" data-id="${id}" title="Add to basket">
        <svg width="21" height="24" viewBox="0 0 24 28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 13C7 5 17 5 17 13"/>
          <path d="M1 12H23V23Q23 27 19 27H5Q1 27 1 23V12Z"/>
        </svg>
        <span class="sp-qa-clr" title="Remove from basket">CLR</span>
      </button>`;

    return `
      <div class="sp-card-wrap${p.comingSoon ? ' sp-card-wrap-soon' : ''}">
        <a href="/product/product.html?id=${id}" class="product-card">
          <div class="fp-img-wrap">
            <img src="${img}" alt="${p.name}" loading="lazy"
              onerror="this.src='/assets/images/products/sell4life-placeholder.png'" />
            ${p.comingSoon ? '<div class="sp-coming-soon-badge">🕐 Coming Soon</div>' : ''}
          </div>
          <h3>${p.name}</h3>
        </a>
        <div class="sp-card-footer">
          <div class="sp-price-row">
            <span class="sp-price">£${price}</span>
          </div>
          ${basketBtn}
        </div>
      </div>`;
  }).join('');
}

// ── Init ───────────────────────────────────────────────────
function initHomePage() {
  loadStats();
  loadCategories();
  loadFeaturedProducts();
  initPromoSlider();
}

initHomePage();
document.addEventListener('layoutReady', initHomePage);
