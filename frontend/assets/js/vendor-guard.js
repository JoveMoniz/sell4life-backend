(async () => {
  document.documentElement.style.visibility = 'hidden';

  const token = localStorage.getItem('s4l_token');
  if (!token) {
    window.location.replace('/account/signin.html');
    return;
  }

  try {
    const res = await fetch(`${window.API_BASE}/vendor/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    const vendor = data.vendor;

    if (!vendor) {
      window.location.replace('/account/vendor/create.html');
      return;
    }

    if (vendor.status !== 'approved') {
      window.location.replace('/account/vendor/dashboard.html');
      return;
    }

    document.documentElement.style.visibility = '';
  } catch {
    window.location.replace('/account/signin.html');
  }
})();
