// ======================================================
// BUYER ACCOUNT SETTINGS
// ======================================================

const API = window.API_BASE;

function authFetch(url, opts = {}) {
  const token = localStorage.getItem('s4l_token');
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...opts, headers });
}

function setMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = `acct-msg ${type}`;
}

function clearMsg(id) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = '';
    el.className = 'acct-msg';
  }
}

async function loadProfile() {
  try {
    const res = await authFetch(`${API}/account/me`);
    if (!res.ok) return;
    const data = await res.json();
    const nameEl = document.getElementById('acct-name');
    const emailEl = document.getElementById('acct-email');
    if (nameEl && data.name) nameEl.value = data.name;
    if (emailEl && data.email) emailEl.placeholder = data.email;
  } catch (_) {}
}

// Save name
document.getElementById('save-name').addEventListener('click', async () => {
  const btn = document.getElementById('save-name');
  const name = document.getElementById('acct-name').value.trim();
  if (!name) {
    setMsg('msg-name', 'Name cannot be empty.', 'error');
    return;
  }

  btn.disabled = true;
  clearMsg('msg-name');

  try {
    const res = await authFetch(`${API}/account/me`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg('msg-name', data.error || 'Save failed.', 'error');
    } else {
      setMsg('msg-name', 'Name updated.', 'success');
    }
  } catch (_) {
    setMsg('msg-name', 'Network error.', 'error');
  } finally {
    btn.disabled = false;
  }
});

// Update email
document.getElementById('save-email').addEventListener('click', async () => {
  const btn = document.getElementById('save-email');
  const email = document.getElementById('acct-email').value.trim();
  const currentPassword = document.getElementById('acct-email-pass').value;
  if (!email) {
    setMsg('msg-email', 'Enter new email.', 'error');
    return;
  }
  if (!currentPassword) {
    setMsg('msg-email', 'Current password required.', 'error');
    return;
  }

  btn.disabled = true;
  clearMsg('msg-email');

  try {
    const res = await authFetch(`${API}/account/me`, {
      method: 'PATCH',
      body: JSON.stringify({ email, currentPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg('msg-email', data.error || 'Update failed.', 'error');
    } else {
      setMsg('msg-email', 'Email updated.', 'success');
      document.getElementById('acct-email').value = '';
      document.getElementById('acct-email-pass').value = '';
    }
  } catch (_) {
    setMsg('msg-email', 'Network error.', 'error');
  } finally {
    btn.disabled = false;
  }
});

// Update password
document.getElementById('save-password').addEventListener('click', async () => {
  const btn = document.getElementById('save-password');
  const currentPassword = document.getElementById('acct-cur-pass').value;
  const newPassword = document.getElementById('acct-new-pass').value;
  if (!currentPassword) {
    setMsg('msg-password', 'Enter current password.', 'error');
    return;
  }
  if (!newPassword) {
    setMsg('msg-password', 'Enter new password.', 'error');
    return;
  }
  if (newPassword.length < 8) {
    setMsg('msg-password', 'Min 8 characters.', 'error');
    return;
  }

  btn.disabled = true;
  clearMsg('msg-password');

  try {
    const res = await authFetch(`${API}/account/me`, {
      method: 'PATCH',
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg('msg-password', data.error || 'Update failed.', 'error');
    } else {
      setMsg('msg-password', 'Password updated.', 'success');
      document.getElementById('acct-cur-pass').value = '';
      document.getElementById('acct-new-pass').value = '';
    }
  } catch (_) {
    setMsg('msg-password', 'Network error.', 'error');
  } finally {
    btn.disabled = false;
  }
});

loadProfile();
