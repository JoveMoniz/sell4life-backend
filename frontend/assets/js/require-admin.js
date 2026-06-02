// ======================================================
// SELL4LIFE ADMIN GUARD — v20260521b
// Hides page until /auth/me confirms admin role,
// then shows it — or redirects to admin sign-in.
// ======================================================

(() => {
  document.documentElement.style.visibility = 'hidden';

  const token = localStorage.getItem('s4l_token');
  const headers = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;

  fetch(`${window.API_BASE}/auth/me`, { credentials: 'include', headers })
    .then((res) => {
      if (!res.ok) throw new Error();
      return res.json();
    })
    .then((data) => {
      if (data.user?.role !== 'admin') throw new Error();
      document.documentElement.style.visibility = '';
    })
    .catch(() => {
      window.location.replace('/account/admin/signin.html');
    });
})();

/* ── Styled dialogs ── */
(function () {
  function _dlg(html, setup) {
    return new Promise(resolve => {
      const ov = document.createElement('div');
      ov.className = 's4l-dialog-overlay';
      ov.innerHTML = `<div class="s4l-dialog">${html}</div>`;
      document.body.appendChild(ov);
      ov.addEventListener('click', e => { if (e.target === ov) { ov.remove(); resolve(null); } });
      setup(ov, resolve);
    });
  }
  window.showAlert = msg => _dlg(
    `<p class="s4l-dialog-msg">${msg}</p><div class="s4l-dialog-actions"><button class="s4l-dialog-primary">OK</button></div>`,
    (el, res) => el.querySelector('.s4l-dialog-primary').onclick = () => { el.remove(); res(); }
  );
  window.showConfirm = msg => _dlg(
    `<p class="s4l-dialog-msg">${msg}</p><div class="s4l-dialog-actions"><button class="s4l-dialog-secondary s4l-no">Cancel</button><button class="s4l-dialog-primary s4l-yes">Confirm</button></div>`,
    (el, res) => {
      el.querySelector('.s4l-yes').onclick = () => { el.remove(); res(true); };
      el.querySelector('.s4l-no').onclick  = () => { el.remove(); res(false); };
    }
  );
  window.showPrompt = (msg, placeholder = '') => _dlg(
    `<p class="s4l-dialog-msg">${msg}</p><input class="s4l-dialog-input" type="text" placeholder="${placeholder}"/><div class="s4l-dialog-actions"><button class="s4l-dialog-secondary s4l-no">Cancel</button><button class="s4l-dialog-primary s4l-yes">OK</button></div>`,
    (el, res) => {
      const inp = el.querySelector('input');
      inp.focus();
      el.querySelector('.s4l-yes').onclick = () => { el.remove(); res(inp.value); };
      el.querySelector('.s4l-no').onclick  = () => { el.remove(); res(null); };
      inp.onkeydown = e => { if (e.key === 'Enter') { el.remove(); res(inp.value); } if (e.key === 'Escape') { el.remove(); res(null); } };
    }
  );
})();
