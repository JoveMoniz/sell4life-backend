const API  = window.API_BASE;
const form = document.getElementById('forgotForm');
const msg  = document.getElementById('msg');
const btn  = form?.querySelector('button[type="submit"]');

form?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  if (!email) return;

  btn.disabled    = true;
  btn.textContent = 'Sending…';
  msg.textContent = '';
  msg.className   = '';

  try {
    const res  = await fetch(`${API}/auth/forgot-password`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ email }),
    });
    const data = await res.json();

    if (res.ok) {
      form.style.display = 'none';
      const hint = document.querySelector('.auth-hint');
      if (hint) hint.style.display = 'none';
      msg.textContent    = 'Check your inbox — if an account exists for that email, a reset link is on its way.';
      msg.className      = 'success';
    } else {
      msg.textContent    = data.error || 'Something went wrong. Please try again.';
      msg.className      = 'error';
      btn.disabled       = false;
      btn.textContent    = 'Send reset link';
    }
  } catch {
    msg.textContent = 'Could not connect. Please try again.';
    msg.className   = 'error';
    btn.disabled    = false;
    btn.textContent = 'Send reset link';
  }
});
