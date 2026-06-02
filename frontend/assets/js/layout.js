// =====================================================
// BASIC PAGE CHECK
// =====================================================

// Safety: remove loading state after 3 seconds if stuck
setTimeout(() => {
  if (document.body.classList.contains('s4l-loading')) {
    document.body.classList.remove('s4l-loading');
    document.getElementById('s4l-fouc')?.remove();
  }
}, 3000);

const path = location.pathname.toLowerCase();

const noLayoutPages = [
  '/cart.html',
  '/checkout.html',
  '/thankyou/thankyou.html',
  '/account/orders.html',
  '/account/orders-details.html',
  '/account/signin.html',
  '/account/register.html',
  '/account/forgot-password.html',
  '/account/reset-password.html',
  '/account/verify-email.html',
];

const shouldInjectLayout = !noLayoutPages.some((route) => path.includes(route));

function drawLogoUnderline(svgId, txtId, yLine, sw) {
  document.fonts.ready.then(() => {
    const svg = document.getElementById(svgId);
    const txt = document.getElementById(txtId);
    if (!svg || !txt) return;
    const w = txt.getBBox().width;
    svg.setAttribute('width', (w + 4) + 'px');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '0');  line.setAttribute('y1', yLine);
    line.setAttribute('x2', w);   line.setAttribute('y2', yLine);
    line.setAttribute('stroke', '#f18c28');
    line.setAttribute('stroke-width', sw);
    line.setAttribute('stroke-linecap', 'square');
    svg.appendChild(line);
  });
}

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

/* ── Styled dialogs ── */
(function () {
  const css = `
.s4l-dialog-overlay{position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:9999;animation:s4l-fadein .15s ease}
@keyframes s4l-fadein{from{opacity:0}to{opacity:1}}
.s4l-dialog{background:#fff;border-radius:12px;padding:24px 28px;max-width:420px;width:calc(100% - 32px);box-shadow:0 8px 32px rgba(0,0,0,.15)}
.s4l-dialog-msg{font-size:.9rem;color:#111827;margin:0 0 20px;line-height:1.5;white-space:pre-wrap}
.s4l-dialog-input{width:100%;padding:8px 10px;border:1px solid #d1d5db;border-radius:6px;font-size:.875rem;margin-bottom:16px;box-sizing:border-box;font-family:inherit;color:#374151}
.s4l-dialog-actions{display:flex;gap:8px;justify-content:flex-end}
.s4l-dialog-primary{padding:7px 18px;background:#111827;color:#fff;border:none;border-radius:6px;font-size:.85rem;font-weight:600;cursor:pointer}
.s4l-dialog-secondary{padding:7px 18px;background:#fff;color:#6b7280;border:1px solid #d1d5db;border-radius:6px;font-size:.85rem;cursor:pointer}`;
  const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s);
  function _dlg(html, setup) {
    return new Promise(resolve => {
      const ov = document.createElement('div');
      ov.className = 's4l-dialog-overlay';
      ov.innerHTML = `<div class="s4l-dialog">${html}</div>`;
      document.body.appendChild(ov);
      ov.addEventListener('click', e => { if (e.target === ov) { ov.remove(); resolve(null); } });
      setup(ov, resolve);
    });
  }
  window.showAlert = msg => _dlg(
    `<p class="s4l-dialog-msg">${msg}</p><div class="s4l-dialog-actions"><button class="s4l-dialog-primary">OK</button></div>`,
    (el, res) => el.querySelector('.s4l-dialog-primary').onclick = () => { el.remove(); res(); }
  );
  window.showConfirm = msg => _dlg(
    `<p class="s4l-dialog-msg">${msg}</p><div class="s4l-dialog-actions"><button class="s4l-dialog-secondary s4l-no">Cancel</button><button class="s4l-dialog-primary s4l-yes">Confirm</button></div>`,
    (el, res) => {
      el.querySelector('.s4l-yes').onclick = () => { el.remove(); res(true); };
      el.querySelector('.s4l-no').onclick  = () => { el.remove(); res(false); };
    }
  );
  window.showPrompt = (msg, placeholder = '') => _dlg(
    `<p class="s4l-dialog-msg">${msg}</p><input class="s4l-dialog-input" type="text" placeholder="${placeholder}"/><div class="s4l-dialog-actions"><button class="s4l-dialog-secondary s4l-no">Cancel</button><button class="s4l-dialog-primary s4l-yes">OK</button></div>`,
    (el, res) => {
      const inp = el.querySelector('input');
      inp.focus();
      el.querySelector('.s4l-yes').onclick = () => { el.remove(); res(inp.value); };
      el.querySelector('.s4l-no').onclick  = () => { el.remove(); res(null); };
      inp.onkeydown = e => { if (e.key === 'Enter') { el.remove(); res(inp.value); } if (e.key === 'Escape') { el.remove(); res(null); } };
    }
  );
})();

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
  localStorage.removeItem('s4l_vendorId');
  localStorage.removeItem('s4l_vendorType');
  localStorage.removeItem('s4l_vendorStatus');

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
        drawLogoUnderline('s4l-logo-desktop', 's4l-logo-txt-d', 44, '3');
        drawLogoUnderline('s4l-logo-mobile',  's4l-logo-txt-m', 38, '2.5');
      }

      // ⚠️ delay to ensure DOM ready
      setTimeout(() => {
        document.dispatchEvent(new Event('headerLoaded'));
      }, 0);
    } catch (err) {
      console.warn('Header skipped', err);
    }

    try {
      if (!document.querySelector('.s4l-footer')) {
        const res = await fetch('/includes/footer.html', { cache: 'no-store' });
        const html = await res.text();
        document.body.insertAdjacentHTML('beforeend', html);
        drawLogoUnderline('s4l-logo-footer', 's4l-logo-txt-f', 28, '1.5');
      }
    } catch (err) {
      console.warn('Footer skipped', err);
    }
  }

  await loadVendorSidebar();

  // Reveal page now that header/sidebar are in the DOM
  document.getElementById('s4l-fouc')?.remove();
  document.body.classList.remove('s4l-loading');

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

  // Close mobile nav drawer on outside click
  const navDrawer = document.getElementById('mobile-nav-drawer');
  const hamburger = document.getElementById('mobile-hamburger');
  if (navDrawer && hamburger && navDrawer.classList.contains('open')) {
    if (!e.target.closest('.mobile-search-row, .mobile-nav-drawer')) {
      navDrawer.classList.remove('open');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
    }
  }
});

