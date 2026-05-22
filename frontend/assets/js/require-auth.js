// ======================================================
// SELL4LIFE AUTH GUARD
// Hides page until /auth/me confirms a valid session,
// then shows it — or redirects to sign-in on failure.
// ======================================================

(() => {
  document.documentElement.style.visibility = 'hidden';

  const token = localStorage.getItem('s4l_token');

  if (!token) {
    window.location.replace('/account/signin.html');
    return;
  }

  fetch(`${window.API_BASE}/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((res) => {
      if (!res.ok) throw new Error();
      document.documentElement.style.visibility = '';
    })
    .catch(() => {
      localStorage.removeItem('s4l_token');
      localStorage.removeItem('s4l_user');
      window.location.replace('/account/signin.html');
    });
})();
