const API    = window.API_BASE;
const token  = new URLSearchParams(location.search).get('token');
const form   = document.getElementById('resetForm');
const msg    = document.getElementById('msg');
const btn    = form?.querySelector('button[type="submit"]');
const card   = document.getElementById('resetCard');

// No token in URL — show error and bail
if (!token && card) {
  card.innerHTML = `
    <p style="text-align:center;line-height:1.6">
      This reset link is invalid or has expired.<br>
      <a href="/account/forgot-password.html" style="color:#9ee7e0;font-weight:600">Request a new one →</a>
    </p>`;
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const password = document.getElementById('password').value;
  const confirm  = document.getElementById('confirmPassword').value;

  msg.className   = '';
  msg.textContent = '';

  if (password.length < 8) {
    msg.textContent = 'Password must be at least 8 characters.';
    msg.className   = 'error';
    return;
  }
  if (password !== confirm) {
    msg.textContent = 'Passwords do not match.';
    msg.className   = 'error';
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Resetting…';

  try {
    const res  = await fetch(`${API}/auth/reset-password`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ token, password }),
    });
    const data = await res.json();

    if (res.ok) {
      form.style.display = 'none';
      msg.innerHTML      = `Password reset! <a href="/account/signin.html" style="color:#9ee7e0;font-weight:600">Sign in →</a>`;
      msg.className      = 'success';
    } else {
      msg.textContent = data.error || 'Reset failed. The link may have expired.';
      msg.className   = 'error';
      btn.disabled    = false;
      btn.textContent = 'Reset Password';
    }
  } catch {
    msg.textContent = 'Could not connect. Please try again.';
    msg.className   = 'error';
    btn.disabled    = false;
    btn.textContent = 'Reset Password';
  }
});
