


// thankyou.js – FINAL CLEANUP


// ================================
// THANK YOU – KILL BACK-FORWARD CACHE
// ================================

(function () {
  const isCheckoutDone = localStorage.getItem("checkout_completed") === "true";

  // Fires when page is restored from cache (BACK button)
  window.addEventListener("pageshow", function (event) {
    if (event.persisted && isCheckoutDone) {
      window.location.replace("/index.html");
    }
  });

  // Mark checkout as completed
  localStorage.setItem("checkout_completed", "true");
})();



import { API_BASE } from "./config.js";

document.addEventListener("DOMContentLoaded", async () => {
  const params  = new URLSearchParams(window.location.search);
  const orderId = params.get("id");

  const idEl    = document.getElementById("order-id");
  const dateEl  = document.getElementById("order-date");
  const itemsEl = document.getElementById("order-items");
  const totalEl = document.getElementById("order-total");

  if (!orderId) {
    idEl.textContent = "—";
    dateEl.textContent = "-";
    itemsEl.innerHTML = "<p>Order not found.</p>";
    totalEl.textContent = "—";
    return;
  }

  try {
    const token = localStorage.getItem("s4l_token");

    const res = await fetch(`${API_BASE}/api/orders/${orderId}`, {
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!res.ok) throw new Error("Order not found");

    const order = await res.json();

    // 🔹 SAME rule everywhere
    const displayId = `S4L-${order.id.slice(0, 10).toUpperCase()}`;

    idEl.textContent   = displayId;
    dateEl.textContent = new Date(order.createdAt).toLocaleString();

    // 🔹 Render items
    let itemsHTML = "";
    let computedTotal = 0;

    order.items.forEach(item => {
      const qty   = Number(item.quantity || 1);
      const price = Number(item.price || 0);
      const line  = qty * price;

      computedTotal += line;

      itemsHTML += `
        <div class="ty-item">
          <span class="ty-item-name">${item.name}</span>
          <span class="ty-item-qty">${qty} × £${price.toFixed(2)}</span>
          <span class="ty-item-line">£${line.toFixed(2)}</span>
        </div>
      `;
    });

 itemsEl.innerHTML = order.items
  .map(item => {
    const qty = Number(item.quantity || item.qty || 1);
    const price = Number(item.price || 0);
    const lineTotal = qty * price;

    return `
      <div class="ty-item">
        <div class="ty-item-left">
          <span>${item.name}</span>
          <span class="ty-item-qty">×${qty}</span>
        </div>
        <span class="ty-item-subtotal">£${lineTotal.toFixed(2)}</span>
      </div>
    `;
  })
      .join("");

    // Final total only
    totalEl.textContent = `£${order.total.toFixed(2)}`;

  } catch (err) {
    console.error("Thank-you fetch failed:", err);

    itemsEl.innerHTML =
      "<p>Server is waking up. Please wait a moment and refresh.</p>";
  }
});