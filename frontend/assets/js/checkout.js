// ================================
// Sell4Life Checkout – STABLE (Buy Now Restored)
// ================================


import { API_BASE } from "./config.js";

document.addEventListener("DOMContentLoaded", () => {

  // ---------- DOM ----------
  const itemsWrap  = document.getElementById("checkout-items");
  const subtotalEl = document.getElementById("checkout-subtotal");
  const shippingEl = document.getElementById("checkout-shipping");
  const totalEl    = document.getElementById("checkout-total");
  const orderBtn   = document.getElementById("place-order-btn");

  if (!itemsWrap || !subtotalEl || !shippingEl || !totalEl || !orderBtn) {
    console.error("Checkout DOM missing");
    return;
  }

  // ---------- READ CART ----------
  function readCart() {
    try {
      const data = JSON.parse(localStorage.getItem("cart") || "[]");
      return Array.isArray(data) ? data.filter(i => i && i.id) : [];
    } catch {
      return [];
    }
  }

  let cart = readCart();

  // ---------- BUY NOW FLAG ----------
  const buyNow = localStorage.getItem("buyNow") === "true";

  // ---------- RENDER ----------
  function renderItems() {
    if (!cart.length) {
      itemsWrap.innerHTML = "<p>Your cart is empty.</p>";
      subtotalEl.textContent = "£0.00";
      shippingEl.textContent = "£0.00";
      totalEl.textContent = "£0.00";
      orderBtn.disabled = true;
      return;
    }

    orderBtn.disabled = false;

    let subtotal = 0;

    itemsWrap.innerHTML = cart.map(item => {
      const qty   = Number(item.quantity || 1);
      const price = Number(item.price || 0);
      const line  = qty * price;

      subtotal += line;

      return `
        <div class="checkout-item">
          <img
            class="checkout-thumb"
            src="${item.image || "/assets/images/placeholder.png"}"
            alt="${item.name}"
            width="60"
            height="60"
          >
          <div class="checkout-details">
            <span class="checkout-title">${item.name}</span>
            <span class="checkout-qty">Quantity: ${qty}</span>
          </div>
          <span class="checkout-price">£${line.toFixed(2)}</span>
        </div>
      `;
    }).join("");

    subtotalEl.textContent = `£${subtotal.toFixed(2)}`;
    shippingEl.textContent = "£0.00";
    totalEl.textContent    = `£${subtotal.toFixed(2)}`;
  }

  renderItems();

  // ---------- PLACE ORDER ----------
  orderBtn.addEventListener("click", async () => {
    if (!cart.length) return;

    const token = localStorage.getItem("s4l_token");
    if (!token) {
      localStorage.setItem("postLoginRedirect", "/cart/checkout.html");
      window.location.href = "/account/signin.html";
      return;
    }

    const items = cart.map(item => ({
      productId: item.id,
      name: item.name,
      price: Number(item.price),
      quantity: Number(item.quantity || 1),
      image: item.image
    }));

    const total = Number(
      items.reduce((sum, i) => sum + i.price * i.quantity, 0).toFixed(2)
    );

    try {
      const res = await fetch(`${API_BASE}/api/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ items, total })
      });

      if (!res.ok) {
        const err = await res.text();
        throw new Error(err || "Order creation failed");
      }

      const order = await res.json();

      // ---------- CART CLEANUP ----------
      if (buyNow) {
        const backup = localStorage.getItem("cart_backup");

        if (backup) {
          localStorage.setItem("cart", backup);
          localStorage.removeItem("cart_backup");
        } else {
          localStorage.removeItem("cart");
        }

        localStorage.removeItem("buyNow");
      } else {
        localStorage.removeItem("cart");
      }

      window.location.href = `/thankyou/thankyou.html?id=${order.id}`;

    } catch (err) {
      console.error("PLACE ORDER ERROR:", err);
      alert("Failed to place order. Please try again.");
    }
  });

});
