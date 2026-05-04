// ======================================================
// SELL4LIFE AUTH GUARD
// Protects pages requiring login
// ======================================================

(() => {
  const token = localStorage.getItem('s4l_token');

  if (!token) {
    window.location.href = '/account/signin.html';
    return;
  }

  try {
    // split JWT
    const payload = token.split('.')[1];
    if (!payload) throw new Error('Invalid token');

    const decoded = JSON.parse(atob(payload));

    // check expiry
    if (decoded.exp && Date.now() >= decoded.exp * 1000) {
      localStorage.removeItem('s4l_token');
      window.location.href = '/account/signin.html';
      return;
    }
  } catch (err) {
    localStorage.removeItem('s4l_token');
    window.location.href = '/account/signin.html';
  }
})();

if (window.location.pathname.includes('/admin')) {
  const role = localStorage.getItem('s4l_role');

  if (role !== 'admin') {
    window.location.href = '/account/signin.html';
  }
}
