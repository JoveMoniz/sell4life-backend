// ================================
// Sell4Life Checkout – FINAL CLEAN VERSION (FIXED THUMBNAILS)
// ================================

document.addEventListener("DOMContentLoaded", () => {

    // ---------- DOM ----------
    const itemsWrap  = document.getElementById("checkout-items");
    const subtotalEl = document.getElementById("checkout-subtotal");
    const shippingEl = document.getElementById("checkout-shipping");
    const totalEl    = document.getElementById("checkout-total");
    const orderBtn   = document.getElementById("place-order-btn");

    // ---------- Read Cart ----------
    function readCart() {
        try {
            const data = JSON.parse(localStorage.getItem("cart") || "[]");
            return Array.isArray(data) ? data.filter(i => i && i.id) : [];
        } catch {
            return [];
        }
    }

    let cart = readCart();

    // ---------- Render Checkout ----------
    function renderItems() {
        if (!itemsWrap || !subtotalEl || !shippingEl || !totalEl) return;

        if (!cart.length) {
            itemsWrap.innerHTML = "<p>Your cart is empty.</p>";
            subtotalEl.textContent = "£0.00";
            shippingEl.textContent = "£0.00";
            totalEl.textContent = "£0.00";
            return;
        }

        let subtotal = 0;

        itemsWrap.innerHTML = cart.map(item => {
            const qty   = Number(item.quantity || 1);
            const price = Number(item.price || 0);
            const line  = qty * price;

            subtotal += line;

            // ✅ FIX: trust the image if it exists
            const imgSrc = item.image
                ? item.image
                : "/assets/images/placeholder.png";

            return `
                <div class="checkout-item">
                    <img
                        class="checkout-thumb"
                        src="${imgSrc}"
                        alt="${item.name}"
                        width="60"
                        height="60"
                        loading="lazy"
                    >
                    <div class="checkout-details">
                        <span class="checkout-title">${item.name}</span>
                        <span class="checkout-qty">Quantity: ${qty}</span>
                    </div>
                    <span class="checkout-price">£${line.toFixed(2)}</span>
                </div>
            `;
        }).join("");

        subtotal = Number(subtotal.toFixed(2));

        subtotalEl.textContent = "£" + subtotal.toFixed(2);
        shippingEl.textContent = "£0.00";
        totalEl.textContent    = "£" + subtotal.toFixed(2);
    }

    renderItems();

    // ---------- Place Order ----------
    orderBtn.addEventListener("click", async () => {
        if (!cart.length) return;

        const token = localStorage.getItem("s4l_token");
        if (!token) {
            window.location.href = "/signin.html";
            return;
        }

        const items = cart.map(item => ({
    productId: item.id,
    name: item.name,
    qty: Number(item.quantity || 1),
    price: Number(item.price || 0),
    image: item.image || "/assets/images/placeholder.png"
}));


        // 🔒 FIXED TOTAL (NO FLOAT TRASH)
        const total = Number(
            items.reduce((sum, i) => sum + i.qty * i.price, 0).toFixed(2)
        );

        try {
            const res = await fetch(`/api/orders/${orderId}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: "Bearer " + token
                },
                body: JSON.stringify({ items, total })
            });

            if (!res.ok) throw new Error("Order creation failed");

            const order = await res.json();

            // Clear cart ONLY after success
            localStorage.removeItem("cart");

            // Redirect with backend order ID
            window.location.href = `/thankyou/thankyou.html?id=${order.id}`;

        } catch (err) {
            console.error(err);
            alert("Failed to place order. Please try again.");
        }
    });

});
