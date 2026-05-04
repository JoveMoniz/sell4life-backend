// ======================================================
// ADMIN LOGOUT + CACHE GUARD (CLEAN VERSION)
// ======================================================

let loggingOut = false;

/* ======================================================
   LOGOUT HANDLER
====================================================== */
document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logoutBtn');
  if (!logoutBtn) return;

  logoutBtn.addEventListener('click', () => {
    if (loggingOut) return;
    loggingOut = true;

    // Clear ALL auth state
    localStorage.clear();

    // Hard redirect (no back button return)
    window.location.replace('/account/admin/signin.html');
  });
});

/* ======================================================
   CACHE / BACK BUTTON PROTECTION
====================================================== */

// Fires when navigating back/forward (better than visibilitychange)
window.addEventListener('pageshow', (e) => {
  // Only act if page is restored from cache (bfcache)
  if (e.persisted) {
    const token = localStorage.getItem('s4l_token');
    const role = localStorage.getItem('s4l_role');

    if (!token || role !== 'admin') {
      window.location.replace('/account/admin/signin.html');
    }
  }
});

/* ======================================================
   EXTRA SAFETY (TAB SWITCH / FOCUS)
====================================================== */

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;

  const token = localStorage.getItem('s4l_token');
  const role = localStorage.getItem('s4l_role');

  if (!token || role !== 'admin') {
    window.location.replace('/account/admin/signin.html');
  }
});
