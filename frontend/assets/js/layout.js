// =====================================================
// BASIC PAGE CHECK
// =====================================================

const path = location.pathname.toLowerCase();

const noLayoutPages = [
  '/cart.html',
  '/checkout.html',
  '/account/orders.html',
  '/account/orders-details.html',
  '/account/signin.html',
  '/account/register.html',
];

const shouldInjectLayout = !noLayoutPages.some((route) => path.includes(route));

// =====================================================
// GLOBAL FUNCTIONS
// =====================================================

window.confirmAction = function (message) {
  return new Promise((resolve) => {
    const modal = document.getElementById('confirmModal');
    if (!modal) return resolve(false);

    const text = document.getElementById('confirmText');
    const yes = document.getElementById('confirmYes');
    const no = document.getElementById('confirmNo');

    text.textContent = message;
    modal.style.display = 'flex';

    const cleanup = () => {
      modal.style.display = 'none';
      yes.onclick = null;
      no.onclick = null;
    };

    yes.onclick = () => {
      cleanup();
      resolve(true);
    };

    no.onclick = () => {
      cleanup();
      resolve(false);
    };
  });
};

window.showToast = function (message, type = 'success') {
  const toast = document.getElementById('toast');
  if (!toast) return;

  toast.textContent = message;
  toast.className = 'toast show';

  if (type === 'error') {
    toast.classList.add('error');
  }

  setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
};

// =====================================================
// LOGOUT
// =====================================================

function logout() {
  localStorage.removeItem('s4l_token');
  localStorage.removeItem('s4l_user');
  localStorage.removeItem('s4l_isVendor');

  window.showToast('You have been logged out');

  setTimeout(() => {
    window.location.href = '/';
  }, 1500);
}

// =====================================================
// LOAD HEADER + FOOTER
// =====================================================

const isVendorPage = path.includes('/account/vendor/');

async function loadLayout() {
  if (!shouldInjectLayout) return;

  // Vendor panel pages use a sidebar instead of the global site header/footer
  if (!isVendorPage) {
    try {
      if (!document.querySelector('.s4l-header-desktop')) {
        const res = await fetch('/includes/header.html', { cache: 'no-store' });
        const html = await res.text();
        document.body.insertAdjacentHTML('afterbegin', html);
      }

      // ⚠️ delay to ensure DOM ready
      setTimeout(() => {
        document.dispatchEvent(new Event('headerLoaded'));
      }, 0);
    } catch (err) {
      console.warn('Header skipped', err);
    }

    try {
      if (!document.querySelector('.site-footer')) {
        const res = await fetch('/includes/footer.html', { cache: 'no-store' });
        const html = await res.text();
        document.body.insertAdjacentHTML('beforeend', html);
      }
    } catch (err) {
      console.warn('Footer skipped', err);
    }
  }

  await loadVendorSidebar();

  document.dispatchEvent(new Event('layoutReady'));
}

// =====================================================
// GLOBAL CLICK CONTROL (ACCOUNT + SEARCH)
// =====================================================

document.addEventListener('click', (e) => {
  const clickedInsideAccount = e.target.closest('.account-menu');

  if (!clickedInsideAccount) {
    document.querySelectorAll('.account-dropdown').forEach((menu) => {
      menu.classList.remove('open');
    });
  }

  const searchBox = document.querySelector('.search-autocomplete');
  const clickedInsideSearch = e.target.closest('.header-search, .mobile-search');

  if (searchBox && !clickedInsideSearch) {
    searchBox.classList.remove('show');
  }
});

// =====================================================
// VENDOR SIDEBAR
// =====================================================

async function loadVendorSidebar() {
  const container = document.getElementById('vendor-sidebar');
  if (!container) return;

  // Inject mobile bar immediately (before async fetch) so it appears instantly
  injectMobileBar();

  try {
    const res = await fetch('/account/vendor/vendor-sidebar.html', {
      cache: 'no-store',
    });

    const html = await res.text();
    container.innerHTML = html;

    // Mark active nav link
    const path = window.location.pathname;
    container.querySelectorAll('.vendor-nav a').forEach(a => {
      if (a.getAttribute('href') === path) a.classList.add('active');
    });

    // Populate vendor identity
    populateVendorIdentity(container);

    // Orders badge
    loadOrderBadge(container);
  } catch (err) {
    console.warn('Sidebar skipped', err);
  }
}

