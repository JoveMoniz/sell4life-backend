// ======================================================
// SELL4LIFE AUTH GUARD
// Protects pages requiring login
// ======================================================

(() => {
  const token = localStorage.getItem('s4l_token');

  // No token → redirect
  if (!token) {
    window.location.href = '/account/signin.html';
    return;
  }

  // Basic JWT structure check
  if (!token.includes('.')) {
    localStorage.removeItem('s4l_token');
    window.location.href = '/account/signin.html';
  }
})();
