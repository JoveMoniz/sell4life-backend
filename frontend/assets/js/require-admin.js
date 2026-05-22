// ======================================================
// SELL4LIFE ADMIN GUARD — v20260521b
// Hides page until /auth/me confirms admin role,
// then shows it — or redirects to admin sign-in.
// ======================================================

(() => {
  document.documentElement.style.visibility = 'hidden';

  const token = localStorage.getItem('s4l_token');
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  fetch(`${window.API_BASE}/auth/me`, { credentials: 'include', headers })
    .then((res) => {
      if (!res.ok) throw new Error();
      return res.json();
    })
    .then((data) => {
      if (data.user?.role !== 'admin') throw new Error();
      document.documentElement.style.visibility = '';
    })
    .catch(() => {
      window.location.replace('/account/admin/signin.html');
    });
})();