// =====================================================
// VENDOR SIDEBAR
// =====================================================

async function loadVendorSidebar() {
  const container = document.getElementById('vendor-sidebar');
  if (!container) return;

  // Auth guard — redirect to sign-in if not logged in or not a vendor
  const token = localStorage.getItem('s4l_token');
  const isVendor = localStorage.getItem('s4l_isVendor') === 'true';
  if (!token || !isVendor) {
    window.location.replace('/account/signin.html');
    return;
  }

  // Inject mobile bar immediately (before async fetch) so it appears instantly
  injectMobileBar();

  // Vendor pages don't load footer.html so toast + confirmModal would be missing
  if (!document.getElementById('toast')) {
    document.body.insertAdjacentHTML('beforeend',
      '<div id="toast" class="toast"></div>' +
      '<div id="confirmModal" class="confirm-modal">' +
        '<div class="confirm-box">' +
          '<p id="confirmText">Are you sure?</p>' +
          '<div class="confirm-actions">' +
            '<button id="confirmYes" class="btn-danger">Confirm</button>' +
            '<button id="confirmNo" class="btn-cancel">Cancel</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  // URL is the most reliable signal — casual pages always have '-casual' in the path
  const isCasualPage = window.location.pathname.includes('-casual');
  const pageTier = isCasualPage ? 'casual' : document.body.dataset.vendorTier;
  let vendorData = null;
  let sidebarFile;

  if (pageTier === 'casual') {
    sidebarFile = '/account/vendor/vendor-sidebar-casual.html';
  } else {
    // Fetch from API for shared pages (orders, products, payouts, settings…)
    try {
      const vRes = await fetch(`${window.API_BASE}/vendor/me`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: 'include',
      });
      if (vRes.ok) {
        const vJson = await vRes.json();
        vendorData = vJson.vendor || null;
        if (vendorData?.type) localStorage.setItem('s4l_vendorType', vendorData.type);
      }
    } catch {}

    const vendorType = vendorData?.type || localStorage.getItem('s4l_vendorType') || 'casual';
    const sidebarMap = {
      casual:       '/account/vendor/vendor-sidebar-casual.html',
      refurbished:  '/account/vendor/vendor-sidebar-refurbished.html',
      professional: '/account/vendor/vendor-sidebar.html',
      enterprise:   '/account/vendor/vendor-sidebar.html',
    };
    sidebarFile = sidebarMap[vendorType] || '/account/vendor/vendor-sidebar.html';
  }

  try {
    const res = await fetch(sidebarFile, {
      cache: 'no-store',
    });

    const html = await res.text();
    container.innerHTML = html;

    // Mark active nav link
    const path = window.location.pathname;
    container.querySelectorAll('.vendor-nav a').forEach((a) => {
      if (a.getAttribute('href') === path) a.classList.add('active');
    });

    // Populate vendor identity — pass pre-fetched data to avoid second API call
    populateVendorIdentity(container, vendorData);

    // Orders badge
    loadOrderBadge(container);

    // Wire logout link
    const logoutLink = container.querySelector('.vendor-logout');
    if (logoutLink) {
      logoutLink.addEventListener('click', (e) => {
        e.preventDefault();
        logout();
      });
    }
  } catch (err) {
    console.warn('Sidebar skipped', err);
  }

  // Ensure loading state is cleared even if sidebar fails
  document.getElementById('s4l-fouc')?.remove();
  document.body.classList.remove('s4l-loading');
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

  // Dropdown nav — tier-aware
  const currentPath = window.location.pathname;
  const _mTier = window.location.pathname.includes('-casual')
    ? 'casual'
    : (document.body.dataset.vendorTier || localStorage.getItem('s4l_vendorType') || 'casual');
  const _casual = _mTier === 'casual';

  const _refurbished = _mTier === 'refurbished';

  const mobileNavMap = {
    casual: [
      { href: '/account/vendor/dashboard-casual.html',   label: 'Dashboard' },
      { href: '/account/vendor/products.html',           label: 'My Listings' },
      { href: '/account/vendor/add-product-casual.html', label: 'Add Product' },
      { href: '/account/vendor/orders.html',             label: 'Orders' },
      { href: '/account/vendor/payouts.html',            label: 'Payouts' },
      { href: '/account/vendor/settings.html',           label: 'Store Settings' },
      { href: '/account/signin.html',                    label: 'Logout', cls: 'vendor-logout' },
    ],
    refurbished: [
      { href: '/account/vendor/dashboard.html',          label: 'Dashboard' },
      { href: '/account/vendor/products.html',           label: 'Products' },
      { href: '/account/vendor/add-product.html',        label: 'Add Product' },
      { href: '/account/vendor/orders.html',             label: 'Orders' },
      { href: '/account/vendor/transactions.html',       label: 'Transactions' },
      { href: '/account/vendor/payouts.html',            label: 'Payouts' },
      { href: '/account/vendor/settings.html',           label: 'Store Settings' },
      { href: '/account/signin.html',                    label: 'Logout', cls: 'vendor-logout' },
    ],
    professional: [
      { href: '/account/vendor/dashboard.html',          label: 'Dashboard' },
      { href: '/account/vendor/products.html',           label: 'Products' },
      { href: '/account/vendor/add-product.html',        label: 'Add Product' },
      { href: '/account/vendor/orders.html',             label: 'Orders' },
      { href: '/account/vendor/transactions.html',       label: 'Transactions' },
      { href: '/account/vendor/payouts.html',            label: 'Payouts' },
      { href: '/account/vendor/settings.html',           label: 'Store Settings' },
      { href: '/account/vendor/tools.html',              label: 'Tools' },
      { href: '/account/signin.html',                    label: 'Logout', cls: 'vendor-logout' },
    ],
  };
  mobileNavMap.enterprise = mobileNavMap.professional;

  const links = mobileNavMap[_mTier] || mobileNavMap.professional;

  const nav = document.createElement('div');
  nav.className = 'vendor-mobile-nav';
  nav.id = 'vendor-mobile-nav';
  nav.innerHTML = links
    .map((l) => {
      const classes = [l.cls, l.href === currentPath ? 'active' : ''].filter(Boolean);
      const cls = classes.length ? ` class="${classes.join(' ')}"` : '';
      return `<a href="${l.href}"${cls}>${l.label}</a>`;
    })
    .join('');
  bar.after(nav);

  // Wire mobile logout
  const mobileLogout = nav.querySelector('.vendor-logout');
  if (mobileLogout) {
    mobileLogout.addEventListener('click', (e) => {
      e.preventDefault();
      logout();
    });
  }

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

async function populateVendorIdentity(container, prefetchedVendor = null) {
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

    // Use pre-fetched vendor data if available, otherwise fetch
    let vendor = prefetchedVendor;
    if (!vendor) {
      const token = localStorage.getItem('s4l_token');
      const vendorRes = await fetch(`${window.API_BASE}/vendor/me`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        credentials: 'include',
      });
      if (!vendorRes.ok) return;
      const json = await vendorRes.json();
      vendor = json.vendor;
    }

    if (!vendor) return;

    const storeEl = container.querySelector('#sidebar-store-name');
    const slugEl = container.querySelector('#sidebar-store-slug');
    const userEl = container.querySelector('#sidebar-user-name');
    const avatarEl = container.querySelector('#sidebar-avatar');

    if (storeEl && vendor.storeName) storeEl.textContent = vendor.storeName;
    if (slugEl && vendor.storeSlug) slugEl.textContent = `@${vendor.storeSlug}`;
    if (userEl && displayName) userEl.textContent = displayName;

    // Avatar: first letter of store name
    if (avatarEl && vendor.storeName) {
      avatarEl.textContent = vendor.storeName.charAt(0).toUpperCase();
    }

    // Update mobile top bar identity
    const mobileStoreEl = document.getElementById('mobile-store-name');
    if (mobileStoreEl && vendor.storeName) mobileStoreEl.textContent = vendor.storeName;
    const mobileAvatarEl = document.getElementById('mobile-bar-avatar');
    if (mobileAvatarEl && vendor.storeName)
      mobileAvatarEl.textContent = vendor.storeName.charAt(0).toUpperCase();

    // Cache tier and dispatch event so sidebar + pages can react
    if (vendor.type) {
      localStorage.setItem('s4l_vendorType', vendor.type);
      document.dispatchEvent(new CustomEvent('vendorLoaded', { detail: { type: vendor.type, vendor } }));
    }
  } catch (err) {
    console.warn('Vendor identity skipped', err);
  }
}


