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
})();
