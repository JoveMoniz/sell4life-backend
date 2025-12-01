document.addEventListener("DOMContentLoaded", () => {
    const itemsWrap = document.getElementById("order-items");
    const idEl = document.getElementById("order-id");
    const dateEl = document.getElementById("order-date");
    const totalEl = document.getElementById("order-total");

    // Get last order from checkout.js
    const lastOrder = JSON.parse(localStorage.getItem("sell4life_last_order") || "null");

    if (!lastOrder) return;

    // Display order number and date
    if (idEl) idEl.textContent = "#" + (lastOrder.id || "000000");
    if (dateEl) dateEl.textContent = lastOrder.date || "--";

    // Render items + calculate subtotal
    let subtotal = 0;

    if (itemsWrap) {
        itemsWrap.innerHTML = lastOrder.items.map(item => {
            const qty = item.qty || item.quantity || 1;
            const price = Number(item.price) || 0;
            const line = qty * price;

            subtotal += line;

            return `
                <div class="ty-item">
                    <span>${item.name} (x${qty})</span>
                    <span>£${line.toFixed(2)}</span>
                </div>
            `;
        }).join("");
    }

    // SHOW TOTAL
    if (totalEl) {
        totalEl.textContent = "£" + subtotal.toFixed(2);
    }

    // Clear the order
    localStorage.removeItem("sell4life_last_order");
});
