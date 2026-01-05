
// NOTE: Backend currently only supports GET /api/orders
// Single-order view filters client-side




document.addEventListener("DOMContentLoaded", async () => {
  console.log("orders.js running");

  const token = localStorage.getItem("s4l_token");
  const loading = document.getElementById("orders-loading");
  const list = document.getElementById("orders-list");

  if (!token) {
    loading.textContent = "Please sign in.";
    return;
  }

  try {
    const res = await fetch("/api/orders", {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    loading.style.display = "none";

    if (!data.orders || data.orders.length === 0) {
      list.innerHTML = "<p>You don’t have any orders yet.</p>";
      return;
    }

    list.innerHTML = data.orders.map(o => {

  const date = o.createdAt
    ? new Date(o.createdAt).toLocaleString()
    : "—";

  return `
    <a href="./orders-details.html?id=${o.id}" class="order-card">
      <div class="order-header">
        <span>Order ID: ${o.id}</span>
        <span class="order-total">£${Number(o.total).toFixed(2)}</span>
      </div>

      <div class="order-meta">
        <div>Status: ${o.status}</div>
        <div class="order-date">${date}</div>
      </div>
    </a>
  `;
}).join("");


  } catch (err) {
    console.error(err);
    loading.textContent = "Failed to load orders.";
  }
});
