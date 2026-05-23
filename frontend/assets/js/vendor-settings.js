// ======================================================
// VENDOR STORE SETTINGS
// ======================================================

const API = window.API_BASE;

function authFetch(url, opts = {}) {
  const token = localStorage.getItem('s4l_token');
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return fetch(url, { ...opts, credentials: 'include', headers });
}

/* ======================================================
   LOAD CURRENT SETTINGS
====================================================== */
async function loadSettings() {
  const wrap = document.getElementById('settings-form-wrap');

  try {
    const res = await authFetch(`${API}/vendor/me`);
    if (res.status === 401) { window.location.href = '/account/signin.html'; return; }
    const data = await res.json();
    const v = data.vendor;
    if (!v) { window.location.href = '/account/vendor/create.html'; return; }

    renderForm(v);
  } catch (err) {
    console.error('Settings load error:', err);
    if (wrap) wrap.innerHTML = '<p style="color:#b91c1c">Failed to load settings.</p>';
  }
}

/* ======================================================
   RENDER FORM
====================================================== */
function renderForm(v) {
  const wrap = document.getElementById('settings-form-wrap');
  if (!wrap) return;

  wrap.innerHTML = `
    <!-- Store Identity -->
    <div class="settings-section">
      <div class="settings-section-title">Store Identity</div>

      <div class="settings-field">
        <label class="settings-label" for="set-name">Store Name</label>
        <input class="settings-input" id="set-name" type="text" value="${esc(v.storeName)}" maxlength="80" />
      </div>

      <div class="settings-field">
        <label class="settings-label" for="set-slug">Store URL</label>
        <div class="settings-slug-wrap">
          <span class="settings-slug-prefix">sell4life.com/store/</span>
          <input class="settings-input" id="set-slug" type="text" value="${esc(v.storeSlug)}" maxlength="60"
            pattern="[a-z0-9-]+" placeholder="your-store" />
        </div>
        <div class="settings-hint">Lowercase letters, numbers and hyphens only. Changing this will break existing links to your store.</div>
      </div>

      <div class="settings-field">
        <label class="settings-label" for="set-desc">Store Description</label>
        <textarea class="settings-textarea" id="set-desc" maxlength="500" placeholder="Tell buyers about your store…">${esc(v.storeDescription || '')}</textarea>
        <div class="settings-hint">Up to 500 characters. Shown on your public store page.</div>
      </div>

      <div class="settings-field">
        <label class="settings-label">Store Type</label>
        <div class="settings-type-row">
          <label class="settings-type-opt ${v.type !== 'professional' ? 'selected' : ''}" id="type-casual">
            <input type="radio" name="storeType" value="casual" ${v.type !== 'professional' ? 'checked' : ''} />
            <strong>Casual</strong>
            <span>Individual seller, occasional sales</span>
          </label>
          <label class="settings-type-opt ${v.type === 'professional' ? 'selected' : ''}" id="type-professional">
            <input type="radio" name="storeType" value="professional" ${v.type === 'professional' ? 'checked' : ''} />
            <strong>Professional</strong>
            <span>Business or high-volume seller</span>
          </label>
        </div>
      </div>
    </div>

    <!-- Branding -->
    <div class="settings-section">
      <div class="settings-section-title">Branding</div>

      <div class="settings-field">
        <label class="settings-label" for="set-logo">Logo URL</label>
        <input class="settings-input" id="set-logo" type="url" value="${esc(v.storeLogo || '')}"
          placeholder="https://…" />
        <img class="settings-image-preview" id="logo-preview" src="${esc(v.storeLogo || '')}" alt="Logo preview" />
        <div class="settings-hint">Direct image URL (JPG, PNG, WebP). Shown as your store avatar.</div>
      </div>

      <div class="settings-field">
        <label class="settings-label" for="set-banner">Banner URL</label>
        <input class="settings-input" id="set-banner" type="url" value="${esc(v.storeBanner || '')}"
          placeholder="https://…" />
        <img class="settings-image-preview" id="banner-preview" src="${esc(v.storeBanner || '')}" alt="Banner preview" />
        <div class="settings-hint">Wide image shown at the top of your store page. Recommended 1200×300px.</div>
      </div>
    </div>

    <!-- Save Store Settings -->
    <div class="settings-save-bar">
      <button class="settings-save-btn" id="settings-save">Save Changes</button>
      <span class="settings-msg" id="settings-msg"></span>
    </div>

    <!-- Account Details -->
    <div class="settings-section" style="margin-top:8px">
      <div class="settings-section-title">Account Details</div>

      <div class="settings-field">
        <label class="settings-label" for="vs-name">Full Name</label>
        <input class="settings-input" id="vs-name" type="text" autocomplete="name" />
      </div>
      <div class="settings-save-bar" style="margin-bottom:18px">
        <button class="settings-save-btn" id="vs-save-name">Save Name</button>
        <span class="settings-msg" id="vs-msg-name"></span>
      </div>

      <div class="settings-field">
        <label class="settings-label" for="vs-email">New Email</label>
        <input class="settings-input" id="vs-email" type="email" autocomplete="email" />
      </div>
      <div class="settings-field">
        <label class="settings-label" for="vs-email-pass">Current Password</label>
        <input class="settings-input" id="vs-email-pass" type="password" autocomplete="current-password" />
      </div>
      <div class="settings-save-bar" style="margin-bottom:18px">
        <button class="settings-save-btn" id="vs-save-email">Update Email</button>
        <span class="settings-msg" id="vs-msg-email"></span>
      </div>

      <div class="settings-field">
        <label class="settings-label" for="vs-cur-pass">Current Password</label>
        <input class="settings-input" id="vs-cur-pass" type="password" autocomplete="current-password" />
      </div>
      <div class="settings-field">
        <label class="settings-label" for="vs-new-pass">New Password</label>
        <input class="settings-input" id="vs-new-pass" type="password" autocomplete="new-password" />
      </div>
      <div class="settings-save-bar">
        <button class="settings-save-btn" id="vs-save-pass">Update Password</button>
        <span class="settings-msg" id="vs-msg-pass"></span>
      </div>
    </div>
  `;

  // Show image previews if URLs are set
  showPreview('set-logo', 'logo-preview');
  showPreview('set-banner', 'banner-preview');

  // Live preview on input
  document.getElementById('set-logo').addEventListener('input', () => showPreview('set-logo', 'logo-preview'));
  document.getElementById('set-banner').addEventListener('input', () => showPreview('set-banner', 'banner-preview'));

  // Slug: auto-clean on input
  const slugInput = document.getElementById('set-slug');
  slugInput.addEventListener('input', () => {
    const pos = slugInput.selectionStart;
    const cleaned = slugInput.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');
    if (cleaned !== slugInput.value) {
      slugInput.value = cleaned;
      try { slugInput.setSelectionRange(pos, pos); } catch (_) {}
    }
  });

  // Type radio visual
  document.querySelectorAll('input[name="storeType"]').forEach(radio => {
    radio.addEventListener('change', () => {
      document.querySelectorAll('.settings-type-opt').forEach(el => el.classList.remove('selected'));
      radio.closest('.settings-type-opt').classList.add('selected');
    });
  });

  // Save store settings
  document.getElementById('settings-save').addEventListener('click', () => saveSettings(v._id));

  // Account section
  attachAccountHandlers();
  loadAccountProfile();
}

