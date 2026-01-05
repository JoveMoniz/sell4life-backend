document.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get("id");

    const idEl    = document.getElementById("order-id");
    const dateEl  = document.getElementById("order-date");
    const itemsEl = document.getElementById("order-items");
    const totalEl = document.getElementById("order-total");

    if (!orderId) {
        idEl.textContent = "N/A";
        dateEl.textContent = "-";
        itemsEl.innerHTML = "<p>Order not found.</p>";
        totalEl.textContent = "£0.00";
        return;
    }

    // Show confirmed info
    idEl.textContent = orderId;
    dateEl.textContent = new Date().toLocaleString();

    itemsEl.innerHTML = `
        <p>Your order <strong>${orderId}</strong> has been received.</p>
        <p>You’ll be able to view full details in your account.</p>
    `;

    totalEl.textContent = "—";
});