// =====================================================
// BUYER NOTIFICATION BADGE
// =====================================================

let _buyerBadgeDone = false;

async function applyBuyerBadge() {
  if (_buyerBadgeDone) return;
  _buyerBadgeDone = true;

  const token = localStorage.getItem('s4l_token');
  if (!token) return;

  let since = localStorage.getItem('s4l_orders_seen');
  if (!since) {
    localStorage.setItem('s4l_orders_seen', Date.now());
    return;
  }

  try {
    const r = await fetch(`${window.API_BASE}/account/unseen-orders?since=${since}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return;
    const { count } = await r.json();
    if (!count) return;

    const label = count > 99 ? '99+' : String(count);

    ['accountBtnDesktop', 'accountBtnMobile'].forEach((id) => {
      const btn = document.getElementById(id);
      if (btn && !btn.querySelector('.buyer-notif-badge')) {
        const b = document.createElement('span');
        b.className = 'buyer-notif-badge';
        b.textContent = label;
        btn.appendChild(b);
      }
    });
  } catch {
    /* non-critical */
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
    const settings = menu.querySelector('.dd-settings');
    const vendorLink = menu.querySelector('.dd-vendor');
    const logoutBtn = menu.querySelector('.dd-logout');

    if (token) {
      login && (login.style.display = 'none');
      register && (register.style.display = 'none');
      orders && (orders.style.display = 'block');
      settings && (settings.style.display = 'block');
      logoutBtn && (logoutBtn.style.display = 'block');
      logoutBtn && logoutBtn.addEventListener('click', logout);
      vendorLink && (vendorLink.style.display = 'none');
    } else {
      orders && (orders.style.display = 'none');
      settings && (settings.style.display = 'none');
      vendorLink && (vendorLink.style.display = 'none');
      logoutBtn && (logoutBtn.style.display = 'none');
      login && (login.style.display = 'block');
      register && (register.style.display = 'block');
    }
  }

  setupAccount('accountBtnDesktop', 'accountDropdownDesktop');
  setupAccount('accountBtnMobile', 'accountDropdownMobile');

  // Mobile hamburger nav drawer
  const hamburger = document.getElementById('mobile-hamburger');
  const navDrawer = document.getElementById('mobile-nav-drawer');
  if (hamburger && navDrawer) {
    hamburger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = navDrawer.classList.contains('open');
      navDrawer.classList.toggle('open');
      hamburger.classList.toggle('open');
      hamburger.setAttribute('aria-expanded', String(!isOpen));
    });

    navDrawer.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        navDrawer.classList.remove('open');
        hamburger.classList.remove('open');
        hamburger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  applyBuyerBadge();
  initEmailVerificationBanner();
});

// =====================================================
// SCRIPT LOADER
// =====================================================

(async function loadScripts() {
  // Wait for full DOM parse before checking window.__pageScripts.
  // Dynamic scripts are async (not deferred) so this guard is required.
  await new Promise((resolve) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', resolve, { once: true });
    } else {
      resolve();
    }
  });

  let version;

  try {
    const res = await fetch('https://sell4life-backend.onrender.com/api/version');
    const data = await res.json();
    version = data.version;
  } catch {
    version = 'dev';
  }

  function loadScript(path) {
    const clean = path.split('?')[0];
    const s = document.createElement('script');
    s.src = `${clean}?v=${version}&t=${Date.now()}`;
    s.defer = true;
    document.body.appendChild(s);
  }

  if (!window.__coreLoaded) {
    window.__coreLoaded = true;
    const _p = location.pathname;
    const _isBackoffice = _p.includes('/account/admin/') || _p.includes('/account/vendor/');
    // Buyer-facing scripts and cookie banner — skip on admin and vendor pages
    if (!_isBackoffice) {
      initCookieBanner();
      loadScript('/assets/js/quick-add.js');
      loadScript('/assets/js/cart.js');
      loadScript('/assets/js/search.js');
      loadScript('/assets/js/sticky-bar.js');
    }
  }

  if (window.__pageScripts && Array.isArray(window.__pageScripts)) {
    window.__pageScripts.forEach(loadScript);
  }
})();

// =====================================================
// EMAIL VERIFICATION BANNER
// =====================================================

function initEmailVerificationBanner() {
  const token = localStorage.getItem('s4l_token');
  if (!token) return;

  let user = null;
  try { user = JSON.parse(localStorage.getItem('s4l_user') || 'null'); } catch {}
  if (!user) return;
  if (user.emailVerified !== false) return;
  if (localStorage.getItem('s4l_verify_dismissed') === '1') return;

  const style = document.createElement('style');
  style.textContent = `
    .s4l-verify-bar {
      background: #fef3cd;
      border-bottom: 1px solid #f0c040;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      padding: 9px 16px;
      font-family: inherit;
      font-size: 13px;
      color: #5a4000;
      flex-wrap: wrap;
      text-align: center;
    }
    .s4l-verify-send {
      background: #f28c28 !important;
      color: #fff !important;
      border: none !important;
      border-radius: 5px !important;
      padding: 5px 14px !important;
      font-size: 12px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      width: auto !important;
      margin: 0 !important;
      white-space: nowrap !important;
    }
    .s4l-verify-dismiss {
      background: none !important;
      border: none !important;
      color: #5a4000 !important;
      cursor: pointer !important;
      font-size: 16px !important;
      line-height: 1 !important;
      padding: 0 4px !important;
      width: auto !important;
      margin: 0 !important;
      opacity: 0.6;
    }
    .s4l-verify-dismiss:hover { opacity: 1; }
  `;
  document.head.appendChild(style);

  const bar = document.createElement('div');
  bar.className = 's4l-verify-bar';
  bar.innerHTML = `
    <span>Please verify your email address to keep your account secure.</span>
    <button class="s4l-verify-send" id="verifyResendBtn">Send verification email</button>
    <button class="s4l-verify-dismiss" id="verifyDismissBtn" title="Dismiss">×</button>`;
  document.body.insertBefore(bar, document.body.firstChild);

  document.getElementById('verifyDismissBtn').addEventListener('click', () => {
    localStorage.setItem('s4l_verify_dismissed', '1');
    bar.remove();
  });

  const resendBtn = document.getElementById('verifyResendBtn');
  resendBtn.addEventListener('click', async () => {
    resendBtn.disabled = true;
    resendBtn.textContent = 'Sending…';
    try {
      const r = await fetch(`${window.API_BASE}/auth/resend-verification`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const d = await r.json();
      if (d.ok && d.msg === 'already_verified') {
        bar.remove();
      } else if (d.ok) {
        resendBtn.textContent = 'Email sent!';
        resendBtn.style.setProperty('background', '#1a7f37', 'important');
        setTimeout(() => bar.remove(), 3000);
      } else {
        resendBtn.disabled = false;
        resendBtn.textContent = 'Try again';
      }
    } catch {
      resendBtn.disabled = false;
      resendBtn.textContent = 'Try again';
    }
  });
}

// =====================================================
// COOKIE CONSENT BANNER
// =====================================================

function initCookieBanner() {
  if (localStorage.getItem('s4l_cookies') === 'accepted') return;
  // No cookie consent prompt needed on internal vendor/admin pages
  const _cp = location.pathname;
  if (_cp.includes('/account/vendor/') || _cp.includes('/account/admin/')) return;

  const style = document.createElement('style');
  style.id = 's4l-cookie-styles';
  style.textContent = `
    .s4l-cookie-banner {
      position: fixed;
      bottom: 0; left: 0; right: 0;
      z-index: 9999;
      background: #0b6b6a;
      border-top: none;
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 10px;
      padding: 12px 20px;
      box-shadow: 0 -2px 12px rgba(0,0,0,0.06);
      transform: translateY(100%);
      transition: transform 0.35s ease;
    }
    .s4l-cookie-banner.s4l-cookie-visible {
      transform: translateY(0);
    }
    .s4l-cookie-text {
      margin: 0;
      font-size: 13px;
      flex: 1;
      min-width: 180px;
      line-height: 1.4;
      color: #fff;
      font-family: inherit;
    }
    .s4l-cookie-actions {
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
    }
    .s4l-cookie-btn {
      background: #f28c28 !important;
      color: #fff !important;
      border: none !important;
      border-radius: 6px !important;
      padding: 7px 18px !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      cursor: pointer !important;
      white-space: nowrap !important;
      width: auto !important;
      margin: 0 !important;
      line-height: 1.4 !important;
      display: inline-block !important;
    }
    .s4l-cookie-link {
      color: rgba(255,255,255,0.8) !important;
      font-size: 12px;
      text-decoration: underline;
      white-space: nowrap;
    }
    @media (max-width: 600px) {
      .s4l-cookie-banner {
        padding: 8px 14px;
        gap: 8px;
      }
      .s4l-cookie-text {
        font-size: 11px;
        min-width: 0;
        line-height: 1.3;
      }
      .s4l-cookie-btn {
        padding: 6px 14px !important;
        font-size: 12px !important;
      }
      .s4l-cookie-link {
        font-size: 11px;
      }
    }
  `;
  document.head.appendChild(style);

  const banner = document.createElement('div');
  banner.className = 's4l-cookie-banner';
  banner.innerHTML = `
    <p class="s4l-cookie-text">We use cookies to keep you signed in and process payments securely. No advertising or tracking.</p>
    <div class="s4l-cookie-actions">
      <button id="cookieAccept" class="s4l-cookie-btn">Accept</button>
      <a href="/legal/privacy.html" class="s4l-cookie-link">Privacy Policy</a>
    </div>`;
  document.body.appendChild(banner);

  requestAnimationFrame(() => requestAnimationFrame(() => banner.classList.add('s4l-cookie-visible')));

  document.getElementById('cookieAccept').addEventListener('click', () => {
    localStorage.setItem('s4l_cookies', 'accepted');
    banner.classList.remove('s4l-cookie-visible');
    setTimeout(() => banner.remove(), 400);
  });
}

// =====================================================
// START
// =====================================================

loadLayout().catch(() => {
  document.getElementById('s4l-fouc')?.remove();
  document.body.classList.remove('s4l-loading');
});

// Safety: if layout not needed (noLayout pages), still reveal body
if (!shouldInjectLayout) {
  document.getElementById('s4l-fouc')?.remove();
  document.body.classList.remove('s4l-loading');
}

// Hard timeout: never leave the body hidden more than 2 seconds (more aggressive for logged-in users)
setTimeout(() => {
  if (document.body.classList.contains('s4l-loading')) {
    console.warn('Page still loading after 2s, forcing reveal...');
    document.getElementById('s4l-fouc')?.remove();
    document.body.classList.remove('s4l-loading');
    document.body.style.visibility = 'visible';
    document.body.style.overflow = 'auto';
    document.documentElement.style.visibility = 'visible';
  }
}, 2000);

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
