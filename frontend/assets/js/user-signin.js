// =====================================================
// SIGN IN (intent-based, NOT role-based)
// =====================================================

import { API_BASE } from "./config.js";

console.log("signin.js loaded");

// =====================================================
// AUTO-REDIRECT IF ALREADY LOGGED IN
// =====================================================
const existingToken = localStorage.getItem("s4l_token");

if (existingToken) {
  const redirect =
    localStorage.getItem("postLoginRedirect") || "/account/orders.html";

  localStorage.removeItem("postLoginRedirect");
  window.location.href = redirect;
}

// =====================================================
// DOM READY
// =====================================================
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("signinForm");
  const msg  = document.getElementById("msg");

  if (!form || !msg) {
    console.error("Signin DOM elements missing");
    return;
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email    = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value.trim();

    msg.textContent = "Checking credentials…";
    msg.style.color = "#e5e7eb"; // neutral

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password })
      });

      const text = await res.text();

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        msg.textContent = "Invalid server response";
        msg.style.color = "red";
        return;
      }

      if (!res.ok || !data.token || !data.user) {
        msg.textContent = data.msg || "Login failed";
        msg.style.color = "red";
        return;
      }

      // =====================================================
      // STORE AUTH (TOKEN CREATED HERE ONLY)
      // =====================================================
      localStorage.setItem("s4l_token", data.token);
      localStorage.setItem("s4l_user", JSON.stringify(data.user));

      msg.textContent = "Login successful";
      msg.style.color = "lightgreen";

      // =====================================================
      // REDIRECT LOGIC (INTENT ONLY)
      // =====================================================
      let redirect = localStorage.getItem("postLoginRedirect");

      localStorage.removeItem("postLoginRedirect");

      // PUBLIC SIGN-IN ALWAYS GOES TO USER AREA
      if (!redirect) {
        redirect = "/account/orders.html";
      }

      setTimeout(() => {
        window.location.href = redirect;
      }, 300);

    } catch (err) {
      console.error("LOGIN ERROR:", err);
      msg.textContent = "Server error";
      msg.style.color = "red";
    }
  });
});
