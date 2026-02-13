// =====================================================
// layout.js — SINGLE, DEFENSIVE SOURCE OF TRUTH
// Header / Footer / Auth / Cart / Search
// Cache-safe, idempotent, boring (the good kind)
// =====================================================


// =====================================================
// LOGOUT (single source of truth)
// =====================================================
function logout() {
  localStorage.removeItem("s4l_token");
  localStorage.removeItem("s4l_user");

  if (location.pathname !== "/account/signin.html") {
    window.location.href = "/account/signin.html";
  }
}


// =====================================================
// LOAD HEADER + FOOTER (NO CACHE, DEFENSIVE)
// =====================================================
(async function loadLayout() {

  // ----- HEADER -----
  try {
    // Prevent duplicate header injection
    if (!document.querySelector(".site-header")) {
      const res = await fetch("/includes/header.html", {
        cache: "no-store"
      });

      if (!res.ok) throw new Error("Header fetch failed");

      const html = await res.text();
      document.body.insertAdjacentHTML("afterbegin", html);
    }

    document.dispatchEvent(new Event("headerLoaded"));
  } catch (err) {
    console.warn("layout.js: header skipped", err);
  }

  // ----- FOOTER -----
  try {
    if (!document.querySelector(".site-footer")) {
      const res = await fetch("/includes/footer.html", {
        cache: "no-store"
      });

      if (!res.ok) throw new Error("Footer fetch failed");

      const html = await res.text();
      document.body.insertAdjacentHTML("beforeend", html);
    }
  } catch (err) {
    console.warn("layout.js: footer skipped", err);
  }

})();


// =====================================================
// GLOBAL VERSIONED SCRIPT LOADER
// =====================================================
document.addEventListener("headerLoaded", async () => {

  if (window.__layoutInitialized) return;

  let version;

  try {
   const res = await fetch(`${API_BASE}/api/version`);

    const data = await res.json();
    version = data.version;
  } catch {
    version = Date.now();
  }

  // Core shared scripts
  const coreScripts = [
    "/assets/js/cart.js",
    "/assets/js/search.js"
  ];

  coreScripts.forEach(path => {
    const script = document.createElement("script");
    script.src = `${path}?v=${version}`;
    script.defer = true;
    document.body.appendChild(script);
  });

  // Page-specific scripts (declared per page)
  if (window.__pageScripts && Array.isArray(window.__pageScripts)) {
    window.__pageScripts.forEach(path => {
      const script = document.createElement("script");
      script.src = `${path}?v=${version}`;
      script.defer = true;
      document.body.appendChild(script);
    });
  }

  window.__layoutInitialized = true;
});


// =====================================================
// MINI CART (DESKTOP HOVER + MOBILE TAP)
// =====================================================
let miniCartTimeout;

document.addEventListener("headerLoaded", () => {

  // ----- DESKTOP -----
  const wrapper  = document.querySelector(".s4l-header-desktop .basket-wrapper");
  const miniCart = document.querySelector(".s4l-header-desktop .mini-cart");

  if (wrapper && miniCart) {
    document.addEventListener("mouseover", (e) => {

      if (!wrapper.classList.contains("has-items")) {
        miniCart.style.display = "none";
        miniCart.style.opacity = "0";
        miniCart.style.visibility = "hidden";
        return;
      }

      if (wrapper.contains(e.target) || miniCart.contains(e.target)) {
        clearTimeout(miniCartTimeout);
        miniCart.style.display = "block";
        miniCart.style.opacity = "1";
        miniCart.style.visibility = "visible";
        return;
      }

      miniCartTimeout = setTimeout(() => {
        miniCart.style.opacity = "0";
        miniCart.style.visibility = "hidden";
        miniCart.style.display = "none";
      }, 200);
    });
  }

  // ----- MOBILE -----
  const mobileBasket =
    document.querySelector(".s4l-header-mobile .mobile-basket");

  if (mobileBasket) {
    mobileBasket.addEventListener("click", () => {
      const qtyEl = mobileBasket.querySelector(".basket-qty");
      const qty = parseInt(qtyEl?.textContent || "0", 10);

      if (qty > 0) {
        window.location.href = "/cart/cart.html";
      }
    });
  }

});


// =====================================================
// ACCOUNT DROPDOWN + AUTH STATE (DESKTOP + MOBILE)
// =====================================================
document.addEventListener("headerLoaded", () => {

  function setupAccount(btnId, menuId) {
    const btn  = document.getElementById(btnId);
    const menu = document.getElementById(menuId);

    if (!btn || !menu) return;

    // Toggle dropdown
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.style.display =
        menu.style.display === "block" ? "none" : "block";
    });

    // Close when clicking outside
    document.addEventListener("click", (e) => {
      if (!e.target.closest(".account-menu")) {
        menu.style.display = "none";
      }
    });

    // Auth state
    const token = localStorage.getItem("s4l_token");

    const login     = menu.querySelector(".dd-login");
    const register  = menu.querySelector(".dd-register");
    const orders    = menu.querySelector(".dd-orders");
    const logoutBtn = menu.querySelector(".dd-logout");

    if (token) {
      login && (login.style.display = "none");
      register && (register.style.display = "none");

      orders && (orders.style.display = "block");
      logoutBtn && (logoutBtn.style.display = "block");

      logoutBtn && logoutBtn.addEventListener("click", logout);
    } else {
      orders && (orders.style.display = "none");
      logoutBtn && (logoutBtn.style.display = "none");

      login && (login.style.display = "block");
      register && (register.style.display = "block");
    }
  }

  // Desktop
  setupAccount("accountBtnDesktop", "accountDropdownDesktop");

  // Mobile
  setupAccount("accountBtnMobile", "accountDropdownMobile");

});
