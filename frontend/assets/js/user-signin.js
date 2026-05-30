// =====================================================
// SIGN IN
// =====================================================

const existingToken = localStorage.getItem('s4l_token');
const existingUser  = localStorage.getItem('s4l_user');

// ── Already logged in — redirect away ────────────────
if (existingToken && existingUser) {
  const intent   = localStorage.getItem('s4l_intent');
  const redirect = localStorage.getItem('postLoginRedirect');

  if (intent === 'sell') {
    localStorage.removeItem('s4l_intent');
    (async () => {
      try {
        const res  = await fetch(`${window.API_BASE}/vendor/me`, {
          headers: { Authorization: `Bearer ${existingToken}` },
        });
        const data = await res.json();
        if (data.isVendor && data.vendor) {
          localStorage.setItem('s4l_isVendor', 'true');
          localStorage.setItem('s4l_vendorStatus', data.vendor.status);
          window.location.replace('/account/vendor/dashboard.html');
        } else {
          localStorage.setItem('s4l_isVendor', 'false');
          window.location.replace('/account/vendor/create.html');
        }
      } catch {
        localStorage.removeItem('postLoginRedirect');
        window.location.replace(redirect || '/index.html');
      }
    })();
  } else {
    localStorage.removeItem('postLoginRedirect');
    window.location.replace(redirect || '/index.html');
  }
}

// ── Form ─────────────────────────────────────────────
const form = document.getElementById('signinForm');
const msg  = document.getElementById('msg');

if (form && msg) {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email    = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();
    const btn      = form.querySelector('button[type="submit"]');

    msg.textContent  = 'Checking credentials…';
    msg.style.color  = '#e5e7eb';
    btn.disabled     = true;

    try {
      const res  = await fetch(`${window.API_BASE}/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });

      let data;
      try { data = await res.json(); }
      catch {
        msg.textContent = 'Invalid server response';
        msg.style.color = '#f87171';
        btn.disabled = false;
        return;
      }

      if (!res.ok || !data.token || !data.user) {
        msg.textContent = data.msg || data.error || 'Login failed';
        msg.style.color = '#f87171';
        btn.disabled = false;
        return;
      }

      // Store auth
      localStorage.setItem('s4l_token', data.token);
      localStorage.setItem('s4l_user', JSON.stringify(data.user));

      msg.textContent = 'Login successful…';
      msg.style.color = '#86efac';

      // Check vendor status and cache it so layout.js sidebar guard passes
      try {
        const vRes  = await fetch(`${window.API_BASE}/vendor/me`, {
          headers: { Authorization: `Bearer ${data.token}` },
        });
        const vData = await vRes.json();
        if (vData.isVendor && vData.vendor) {
          const _vid = vData.vendor._id || vData.vendor.id || '';
          localStorage.setItem('s4l_isVendor', 'true');
          localStorage.setItem('s4l_vendorStatus', vData.vendor.status);
          if (_vid) localStorage.setItem('s4l_vendorId', String(_vid));
        } else {
          localStorage.setItem('s4l_isVendor', 'false');
          localStorage.removeItem('s4l_vendorId');
        }
      } catch {
        // Non-critical — vendor pages will re-check via vendor-guard.js
      }

      // Determine redirect
      const intent   = localStorage.getItem('s4l_intent');
      const isVendor = localStorage.getItem('s4l_isVendor') === 'true';
      localStorage.removeItem('s4l_intent');

      let redirect = localStorage.getItem('postLoginRedirect');
      localStorage.removeItem('postLoginRedirect');

      if (intent === 'sell') {
        redirect = isVendor ? '/account/vendor/dashboard.html' : '/account/vendor/create.html';
      } else {
        redirect = redirect || '/index.html';
      }

      window.location.replace(redirect);

    } catch (err) {
      console.error('LOGIN ERROR:', err);
      msg.textContent = 'Server error — please try again';
      msg.style.color = '#f87171';
      btn.disabled = false;
    }
  });
}
