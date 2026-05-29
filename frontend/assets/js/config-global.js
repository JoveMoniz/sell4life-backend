// ======================================================
// SELL4LIFE GLOBAL CONFIG
// Shared configuration for frontend scripts
// ======================================================

(function () {
  // --------------------------------------------------
  // Detect environment
  // --------------------------------------------------

  const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  // --------------------------------------------------
  // API base URL
  // --------------------------------------------------

  window.API_BASE = isLocal
    ? 'http://localhost:5000/api'
    : 'https://sell4life-backend.onrender.com/api';

  // --------------------------------------------------
  // Stripe publishable key
  // --------------------------------------------------

  window.STRIPE_PUBLISHABLE_KEY =
    'pk_test_51T5d67A1Mw7MF8uC9jIxvbO2ryqXdag6Og5z6r8sAUPGsEMYM5Tn9ymJOpTBaGYvndAApYvVEig5KQjNJf2KXW2k00ZLHNXPaM';

  // --------------------------------------------------
  // Inject layout.js with cache-busting on every load
  // (CSS is NOT re-versioned here — doing so after the
  //  page renders causes a flash of unstyled content)
  // --------------------------------------------------
  const _v = Date.now();

  const isAdminPage = location.pathname.includes('/account/admin/');
  if (!isAdminPage) {
    // Hide body until layout.js injects the header — prevents unstyled flash
    document.body.classList.add('s4l-loading');

    const _layout = document.createElement('script');
    _layout.src = '/assets/js/layout.js?v=' + _v;
    _layout.defer = true;
    document.head.appendChild(_layout);
  }
})();
