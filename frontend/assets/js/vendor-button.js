// =====================================================
// VENDOR BUTTON (FINAL MERGED VERSION)
// =====================================================

// =====================================================
// GLOBAL CLICK HANDLER (AUTH + ROLE + INTENT)
// =====================================================
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-vendor-start]');
  if (!btn) return;

  e.preventDefault();

  const token = localStorage.getItem('s4l_token');
  const isVendor = btn.dataset.isVendor === 'true';

  // 🔴 NOT LOGGED IN → SAVE INTENT + GO LOGIN
  if (!token) {
    localStorage.setItem('s4l_intent', 'sell'); // 🔥 THIS IS THE KEY
    window.location.href = '/account/signin.html';
    return;
  }

  // 🟡 LOGGED IN BUT NOT VENDOR → CREATE STORE
  if (!isVendor) {
    window.location.href = '/account/vendor/create.html';
    return;
  }

  // 🟢 VENDOR → DASHBOARD
  window.location.href = '/account/vendor/dashboard.html';
});

// -----------------------------------------------------
// INIT FUNCTION (safe + accurate)
// -----------------------------------------------------
async function initVendorButtons() {
  const buttons = document.querySelectorAll('[data-vendor-start]');
  if (!buttons.length) return;

  const token = localStorage.getItem('s4l_token');
  const cached = localStorage.getItem('s4l_isVendor');

  // ---------------------------
  // 1. NO TOKEN → FORCE RESET
  // ---------------------------
  if (!token) {
    localStorage.removeItem('s4l_isVendor');

    buttons.forEach((btn) => {
      btn.textContent = 'Start Selling →';
      btn.dataset.isVendor = 'false';
    });

    return;
  }

  // ---------------------------
  // 2. FAST CACHE (instant UI)
  // ---------------------------
  if (cached === 'true') {
    buttons.forEach((btn) => {
      btn.textContent = 'Go to Dashboard →';
      btn.dataset.isVendor = 'true';
    });
  } else {
    buttons.forEach((btn) => {
      btn.textContent = 'Start Selling →';
      btn.dataset.isVendor = 'false';
    });
  }

  // ---------------------------
  // 3. VERIFY WITH BACKEND
  // ---------------------------
  try {
    const res = await fetch(`${API_BASE}/vendor/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();

    if (data.isVendor) {
      localStorage.setItem('s4l_isVendor', 'true');

      buttons.forEach((btn) => {
        btn.textContent = 'Go to Dashboard →';
        btn.dataset.isVendor = 'true';
      });
    } else {
      localStorage.setItem('s4l_isVendor', 'false');

      buttons.forEach((btn) => {
        btn.textContent = 'Start Selling →';
        btn.dataset.isVendor = 'false';
      });
    }
  } catch (err) {
    console.warn('Vendor check failed');
  }
}

// -----------------------------------------------------
// RUN INIT (reliable triggers)
// -----------------------------------------------------
initVendorButtons();

document.addEventListener('layoutReady', initVendorButtons);

window.addEventListener('pageshow', initVendorButtons);
