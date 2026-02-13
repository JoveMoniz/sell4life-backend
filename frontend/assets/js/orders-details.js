// =====================================================
// Order Details (API_BASE + readable order ID)
// =====================================================

import { API_BASE } from "./config.js";

document.addEventListener("DOMContentLoaded", async () => {
  const params  = new URLSearchParams(window.location.search);
  const orderId = params.get("id");

  const container = document.getElementById("order-details");
  const loading   = document.getElementById("order-loading");

  if (!orderId) {
    loading.textContent = "Invalid order.";
    return;
  }

  const token = localStorage.getItem("s4l_token");
  if (!token) {
    window.location.href = "/account/signin.html";
    return;
  }

  try {
    const res = await fetch(`${API_BASE}/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    if (!res.ok) throw new Error("Order not found");

    const order = await res.json();
    loading.style.display = "none";

    // 🔹 Readable order ID
    const displayId =
      order.orderNumber || `S4L-${order.id.slice(0, 10).toUpperCase()}`;

    // 🔒 DEFENSIVE: items must always be an array
    const items = Array.isArray(order.items) ? order.items : [];

    const itemsHTML = items.map(item => {
      const qty   = Number(item.quantity ?? 1);
      const price = Number(item.price ?? 0);
      const line  = qty * price;

      const img =
        item.image && typeof item.image === "string"
          ? item.image
          : "/assets/images/products/default.png";

      return `
        <div class="order-item">
          <img
            class="order-thumb"
            src="${img}"
            alt="${item.name || "Product"}"
            onerror="this.src='/assets/images/products/default.png'"
          >
          <div class="order-info">
            <div class="order-name">${item.name || "Unnamed product"}</div>
            <div class="order-qty">${qty} × £${price.toFixed(2)}</div>
          </div>
          <div class="order-line-price">
            £${line.toFixed(2)}
          </div>
        </div>
      `;
    }).join("");

    container.innerHTML = `
      <h2 class="order-id">${displayId}</h2>
      <p>Status: ${order.status || "—"}</p>
      <p>Date: ${order.createdAt ? new Date(order.createdAt).toLocaleString() : "—"}</p>

      <div class="order-items">
        ${itemsHTML || "<p>No items found.</p>"}
      </div>

      <div class="order-total">
        <h3>£${Number(order.total ?? 0).toFixed(2)}</h3>
      </div>
    `;

  } catch (err) {
    console.error("ORDER DETAILS ERROR:", err);
    loading.textContent = "Failed to load order.";
  }
});