async function loadOrderBadge(container) {
  try {
    const token = localStorage.getItem('s4l_token');
    const res = await fetch(`${window.API_BASE}/vendor/orders/pending-count`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });
    if (!res.ok) return;
    const { count } = await res.json();
    if (!count) return;

    const ordersLink = container.querySelector('a[href="/account/vendor/orders.html"]');
    if (!ordersLink) return;

    const badge = document.createElement('span');
    badge.className = 'vendor-order-badge';
    badge.textContent = count > 99 ? '99+' : count;
    ordersLink.appendChild(badge);

    // Mobile nav badge
    const mobileNav = document.getElementById('vendor-mobile-nav');
    if (mobileNav) {
      const mobileLink = mobileNav.querySelector('a[href="/account/vendor/orders.html"]');
      if (mobileLink) {
        const mobileBadge = document.createElement('span');
        mobileBadge.className = 'vendor-order-badge';
        mobileBadge.textContent = badge.textContent;
        mobileLink.appendChild(mobileBadge);
      }
    }
  } catch {
    // badge is non-critical
  }
}

function injectMobileBar() {
  if (document.querySelector('.vendor-mobile-bar')) return;

  // Top bar: hamburger + avatar + store name
  const bar = document.createElement('div');
  bar.className = 'vendor-mobile-bar';
  bar.innerHTML = `
    <button class="vendor-hamburger" type="button" aria-label="Open menu">&#9776;</button>
    <div class="vendor-bar-identity">
      <div class="vendor-bar-avatar" id="mobile-bar-avatar"></div>
      <span class="vendor-bar-store" id="mobile-store-name"></span>
    </div>
  `;
  document.body.prepend(bar);

  // Dropdown nav
  const currentPath = window.location.pathname;
  const links = [
    { href: '/account/vendor/dashboard.html',    label: 'Dashboard' },
    { href: '/account/vendor/products.html',     label: 'Products' },
    { href: '/account/vendor/add-product.html',  label: 'Add Product' },
    { href: '/account/vendor/orders.html',       label: 'Orders' },
    { href: '/account/vendor/transactions.html', label: 'Transactions' },
    { href: '/account/signin.html',              label: 'Logout', cls: 'vendor-logout' },
  ];

  const nav = document.createElement('div');
  nav.className = 'vendor-mobile-nav';
  nav.id = 'vendor-mobile-nav';
  nav.innerHTML = links.map(l => {
    const classes = [l.cls, l.href === currentPath ? 'active' : ''].filter(Boolean);
    const cls = classes.length ? ` class="${classes.join(' ')}"` : '';
    return `<a href="${l.href}"${cls}>${l.label}</a>`;
  }).join('');
  bar.after(nav);

  // Toggle dropdown on hamburger
  bar.querySelector('.vendor-hamburger').addEventListener('click', (e) => {
    e.stopPropagation();
    nav.classList.toggle('open');
  });

  // Close on outside tap
  document.addEventListener('click', (e) => {
    if (!bar.contains(e.target)) nav.classList.remove('open');
  });
}

async function populateVendorIdentity(container) {
  try {
    // User info comes from localStorage (set at login, always available)
    let displayName = '';
    try {
      const userRaw = localStorage.getItem('s4l_user');
      if (userRaw) {
        const u = JSON.parse(userRaw);
        displayName = u.name || u.username || u.email || '';
      }
    } catch {}

    // Vendor store info from API
    const token = localStorage.getItem('s4l_token');
    const vendorRes = await fetch(`${window.API_BASE}/vendor/me`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
    });

    if (!vendorRes.ok) return;

    const { vendor } = await vendorRes.json();
    if (!vendor) return;

    const storeEl   = container.querySelector('#sidebar-store-name');
    const slugEl    = container.querySelector('#sidebar-store-slug');
    const userEl    = container.querySelector('#sidebar-user-name');
    const avatarEl  = container.querySelector('#sidebar-avatar');

    if (storeEl && vendor.storeName) storeEl.textContent = vendor.storeName;
    if (slugEl  && vendor.storeSlug) slugEl.textContent  = `@${vendor.storeSlug}`;
    if (userEl  && displayName)      userEl.textContent  = displayName;

    // Avatar: first letter of store name
    if (avatarEl && vendor.storeName) {
      avatarEl.textContent = vendor.storeName.charAt(0).toUpperCase();
    }

    // Update mobile top bar identity
    const mobileStoreEl = document.getElementById('mobile-store-name');
    if (mobileStoreEl && vendor.storeName) mobileStoreEl.textContent = vendor.storeName;
    const mobileAvatarEl = document.getElementById('mobile-bar-avatar');
    if (mobileAvatarEl && vendor.storeName) mobileAvatarEl.textContent = vendor.storeName.charAt(0).toUpperCase();
  } catch (err) {
    console.warn('Vendor identity skipped', err);
  }
}

