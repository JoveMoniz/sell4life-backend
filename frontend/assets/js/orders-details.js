// NOTE: Backend currently only supports GET /api/orders
// Single-order view filters client-side



document.addEventListener("DOMContentLoaded", async () => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("id");

    const container = document.getElementById("order-details");
    const loading = document.getElementById("order-loading");

    if (!orderId) {
        loading.textContent = "Invalid order.";
        return;
    }

    const token = localStorage.getItem("s4l_token");
    if (!token) {
        window.location.href = "/signin.html";
        return;
    }

    try {
        const res = await fetch(`/api/orders/${orderId}`, {
            headers: {
                Authorization: `Bearer ${token}`
            }
        });

        if (!res.ok) throw new Error("Order not found");

        const order = await res.json();
        loading.style.display = "none";

       const itemsHTML = order.items.map(item => {
    const line = (item.qty * item.price).toFixed(2);
    const img = item.image || "/assets/images/placeholder.png";

    return `
        <div class="order-item">
            <img class="order-thumb" src="${img}" alt="${item.name}">
            <div class="order-info">
                <div>${item.name}</div>
                <div>Qty: ${item.qty}</div>
            </div>
           <div class="order-price">
  <div class="order-line">£${line}</div>
</div>

        </div>
    `;
}).join("");


        container.innerHTML = `
            <h2>Order ID: ${order.id}</h2>
            <p>Status: ${order.status}</p>
            <p>Date: ${new Date(order.createdAt).toLocaleString()}</p>

            <div class="order-items">
                ${itemsHTML}
            </div>

            <h3>Total: £${Number(order.total).toFixed(2)}</h3>
        `;

    } catch (err) {
        console.error(err);
        loading.textContent = "Failed to load order.";
    }
});

