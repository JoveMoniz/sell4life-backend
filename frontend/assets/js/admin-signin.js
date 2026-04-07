import { API_BASE } from './config.js';

const form = document.getElementById('loginForm');
const error = document.getElementById('error');
const btn = form.querySelector('button');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Reset message state
  error.textContent = '';
  error.className = '';

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  // Button loading state
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.classList.remove('success');
  btn.textContent = 'Checking credentials…';

  try {
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.msg || 'Login failed');
    }

    // 🚫 Admin-only gate
    if (data.user.role !== 'admin') {
      throw new Error('You do not have admin access.');
    }

    // 🔐 Persist auth state (ADMIN ONLY)
    localStorage.setItem('s4l_token', data.token);
    localStorage.setItem('s4l_role', data.user.role);
    localStorage.setItem('s4l_user', JSON.stringify(data.user));

    // ✅ Success feedback INSIDE BUTTON
    btn.textContent = 'Login successful';
    btn.classList.add('success');

    // 🚦 Leave promptly
    setTimeout(() => {
      window.location.replace('/account/admin/index.html');
    }, 600);
  } catch (err) {
    console.error('LOGIN ERROR:', err);

    // Restore button
    btn.disabled = false;
    btn.classList.remove('success');
    btn.textContent = originalText;

    error.textContent = err.message || 'Server error. Try again.';
    error.className = 'error';
  }
});
