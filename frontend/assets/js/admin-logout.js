document.addEventListener("DOMContentLoaded", () => {
  const logoutBtn = document.getElementById("logoutBtn");
  if (!logoutBtn) return;

  logoutBtn.addEventListener("click", () => {
    // Clear auth state
    localStorage.removeItem("s4l_token");
    localStorage.removeItem("s4l_role");
    localStorage.removeItem("s4l_user");

    // IMPORTANT: replace, not href (prevents back-button return)
    window.location.replace("/account/admin/signin.html");
  });
});

/* =====================================================
   AUTH GUARD ON BACK / CACHE RESTORE
   ===================================================== */

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;

  const token = localStorage.getItem("s4l_token");
  const role  = localStorage.getItem("s4l_role");

  if (!token || role !== "admin") {
    // Kill cached admin pages when coming back
    window.location.replace("/account/admin/signin.html");
  }
});
