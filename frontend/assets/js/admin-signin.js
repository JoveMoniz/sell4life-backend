const API = window.API_BASE;

// Already signed in → skip sign-in page
fetch(`${API}/auth/me`, { credentials: 'include' })
  .then((res) => {
    if (res.ok) return res.json();
  })
  .then((data) => {
    if (data?.user?.role === 'admin') {
      window.location.replace('/account/admin/index.html');
    }
  })
  .catch(() => {});

const form = document.getElementById('loginForm');
const error = document.getElementById('error');
const btn = form.querySelector('button');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  error.textContent = '';
  error.className = '';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value.trim();

  const originalText = btn.textContent;
  btn.disabled = true;
  btn.classList.remove('success');
  btn.textContent = 'Signing in...';

  try {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || data.msg || 'Login failed');
    }

    if (data.user.role !== 'admin') {
      // Clear cookie the backend just set for a non-admin user
      await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
      throw new Error('You do not have admin access.');
    }

    localStorage.setItem('s4l_token', data.token);
    localStorage.setItem('s4l_role', data.user.role);
    localStorage.setItem('s4l_user', JSON.stringify(data.user));

    btn.disabled = false;
    btn.textContent = 'Login successful';
    btn.classList.add('success');

    const redirect = localStorage.getItem('postLoginRedirect');

    setTimeout(() => {
      if (redirect) {
        localStorage.removeItem('postLoginRedirect');
        window.location.replace(redirect);
      } else {
        window.location.replace('/account/admin/index.html');
      }
    }, 600);
  } catch (err) {
    console.error('LOGIN ERROR:', err);

    btn.disabled = false;
    btn.classList.remove('success');
    btn.textContent = originalText;

    error.textContent = err.message || 'Network error. Try again.';
    error.className = 'error';
  }
});