// =====================================================
// HEADER INTERACTIONS
// =====================================================

document.addEventListener('headerLoaded', () => {
  const userRaw = localStorage.getItem('s4l_user');

  if (userRaw) {
    try {
      const user = JSON.parse(userRaw);
      const displayName = user.name ? user.name.split(' ')[0] : user.username;

      const desktopBtn = document.getElementById('accountBtnDesktop');
      const mobileBtn = document.getElementById('accountBtnMobile');

      if (desktopBtn) desktopBtn.textContent = displayName + ' ▾';
      if (mobileBtn) mobileBtn.textContent = displayName + ' ▾';
    } catch {}
  }

  function setupAccount(btnId, menuId) {
    const btn = document.getElementById(btnId);
    const menu = document.getElementById(menuId); // THIS is the dropdown

    if (!btn || !menu) return;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const isOpen = menu.classList.contains('open');

      // close ALL dropdowns
      document.querySelectorAll('.account-dropdown').forEach((m) => {
        m.classList.remove('open');
      });

      // open current if it was closed
      if (!isOpen) {
        menu.classList.add('open');
      }
    });

    const token = localStorage.getItem('s4l_token');

    const login = menu.querySelector('.dd-login');
    const register = menu.querySelector('.dd-register');
    const orders = menu.querySelector('.dd-orders');
    const logoutBtn = menu.querySelector('.dd-logout');

    if (token) {
      login && (login.style.display = 'none');
      register && (register.style.display = 'none');
      orders && (orders.style.display = 'block');
      logoutBtn && (logoutBtn.style.display = 'block');
      logoutBtn && logoutBtn.addEventListener('click', logout);
    } else {
      orders && (orders.style.display = 'none');
      logoutBtn && (logoutBtn.style.display = 'none');
      login && (login.style.display = 'block');
      register && (register.style.display = 'block');
    }
  }

  setupAccount('accountBtnDesktop', 'accountDropdownDesktop');
  setupAccount('accountBtnMobile', 'accountDropdownMobile');
});

// =====================================================
// SCRIPT LOADER
// =====================================================

(async function loadScripts() {
  let version;

  try {
    const res = await fetch('https://sell4life-backend.onrender.com/api/version');
    const data = await res.json();
    version = data.version;
  } catch {
    version = Date.now();
  }

  if (!window.__coreLoaded) {
    window.__coreLoaded = true;

    ['/assets/js/cart.js', '/assets/js/search.js'].forEach((path) => {
      const s = document.createElement('script');
      s.src = `${path}?v=${version}`;
      s.defer = true;
      document.body.appendChild(s);
    });
  }

  if (window.__pageScripts && Array.isArray(window.__pageScripts)) {
    window.__pageScripts.forEach((path) => {
      const s = document.createElement('script');
      s.src = `${path}?v=${version}`;
      s.defer = true;
      document.body.appendChild(s);
    });
  }
})();

// =====================================================
// SCROLL-TO-TOP BUTTON
// =====================================================

(function injectScrollTopBtn() {
  const btn = document.createElement('button');
  btn.id = 'scroll-top-btn';
  btn.className = 'scroll-top-btn';
  btn.setAttribute('aria-label', 'Back to top');
  btn.innerHTML = '&#8593;';
  document.body.appendChild(btn);

  btn.addEventListener('click', () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.addEventListener('scroll', () => {
    btn.classList.toggle('visible', window.scrollY > 280);
  }, { passive: true });
})();

// =====================================================
// START
// =====================================================

loadLayout();

// =====================================================
// GLOBAL CART CLEANUP (POST PAYMENT)
// =====================================================

async function autoCleanupAfterPayment() {
  const paymentIntentId = localStorage.getItem('last_payment_intent');
  const done = localStorage.getItem('checkout_completed');

  if (!paymentIntentId || done === 'true') return;

  const token = localStorage.getItem('s4l_token');
  if (!token) return;

  try {
    const res = await fetch(`${window.API_BASE}/orders/by-payment/${paymentIntentId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) return;

    const order = await res.json();

    if (order && order.paymentStatus === 'paid') {
      console.log('🧹 Global cleanup triggered');

      localStorage.removeItem('cart');
      localStorage.setItem('checkout_completed', 'true');

      document.dispatchEvent(new Event('cartUpdated'));
    }
  } catch (err) {
    console.warn('Cleanup check failed');
  }
}

// Run AFTER layout is ready
autoCleanupAfterPayment();
