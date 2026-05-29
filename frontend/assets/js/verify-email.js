const API  = window.API_BASE;
const msg  = document.getElementById('msg');
const card = document.getElementById('verifyCard');

const token = new URLSearchParams(location.search).get('token');

if (!token) {
  msg.className   = 'error';
  msg.textContent = 'No verification token found. Check your email for the verification link.';
} else {
  msg.textContent = 'Verifying your email…';

  fetch(`${API}/auth/verify-email?token=${encodeURIComponent(token)}`)
    .then(r => r.json())
    .then(data => {
      if (data.ok) {
        msg.className = 'success';
        card.innerHTML = `
          <p class="success" style="text-align:center;margin-bottom:16px">
            Your email has been verified successfully!
          </p>
          <p style="text-align:center">
            <a href="/account/signin.html" style="color:#0b6b6a;font-weight:600">Sign in to your account →</a>
          </p>`;
      } else {
        msg.className   = 'error';
        msg.textContent = data.msg || 'This link is invalid or has expired.';
        card.insertAdjacentHTML('beforeend', `
          <p style="text-align:center;margin-top:12px">
            <a href="/account/signin.html" style="color:#0b6b6a;font-size:13px">Sign in to request a new link</a>
          </p>`);
      }
    })
    .catch(() => {
      msg.className   = 'error';
      msg.textContent = 'Could not connect. Please try again.';
    });
}
