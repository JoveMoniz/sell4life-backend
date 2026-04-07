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

async function loadLayout() {
  if (!shouldInjectLayout) return;

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

  try {
    const res = await fetch('/account/vendor/vendor-sidebar.html', {
      cache: 'no-store',
    });

    const html = await res.text();
    container.innerHTML = html;
  } catch (err) {
    console.warn('Sidebar skipped', err);
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
