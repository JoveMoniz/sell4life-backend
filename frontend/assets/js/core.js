// sell4life-core/cart.js
document.addEventListener("DOMContentLoaded", () => {
  console.log("✅ cart.js loaded");

  const badge = document.querySelector(".basket-qty");
  const miniCartList = document.querySelector(".mini-cart-items");
  const miniCartTotal = document.querySelector(".mini-cart-total span");
  const cartList = document.querySelector(".cart-items");
  const totalSpan = document.getElementById("cart-total");

  let cart = JSON.parse(localStorage.getItem("cart")) || [];
  console.log("🧾 Loaded cart:", cart);

  // === Badge ===
  function updateBadge() {
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    console.log("🔢 Badge updated:", count);
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count;
      badge.classList.remove("hide");
    } else {
      badge.classList.add("hide");
    }
  }

  // === Mini-cart render ===
  function renderMiniCart() {
    if (!miniCartList) {
      console.warn("⚠️ miniCartList not found");
      return;
    }

    miniCartList.innerHTML = "";

    if (cart.length === 0) {
      console.log("🧺 Mini-cart empty");
      miniCartList.innerHTML = `<li>No items in basket.</li>`;
      if (miniCartTotal) miniCartTotal.textContent = "£0.00";
      return;
    }

    let total = 0;
    cart.forEach(item => {
      total += item.price * item.quantity;
      const li = document.createElement("li");
      li.textContent = `${item.name} x${item.quantity}`;
      miniCartList.appendChild(li);
    });

    if (miniCartTotal) miniCartTotal.textContent = `£${total.toFixed(2)}`;
    console.log("🛒 Mini-cart rendered:", cart);
  }

  // === Full cart page ===
  function renderCartPage() {
    if (!cartList || !totalSpan) return;

    cartList.innerHTML = "";

    if (cart.length === 0) {
      cartList.innerHTML = `<li>No items in your basket yet.</li>`;
      totalSpan.textContent = "0.00";
      return;
    }

    let total = 0;
    cart.forEach((item, i) => {
      total += item.price * item.quantity;
      const li = document.createElement("li");
      li.innerHTML = `
        <div class="cart-item">
          <span>${item.name}</span>
          <span>x${item.quantity}</span>
          <span>£${(item.price * item.quantity).toFixed(2)}</span>
          <button class="cart-remove" data-index="${i}">✕</button>
        </div>`;
      cartList.appendChild(li);
    });

    totalSpan.textContent = total.toFixed(2);
    console.log("🧮 Cart page rendered:", cart);
  }

  // === Remove or decrement ===
  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("cart-remove")) {
      const index = e.target.dataset.index;
      console.log("❌ Removing index", index);
      if (cart[index]) {
        if (cart[index].quantity > 1) {
          cart[index].quantity--;
        } else {
          cart.splice(index, 1);
        }
        localStorage.setItem("cart", JSON.stringify(cart));
        renderCartPage();
        renderMiniCart();
        updateBadge();
      }
    }
  });

  // === Live cart updates ===
  document.addEventListener("cartUpdated", () => {
    console.log("🟢 cartUpdated event received");
    cart = JSON.parse(localStorage.getItem("cart")) || [];
    renderMiniCart();
    updateBadge();
  });

  // === Init ===
  updateBadge();
  renderMiniCart();
  renderCartPage();
  console.log("🚀 Initialization complete");
});
