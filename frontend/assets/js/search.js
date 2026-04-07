// =====================================================
// SEARCH.JS — DATABASE AUTOCOMPLETE (FINAL CLEAN)
// =====================================================

console.log('search.js loaded');

(async function initSearch() {
  // =====================================================
  // WAIT FOR DOM
  // =====================================================
  while (
    !document.querySelector('#desktop-search-input') ||
    !document.querySelector('#mobile-search-input')
  ) {
    await new Promise((r) => setTimeout(r, 20));
  }

  console.log('Binding search...');

  const API = window.API_BASE || '';

  // =====================================================
  // SELECTORS
  // =====================================================
  const desktop = {
    form: document.querySelector('#desktop-search-form'),
    input: document.querySelector('#desktop-search-input'),
    box: document.querySelector('.desktop-ac'),
  };

  const mobile = {
    form: document.querySelector('#mobile-search-form'),
    input: document.querySelector('#mobile-search-input'),
    box: document.querySelector('.mobile-ac'),
  };

  // =====================================================
  // HELPERS
  // =====================================================
  function show(box) {
    if (box) box.classList.add('show');
  }

  function hide(box) {
    if (box) box.classList.remove('show');
  }

  function highlight(text, q) {
    const regex = new RegExp(`(${q})`, 'gi');
    return text.replace(regex, `<strong>$1</strong>`);
  }

  // =====================================================
  // CORE SEARCH (LIVE DATABASE)
  // =====================================================
  function bind(input, box) {
    let timer;

    input.addEventListener('input', () => {
      const q = input.value.trim();

      clearTimeout(timer);

      // minimum 2 characters (safe + stable)
      if (q.length < 1) return hide(box);

      timer = setTimeout(async () => {
        try {
          const res = await fetch(`${API}/products?search=${encodeURIComponent(q)}&limit=8`);

          if (!res.ok) throw new Error('Search failed');

          const data = await res.json();
          const matches = data.products || [];

          if (!matches.length) return hide(box);

          box.innerHTML = matches
            .slice(0, 6)
            .map((m) => {
              const image = m.images?.[0]
                ? m.images[0].startsWith('http')
                  ? m.images[0]
                  : `/assets/images/products/${m.images[0]}`
                : '/assets/images/products/sell4life-placeholder.png';

              return `
            <div class="ac-item" data-id="${m._id}">
              <img src="${image}" class="ac-thumb" />
              <div class="ac-details">
                <span class="ac-name">${highlight(m.name, q)}</span>
                <span class="ac-cat">${m.category} → ${m.subcategory}</span>
              </div>
            </div>
          `;
            })
            .join('');

          box.innerHTML += `
        <div class="ac-item ac-view-all">
          View all results for "${q}"
        </div>
      `;

          show(box);
        } catch (err) {
          console.error('Search API error:', err);
          hide(box);
        }
      }, 150);
    });

    // CLICK HANDLING
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

  // =====================================================
  // CLOSE AUTOCOMPLETE ON OUTSIDE CLICK
  // =====================================================
  document.addEventListener('click', (e) => {
    document.querySelectorAll('.search-autocomplete').forEach((box) => {
      const wrapper = box.closest('form');

      if (!wrapper.contains(e.target) && !box.contains(e.target)) {
        hide(box);
      }
    });
  });

  // =====================================================
  // BIND SEARCH INPUTS
  // =====================================================
  bind(desktop.input, desktop.box);
  bind(mobile.input, mobile.box);

  // =====================================================
  // FORM SUBMIT
  // =====================================================
  desktop.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const term = desktop.input.value.trim();
    if (term) {
      window.location.href = `/shop/?q=${encodeURIComponent(term)}`;
    }
  });

  mobile.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const term = mobile.input.value.trim();
    if (term) {
      window.location.href = `/shop/?q=${encodeURIComponent(term)}`;
    }
  });

  console.log('Search ready.');
})();
