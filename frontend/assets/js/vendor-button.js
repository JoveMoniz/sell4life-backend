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
  const vendorStatus = btn.dataset.vendorStatus;

  // 🔴 NOT LOGGED IN → SELL LANDING PAGE
  if (!token) {
    window.location.href = '/sell/';
    return;
  }

  // 🟡 LOGGED IN BUT NOT VENDOR → CREATE STORE
  if (!isVendor) {
    window.location.href = '/account/vendor/create.html';
    return;
  }

  // 🔴 NOT APPROVED → BLOCK
  if (vendorStatus === 'pending') {
    alert('Your store is under review');
    return;
  }

  if (vendorStatus === 'suspended') {
    alert('Your store is suspended');
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
  const cachedStatus = localStorage.getItem('s4l_vendorStatus');

  if (cached === 'true' && cachedStatus) {
    buttons.forEach((btn) => {
      btn.dataset.isVendor = 'true';
      btn.dataset.vendorStatus = cachedStatus;

      if (cachedStatus === 'approved') {
        btn.textContent = 'Go to Dashboard →';
      } else if (cachedStatus === 'pending') {
        btn.textContent = 'Store Under Review';
      } else if (cachedStatus === 'suspended') {
        btn.textContent = 'Store Suspended';
      }
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

    if (data.isVendor && data.vendor) {
      const status = data.vendor.status;

      localStorage.setItem('s4l_isVendor', 'true');
      localStorage.setItem('s4l_vendorStatus', status);

      buttons.forEach((btn) => {
        btn.dataset.isVendor = 'true';
        btn.dataset.vendorStatus = status;

        if (status === 'approved') {
          btn.textContent = 'Go to Dashboard →';
        } else if (status === 'pending') {
          btn.textContent = 'Store Under Review';
        } else if (status === 'suspended') {
          btn.textContent = 'Store Suspended';
        }
      });

      if (status === 'approved') {
        try {
          const cr = await fetch(`${API_BASE}/vendor/orders/pending-count`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (cr.ok) {
            const { count } = await cr.json();
            buttons.forEach((btn) => {
              btn.querySelectorAll('.vendor-btn-badge').forEach(b => b.remove());
              if (count > 0) {
                const badge = document.createElement('span');
                badge.className = 'vendor-btn-badge';
                badge.textContent = count > 99 ? '99+' : count;
                btn.appendChild(badge);
              }
            });
          }
        } catch { /* non-critical */ }
      }
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
