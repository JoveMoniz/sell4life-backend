// =====================================================
// LOGOUT (single source of truth)
// =====================================================
function logout() {
  localStorage.removeItem("s4l_token");
  localStorage.removeItem("s4l_user");
  window.location.href = "/account/signin.html";
}


// =====================================================
// 0. GLOBAL CACHE-BUSTER
// =====================================================
(function forceFreshAssets() {
  const stamp = Date.now();

  // Refresh CSS
  document.querySelectorAll('link[data-bust="true"]').forEach(link => {
    const clean = link.href.split("?")[0];
    link.href = clean + "?v=" + stamp;
  });

  // Refresh static JS (only /assets/js/)
  document.querySelectorAll('script[src]').forEach(script => {
    const src = script.getAttribute("src");
    if (src && src.startsWith("/assets/js/")) {
      const clean = src.split("?")[0];
      script.setAttribute("src", clean + "?v=" + stamp);
    }
  });
})();


// =====================================================
// 1. LOAD HEADER + FOOTER (ASYNC, NO CACHE)
// =====================================================
(async function loadLayout() {

  // HEADER
  try {
    const res = await fetch("/includes/header.html?v=" + Date.now(), {
      cache: "no-store"
    });
    const html = await res.text();
    document.body.insertAdjacentHTML("afterbegin", html);
    document.dispatchEvent(new Event("headerLoaded"));
  } catch (err) {
    console.error("Failed to load header:", err);
  }

  // FOOTER
  try {
    const res = await fetch("/includes/footer.html?v=" + Date.now(), {
      cache: "no-store"
    });
    const html = await res.text();
    document.body.insertAdjacentHTML("beforeend", html);
  } catch (err) {
    console.error("Failed to load footer:", err);
  }

})();


// =====================================================
// 2. LOAD CART.JS AFTER HEADER
// =====================================================
document.addEventListener("headerLoaded", () => {
  if (window.__cartScriptLoaded) return;

  const c = document.createElement("script");
  c.src = "/assets/js/cart.js?v=" + Date.now();
  document.body.appendChild(c);

  window.__cartScriptLoaded = true;
});


// =====================================================
// 3. LOAD SEARCH.JS AFTER HEADER
// =====================================================
document.addEventListener("headerLoaded", () => {
  if (window.__searchLoaded) return;

  const s = document.createElement("script");
  s.src = "/assets/js/search.js?v=" + Date.now();
  document.body.appendChild(s);

  window.__searchLoaded = true;
});


// =====================================================
// 4. MINI-CART (DESKTOP HOVER + MOBILE TAP)
// =====================================================
let miniCartTimeout;

document.addEventListener("headerLoaded", () => {

  // DESKTOP
  const wrapper  = document.querySelector(".s4l-header-desktop .basket-wrapper");
  const miniCart = document.querySelector(".s4l-header-desktop .mini-cart");

  if (wrapper && miniCart) {
    document.addEventListener("mouseover", e => {

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

  // MOBILE → CART PAGE (only if qty > 0)
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
// 5. ACCOUNT DROPDOWN + AUTH STATE (CLICK-BASED)
// =====================================================
document.addEventListener("headerLoaded", () => {

  const btn  = document.getElementById("accountBtn");
  const menu = document.getElementById("accountDropdown");

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

  // Auth-based visibility
  const token = localStorage.getItem("s4l_token");

  const login     = document.getElementById("dd-login");
  const register  = document.getElementById("dd-register");
  const orders    = document.getElementById("dd-orders");
  const logoutBtn = document.getElementById("dd-logout");

  if (token) {
    // Logged in
    login && (login.style.display = "none");
    register && (register.style.display = "none");

    orders && (orders.style.display = "block");
    logoutBtn && (logoutBtn.style.display = "block");

    logoutBtn && logoutBtn.addEventListener("click", logout);
  } else {
    // Logged out
    orders && (orders.style.display = "none");
    logoutBtn && (logoutBtn.style.display = "none");

    login && (login.style.display = "block");
    register && (register.style.display = "block");
  }

});
