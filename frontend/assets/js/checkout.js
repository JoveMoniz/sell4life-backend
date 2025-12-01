// ================================
// Sell4Life Checkout – Clean Version
// ================================

document.addEventListener("DOMContentLoaded", () => {

    // ---------- DOM ----------
    const itemsWrap   = document.getElementById("checkout-items");
    const subtotalEl  = document.getElementById("checkout-subtotal");
    const shippingEl  = document.getElementById("checkout-shipping");
    const totalEl     = document.getElementById("checkout-total");
    const orderBtn    = document.getElementById("place-order-btn");

    // ---------- Read Cart ----------
    function readCart() {
        try {
            const arr = JSON.parse(localStorage.getItem("cart") || "[]");
            return Array.isArray(arr) ? arr.filter(x => x && x.id) : [];
        } catch {
            return [];
        }
    }

    let cart = readCart();

    // ---------- Render Checkout Items ----------
    function renderItems() {
        if (!cart.length) {
            itemsWrap.innerHTML = `<p>Your cart is empty.</p>`;
            subtotalEl.textContent = "£0.00";
            shippingEl.textContent = "£0.00";
            totalEl.textContent = "£0.00";
            return;
        }

        let subtotal = 0;

        itemsWrap.innerHTML = cart.map(item => {
            const qty   = Number(item.quantity);
            const price = Number(item.price);
            const line  = qty * price;

            subtotal += line;

            return `
    <div class="checkout-item">
        <img class="checkout-thumb" src="${item.image}" alt="${item.name}">
        
        <div class="checkout-details">
            <span class="checkout-title">${item.name}</span>
            <span class="checkout-qty">Quantity: ${qty}</span>
        </div>

        <span class="checkout-price">£${line.toFixed(2)}</span>
    </div>
`;

        }).join("");

        subtotalEl.textContent = "£" + subtotal.toFixed(2);
        shippingEl.textContent = "£0.00";
        totalEl.textContent = "£" + subtotal.toFixed(2);
    }

    renderItems();

    // ---------- Place Order ----------
    orderBtn.addEventListener("click", () => {

        if (!cart.length) return; // no popup, silent fail

        const order = {
            id: Math.floor(Math.random() * 900000) + 100000,
            date: new Date().toLocaleString(),
            items: cart
        };

        // Save order so thankyou page can read it
        localStorage.setItem("sell4life_last_order", JSON.stringify(order));

        // Clear cart
        localStorage.removeItem("cart");

        // Redirect
        window.location.href = "/thankyou/thankyou.html";
    });

});
