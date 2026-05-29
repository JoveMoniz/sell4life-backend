(async function initSearch() {
  while (
    !document.querySelector('#desktop-search-input') ||
    !document.querySelector('#mobile-search-input')
  ) {
    await new Promise((r) => setTimeout(r, 20));
  }

  const API = window.API_BASE || '';
  const cache = new Map();

  const desktop = {
    form:  document.querySelector('#desktop-search-form'),
    input: document.querySelector('#desktop-search-input'),
    box:   document.querySelector('.desktop-ac'),
  };

  const mobile = {
    form:  document.querySelector('#mobile-search-form'),
    input: document.querySelector('#mobile-search-input'),
    box:   document.querySelector('.mobile-ac'),
  };

  function show(box) { if (box) box.classList.add('show'); }
  function hide(box) { if (box) box.classList.remove('show'); }

  function highlight(text, q) {
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return text.replace(new RegExp(`(${esc})`, 'gi'), '<strong>$1</strong>');
  }

  function render(box, matches, q) {
    if (!matches.length) return hide(box);

    box.innerHTML = matches.slice(0, 5).map((m) => {
      const img = m.images?.[0]
        ? m.images[0].startsWith('http')
          ? m.images[0]
          : `/assets/images/products/${m.images[0]}`
        : '/assets/images/products/sell4life-placeholder.png';

      return `<div class="ac-item" data-id="${m._id}">
        <img src="${img}" class="ac-thumb" />
        <div class="ac-details">
          <span class="ac-name">${highlight(m.name, q)}</span>
          <span class="ac-cat">${m.category} → ${m.subcategory}</span>
        </div>
      </div>`;
    }).join('') + `<div class="ac-item ac-view-all">View all results for "${q}"</div>`;

    show(box);
  }

  function bind(input, box) {
    let timer;
    let controller;
    let lastFocusTime = 0;

    input.addEventListener('focus', () => {
      lastFocusTime = Date.now();
      hide(box);
      box.innerHTML = '';
    });

    input.addEventListener('input', () => {
      const q = input.value.trim();
      clearTimeout(timer);

      if (q.length < 1 || Date.now() - lastFocusTime < 300) return hide(box);

      // Cache hit — instant render, no network
      if (cache.has(q)) {
        render(box, cache.get(q), q);
        return;
      }

      // 200ms debounce for first char, 120ms for two or more
      timer = setTimeout(async () => {
        if (controller) controller.abort();
        controller = new AbortController();

        try {
          const res = await fetch(
            `${API}/products?search=${encodeURIComponent(q)}&limit=6`,
            { signal: controller.signal }
          );
          if (!res.ok) throw new Error('bad response');

          const data = await res.json();
          const matches = data.products || [];

          // Evict oldest entry if cache is large
          if (cache.size >= 50) cache.delete(cache.keys().next().value);
          cache.set(q, matches);

          // Only paint if the input still matches what we fetched
          if (input.value.trim() === q) render(box, matches, q);
        } catch (err) {
          if (err.name !== 'AbortError') hide(box);
        }
      }, q.length === 1 ? 200 : 120);
    });

    box.addEventListener('click', (e) => {
      const item = e.target.closest('.ac-item');
      if (!item) return;
      if (item.classList.contains('ac-view-all')) {
        window.location.href = `/shop/?q=${encodeURIComponent(input.value)}`;
        return;
      }
      window.location.href = `/product/product.html?id=${item.dataset.id}`;
    });
  }

  document.addEventListener('click', (e) => {
    document.querySelectorAll('.search-autocomplete').forEach((box) => {
      const wrapper = box.closest('form');
      if (wrapper && !wrapper.contains(e.target) && !box.contains(e.target)) hide(box);
    });
  });

  bind(desktop.input, desktop.box);
  bind(mobile.input, mobile.box);

  desktop.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const term = desktop.input.value.trim();
    if (term) window.location.href = `/shop/?q=${encodeURIComponent(term)}`;
  });

  mobile.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const term = mobile.input.value.trim();
    if (term) window.location.href = `/shop/?q=${encodeURIComponent(term)}`;
  });
})();
