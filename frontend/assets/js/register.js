// =====================================================
// REGISTER (auto-login + intent redirect) – FIXED
// =====================================================

import { API_BASE } from "./config.js";

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("registerForm");
  const msg  = document.getElementById("msg");

  if (!form || !msg) {
    console.error("Register DOM elements missing");
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const name     = document.getElementById("name")?.value.trim();
    const email    = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    msg.textContent = "Creating account...";
    msg.style.color = "white";

    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password })
      });

      const data = await res.json();
      console.log("REGISTER RESPONSE:", data);

      // ❌ Fail if no token
      if (!res.ok || !data.token) {
        msg.textContent =
          data.error ||
          data.msg ||
          "Registration failed";
        msg.style.color = "red";
        return;
      }

      // ✅ AUTO-LOGIN
      localStorage.setItem("s4l_token", data.token);
      localStorage.setItem("s4l_user", JSON.stringify(data.user));

      msg.textContent = "Account created. Logging you in...";
      msg.style.color = "lightgreen";

      // ✅ Redirect back to origin
      const redirect =
        localStorage.getItem("postLoginRedirect") || "/";

      localStorage.removeItem("postLoginRedirect");

      setTimeout(() => {
        window.location.href = redirect;
      }, 300);

    } catch (err) {
      console.error("REGISTER ERROR:", err);
      msg.textContent = "Server error";
      msg.style.color = "red";
    }
  });
});