/* ======================================================
   SAVE
====================================================== */
async function saveSettings() {
  const btn = document.getElementById('settings-save');
  const msg = document.getElementById('settings-msg');

  const body = {
    storeName:        document.getElementById('set-name')?.value?.trim(),
    storeSlug:        document.getElementById('set-slug')?.value?.trim(),
    storeDescription: document.getElementById('set-desc')?.value?.trim(),
    storeLogo:        document.getElementById('set-logo')?.value?.trim(),
    storeBanner:      document.getElementById('set-banner')?.value?.trim(),
    type:             document.querySelector('input[name="storeType"]:checked')?.value,
  };

  if (!body.storeName) {
    showMsg('Store name cannot be empty.', 'error'); return;
  }
  if (!body.storeSlug) {
    showMsg('Store URL cannot be empty.', 'error'); return;
  }

  btn.disabled = true;
  btn.textContent = 'Saving…';
  clearMsg();

  try {
    const res = await authFetch(`${API}/vendor/settings`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    const data = await res.json();

    if (!res.ok) {
      showMsg(data.error || 'Save failed.', 'error');
    } else {
      showMsg('Changes saved.', 'success');
      // Update sidebar store name if layout.js exposes it
      const nameEl = document.getElementById('sidebar-store-name');
      const slugEl = document.getElementById('sidebar-store-slug');
      if (nameEl) nameEl.textContent = data.vendor.storeName;
      if (slugEl) slugEl.textContent = '@' + data.vendor.storeSlug;
    }
  } catch (err) {
    showMsg('Network error.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }
}

/* ======================================================
   HELPERS
====================================================== */
function showPreview(inputId, previewId) {
  const url  = document.getElementById(inputId)?.value?.trim();
  const img  = document.getElementById(previewId);
  if (!img) return;
  if (url) {
    img.src = url;
    img.style.display = 'block';
    img.onerror = () => { img.style.display = 'none'; };
  } else {
    img.style.display = 'none';
  }
}

function showMsg(text, type) {
  const el = document.getElementById('settings-msg');
  if (!el) return;
  el.textContent = text;
  el.className = `settings-msg ${type}`;
}

function clearMsg() {
  const el = document.getElementById('settings-msg');
  if (el) { el.textContent = ''; el.className = 'settings-msg'; }
}

function esc(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* ======================================================
   ACCOUNT DETAILS (name / email / password)
====================================================== */
async function loadAccountProfile() {
  try {
    const res = await authFetch(`${API}/account/me`);
    if (!res.ok) return;
    const data = await res.json();
    const nameEl = document.getElementById('vs-name');
    const emailEl = document.getElementById('vs-email');
    if (nameEl && data.name) nameEl.value = data.name;
    if (emailEl && data.email) emailEl.placeholder = data.email;
  } catch (_) {}
}

function setAcctMsg(id, text, type) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = text;
  el.className = `settings-msg ${type}`;
}

function attachAccountHandlers() {
  document.getElementById('vs-save-name').addEventListener('click', async () => {
    const btn = document.getElementById('vs-save-name');
    const name = document.getElementById('vs-name')?.value.trim();
    if (!name) { setAcctMsg('vs-msg-name', 'Name cannot be empty.', 'error'); return; }
    btn.disabled = true;
    setAcctMsg('vs-msg-name', '', '');
    try {
      const res = await authFetch(`${API}/account/me`, { method: 'PATCH', body: JSON.stringify({ name }) });
      const data = await res.json();
      setAcctMsg('vs-msg-name', res.ok ? 'Name updated.' : (data.error || 'Save failed.'), res.ok ? 'success' : 'error');
    } catch (_) { setAcctMsg('vs-msg-name', 'Network error.', 'error'); }
    finally { btn.disabled = false; }
  });

  document.getElementById('vs-save-email').addEventListener('click', async () => {
    const btn = document.getElementById('vs-save-email');
    const email = document.getElementById('vs-email')?.value.trim();
    const currentPassword = document.getElementById('vs-email-pass')?.value;
    if (!email) { setAcctMsg('vs-msg-email', 'Enter new email.', 'error'); return; }
    if (!currentPassword) { setAcctMsg('vs-msg-email', 'Current password required.', 'error'); return; }
    btn.disabled = true;
    setAcctMsg('vs-msg-email', '', '');
    try {
      const res = await authFetch(`${API}/account/me`, { method: 'PATCH', body: JSON.stringify({ email, currentPassword }) });
      const data = await res.json();
      setAcctMsg('vs-msg-email', res.ok ? 'Email updated.' : (data.error || 'Update failed.'), res.ok ? 'success' : 'error');
      if (res.ok) { document.getElementById('vs-email').value = ''; document.getElementById('vs-email-pass').value = ''; }
    } catch (_) { setAcctMsg('vs-msg-email', 'Network error.', 'error'); }
    finally { btn.disabled = false; }
  });

  document.getElementById('vs-save-pass').addEventListener('click', async () => {
    const btn = document.getElementById('vs-save-pass');
    const currentPassword = document.getElementById('vs-cur-pass')?.value;
    const newPassword = document.getElementById('vs-new-pass')?.value;
    if (!currentPassword) { setAcctMsg('vs-msg-pass', 'Enter current password.', 'error'); return; }
    if (!newPassword || newPassword.length < 8) { setAcctMsg('vs-msg-pass', 'New password: min 8 characters.', 'error'); return; }
    btn.disabled = true;
    setAcctMsg('vs-msg-pass', '', '');
    try {
      const res = await authFetch(`${API}/account/me`, { method: 'PATCH', body: JSON.stringify({ currentPassword, newPassword }) });
      const data = await res.json();
      setAcctMsg('vs-msg-pass', res.ok ? 'Password updated.' : (data.error || 'Update failed.'), res.ok ? 'success' : 'error');
      if (res.ok) { document.getElementById('vs-cur-pass').value = ''; document.getElementById('vs-new-pass').value = ''; }
    } catch (_) { setAcctMsg('vs-msg-pass', 'Network error.', 'error'); }
    finally { btn.disabled = false; }
  });
}

/* ======================================================
   INIT
====================================================== */
loadSettings();
