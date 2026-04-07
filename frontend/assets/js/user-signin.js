// =====================================================
// SIGN IN (intent-based, upgraded with vendor check)
// =====================================================

console.log('user-signin.js loaded');

// =====================================================
// AUTO-REDIRECT IF ALREADY LOGGED IN (INTENT AWARE)
// =====================================================

const existingToken = localStorage.getItem('s4l_token');
const existingUser = localStorage.getItem('s4l_user');

if (existingToken && existingUser) {
  const intent = localStorage.getItem('s4l_intent');

  // 🔥 ONLY go vendor flow if user intended it
  if (intent === 'sell') {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/vendor/me`, {
          headers: {
            Authorization: `Bearer ${existingToken}`,
          },
        });

        const data = await res.json();

        localStorage.removeItem('s4l_intent');

        if (data.isVendor) {
          window.location.href = '/account/vendor/dashboard.html';
        } else {
          window.location.href = '/account/vendor/create.html';
        }
      } catch {
        const redirect = localStorage.getItem('postLoginRedirect');
        localStorage.removeItem('postLoginRedirect');

        window.location.href = redirect || '/index.html';
      }
    })();
  } else {
    // 🧠 USE SAVED REDIRECT OR DEFAULT
    const redirect = localStorage.getItem('postLoginRedirect');

    localStorage.removeItem('postLoginRedirect');

    window.location.href = redirect || '/index.html';
  }
}

// =====================================================
// INITIALISE FORM
// =====================================================

const form = document.getElementById('signinForm');
const msg = document.getElementById('msg');

if (!form || !msg) {
  console.error('Signin DOM elements missing');
} else {
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value.trim();

    msg.textContent = 'Checking credentials…';
    msg.style.color = '#e5e7eb';

    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const text = await res.text();

      let data;
      try {
        data = JSON.parse(text);
        console.log('STATUS:', res.status);
        console.log('RESPONSE:', data);
      } catch {
        msg.textContent = 'Invalid server response';
        msg.style.color = 'red';
        return;
      }

      if (!res.ok || !data.token || !data.user) {
        msg.textContent = data.msg || 'Login failed';
        msg.style.color = 'red';
        return;
      }

      // STORE AUTH
      localStorage.setItem('s4l_token', data.token);
      localStorage.setItem('s4l_user', JSON.stringify(data.user));

      msg.textContent = 'Login successful';
      msg.style.color = 'lightgreen';

      // =====================================================
      // POST-LOGIN REDIRECT WITH VENDOR CHECK
      // =====================================================

      const intent = localStorage.getItem('s4l_intent');
      localStorage.removeItem('s4l_intent');

      let redirect = localStorage.getItem('postLoginRedirect');

      if (intent === 'sell') {
        try {
          const vendorRes = await fetch(`${API_BASE}/vendor/me`, {
            headers: {
              Authorization: `Bearer ${data.token}`,
            },
          });

          const vendorData = await vendorRes.json();

          if (vendorData.isVendor) {
            redirect = '/account/vendor/dashboard.html';
          } else {
            redirect = '/account/vendor/create.html';
          }
        } catch {
          redirect = '/index.html';
        }
      } else {
        // 🧠 USE SAVED REDIRECT OR DEFAULT
        redirect = redirect || '/index.html';
      }
      localStorage.removeItem('postLoginRedirect');

      window.location.replace(redirect);
    } catch (err) {
      console.error('LOGIN ERROR:', err);
      msg.textContent = 'Server error';
      msg.style.color = 'red';
    }
  });
}
