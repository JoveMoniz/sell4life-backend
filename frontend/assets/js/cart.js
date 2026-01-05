// ======================================================================
// SELL4LIFE CART.JS — CLEAN MERGED VERSION (hybrid-safe)
// SINGLE TOAST SYSTEM
// ======================================================================

(async function () {

    // ---------------------------------------------------------
    // 0. Wait for header + minicart structure to exist
    // ---------------------------------------------------------
    let attempts = 0;
    while (
        !document.querySelector(".basket-wrapper") ||
        !document.querySelector(".mini-cart-items")
    ) {
        attempts++;
        if (attempts > 80) {
            console.warn("Header did not load. Cart.js aborted.");
            return;
        }
        await new Promise(r => setTimeout(r, 50));
    }

    // ---------------------------------------------------------
    // 1. LocalStorage SAFE read & write
    // ---------------------------------------------------------
    function readCart() {
        try {
            const arr = JSON.parse(localStorage.getItem("cart") || "[]");
            return Array.isArray(arr) ? arr.filter(x => x && x.id) : [];
        } catch {
            return [];
        }
    }

    function saveCart() {
        localStorage.setItem("cart", JSON.stringify(cart));
    }

    let cart = readCart();

    // ---------------------------------------------------------
    // 1B. SINGLE TOAST SYSTEM
    // ---------------------------------------------------------
    let s4lToast = document.getElementById("s4l-toast");
    if (!s4lToast) {
        s4lToast = document.createElement("div");
        s4lToast.id = "s4l-toast";
        s4lToast.textContent = "Added to cart";
        document.body.appendChild(s4lToast);
    }

    function s4lShowToast(text = "Added to cart") {
        s4lToast.textContent = text;
        s4lToast.classList.add("show");
        setTimeout(() => s4lToast.classList.remove("show"), 1200);
    }

    // ---------------------------------------------------------
    // 2. DOM references
    // ---------------------------------------------------------
    const miniCartList  = document.querySelector(".mini-cart-items");
    const miniCartTotal = document.querySelector(".mini-cart-total");
    const totalSpan     = document.getElementById("cart-total");
    const cartRows      = document.getElementById("cart-rows");

    // ---------------------------------------------------------
    // 3. BADGE UPDATER
    // ---------------------------------------------------------
    function updateBadge() {
        const count = cart.reduce((s, i) => s + (i.quantity || 0), 0);
        document.querySelectorAll(".basket-qty").forEach(b => {
            b.textContent = count;
            b.classList.toggle("hide", count === 0);
        });
    }

    // ---------------------------------------------------------
    // 4. UNIVERSAL BASKET STATE
    // ---------------------------------------------------------
    function updateBasketState() {
    const totalQty = cart.reduce((s, i) => s + (i.quantity || 0), 0);

    document.querySelectorAll(".basket-wrapper").forEach(w => {
        const empty = totalQty === 0;

        w.classList.toggle("empty", empty);
        w.classList.toggle("has-items", !empty);

        // 🔒 Disable interaction when empty
        w.style.pointerEvents = empty ? "none" : "auto";
    });
}


    // ---------------------------------------------------------
    // 5. RENDER MINI CART
    // ---------------------------------------------------------
    function renderMiniCart() {
        if (!miniCartList || !miniCartTotal) return;

        miniCartList.innerHTML = "";

        if (!cart.length) {
            miniCartList.innerHTML =
                `<li><div class='mini-cart-empty'>No items in basket.</div></li>`;
            miniCartTotal.innerHTML = `£0.00`;
            return;
        }

        let total = 0;

        cart.forEach(item => {
            const price = Number(item.price);
            const qty   = Number(item.quantity);
            const sub   = price * qty;
            total += sub;

            const li = document.createElement("li");
            li.innerHTML = `
                <div class="mini-cart-item">
                    <img src="${item.image}" class="mini-cart-thumb">
                    <div class="mini-cart-info">
                        <div class="mini-cart-name">${item.name}</div>
                        <div class="mini-cart-meta">£${price.toFixed(2)} × ${qty}</div>
                    </div>
                    <div class="mini-cart-sub">£${sub.toFixed(2)}</div>
                </div>
            `;
            miniCartList.appendChild(li);
        });

        miniCartTotal.innerHTML = `
            <div class="mini-cart-total-line">
                <span class="mini-cart-total-label">Total:</span>
                <span class="mini-cart-total-value">£${total.toFixed(2)}</span>
            </div>
        `;
    }

    // ---------------------------------------------------------
    // 6. RENDER FULL CART PAGE
    // ---------------------------------------------------------
    function renderCartPage() {
        if (!cartRows) return;

        cartRows.innerHTML = "";
        if (!cart.length) {
            totalSpan.textContent = "£0.00";
            return;
        }

        let total = 0;

        cart.forEach((item, i) => {
            const price = Number(item.price);
            const qty   = Number(item.quantity);
            const sub   = price * qty;
            total += sub;

            const row = document.createElement("div");
            row.classList.add("cart-row");

            row.innerHTML = `
                <div class="col-product cart-product-info">
                    <img class="cart-thumb" src="${item.image}">
                    <a class="cart-product-link"
                       href="/${item.category}/${item.subcategory}/?id=${item.id}">
                       ${item.name}
                    </a>
                </div>

                <div class="col-qty qty-control">
                    <button class="qty-minus" data-index="${i}">−</button>
                    <span>${qty}</span>
                    <button class="qty-plus" data-index="${i}">+</button>
                    <button class="remove-item" data-index="${i}">×</button>
                </div>

                <div class="col-price">£${price.toFixed(2)}</div>
                <div class="col-subtotal">£${sub.toFixed(2)}</div>

                <div class="m-price-line">
                    £${price.toFixed(2)} × ${qty} =
                    <span class="m-subtotal">£${sub.toFixed(2)}</span>
                </div>
            `;

            cartRows.appendChild(row);
        });

        totalSpan.textContent = `£${total.toFixed(2)}`;
    }

    // ---------------------------------------------------------
    // 7. MOBILE PRICE LINE
    // ---------------------------------------------------------
    function isRealTouchDevice() {
        return (
            ("ontouchstart" in window) ||
            (navigator.maxTouchPoints && navigator.maxTouchPoints > 0)
        );
    }

    function updateMPriceLine() {
        const width = window.innerWidth;
        const portrait = window.matchMedia("(orientation: portrait)").matches;
        const touch = isRealTouchDevice();

        const show = width <= 480 && portrait && touch;

        document.querySelectorAll(".m-price-line").forEach(el => {
            el.style.display = show ? "flex" : "none";
        });
    }

    // ---------------------------------------------------------
    // 8. FULL REFRESH
    // ---------------------------------------------------------
    function refreshAll() {
        cart = readCart();
        renderMiniCart();
        updateBadge();
        updateBasketState();
        renderCartPage();
        updateMPriceLine();
    }

    refreshAll();
    document.addEventListener("cartUpdated", refreshAll);

    // =====================================================================
    // 9. TAP SYSTEM FOR BUTTONS
    // =====================================================================

    let tapStartX = 0;
    let tapStartY = 0;
    const TAP_THRESHOLD = 12;

    document.addEventListener("pointerdown", e => {
        const btn = e.target.closest(".qty-plus, .qty-minus, .remove-item, .btn-add");
        if (!btn) return;

        tapStartX = e.clientX;
        tapStartY = e.clientY;

        btn.classList.add("tapped");
    });

    document.addEventListener("pointermove", e => {
        const btn = e.target.closest(".qty-plus, .qty-minus, .remove-item, .btn-add");
        if (!btn) return;

        const dx = Math.abs(e.clientX - tapStartX);
        const dy = Math.abs(e.clientY - tapStartY);

        if (dx > TAP_THRESHOLD || dy > TAP_THRESHOLD) {
            btn.classList.remove("tapped");
        }
    });

    document.addEventListener("pointerup", e => {
        const btn = e.target.closest(".qty-plus, .qty-minus, .remove-item, .btn-add");
        if (!btn) return;

        const dx = Math.abs(e.clientX - tapStartX);
        const dy = Math.abs(e.clientY - tapStartY);

        setTimeout(() => btn.classList.remove("tapped"), 100);

        if (dx > TAP_THRESHOLD || dy > TAP_THRESHOLD) return;

        if (navigator.vibrate) navigator.vibrate(30);

        if (btn.classList.contains("qty-plus")) {
            const i = +btn.dataset.index;
            cart[i].quantity++;
            saveCart();
            refreshAll();
            return;
        }

        if (btn.classList.contains("qty-minus")) {
    const i = +btn.dataset.index;

    // Normal decrement
    if (cart[i].quantity > 1) {
        cart[i].quantity--;
        saveCart();
        refreshAll();
        return;
    }

    // Quantity will reach zero → attempt animation
    const row = btn.closest(".cart-row");

    // If row not found (mobile / layout edge cases)
    if (!row) {
        cart.splice(i, 1);
        saveCart();
        refreshAll();
        return;
    }

    // Lock height before collapse
    row.style.height = row.offsetHeight + "px";

    requestAnimationFrame(() => {
        row.classList.add("removing");
    });

    setTimeout(() => {
        cart.splice(i, 1);
        saveCart();
        refreshAll();
    }, 350);

    return;
}


        if (btn.classList.contains("remove-item")) {
    const i = +btn.dataset.index;
    const row = btn.closest(".cart-row");
    if (!row) return;

    // Lock height so it can animate
    row.style.height = row.offsetHeight + "px";

    // Trigger collapse
    requestAnimationFrame(() => {
        row.classList.add("removing");
    });

    // Remove AFTER animation
    setTimeout(() => {
        cart.splice(i, 1);
        saveCart();
        refreshAll();
    }, 350);

    return;
}


        if (btn.classList.contains("btn-add")) {
            const productId = btn.dataset.id;
            const productName = btn.dataset.name;
            const productPrice = btn.dataset.price;
            const productImage = btn.dataset.image;
            const category = btn.dataset.category;
            const subcategory = btn.dataset.subcategory;

            let item = cart.find(p => p.id == productId);

            if (item) {
                item.quantity++;
            } else {
                cart.push({
                    id: productId,
                    name: productName,
                    price: productPrice,
                    image: productImage,
                    category,
                    subcategory,
                    quantity: 1
                });
            }

            saveCart();
            refreshAll();
            s4lShowToast("Added to cart");
        }
    });

    // =====================================================================
    // 10. MOBILE CLEAR CART MODAL
    // =====================================================================
    document.addEventListener("click", e => {
        if (e.target.id === "clear-cart") {
            document.querySelector(".clear-cart-modal")?.classList.add("show");
        }

        if (e.target.classList.contains("confirm-clear")) {
            cart = [];
            saveCart();
            refreshAll();
            document.querySelector(".clear-cart-modal")?.classList.remove("show");
        }

        if (e.target.classList.contains("cancel-clear")) {
            document.querySelector(".clear-cart-modal")?.classList.remove("show");
        }
    });

    // =====================================================================
    // 11. MOBILE BASKET CLICK
    // =====================================================================
    document.addEventListener("click", e => {
        const mobileBasket = document.querySelector(".s4l-header-mobile .basket-shell");
        if (mobileBasket && mobileBasket.contains(e.target)) {
            window.location.href = "/cart/cart.html";
        }
    });

    // =====================================================================
    // 12. HYBRID DESKTOP: HOVER + TAP MINICART
    // =====================================================================

    const desktopWrapper = document.querySelector(".s4l-header-desktop .basket-wrapper");
    const desktopMini    = document.querySelector(".s4l-header-desktop .mini-cart");

    if (desktopWrapper && desktopMini) {

        // Hover (real mouse only)
        window.matchMedia("(hover: hover) and (pointer: fine)").addEventListener("change", () => {});
        
        if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
            desktopWrapper.addEventListener("mouseenter", () => {
                if (!cart.length) return;
                desktopMini.style.display = "block";
                desktopMini.style.opacity = "1";
                desktopMini.style.visibility = "visible";
            });

            desktopWrapper.addEventListener("mouseleave", () => {
                desktopMini.style.display = "none";
                desktopMini.style.opacity = "0";
                desktopMini.style.visibility = "hidden";
            });
        }

        // Touch tap toggle (hybrid laptops)
desktopWrapper.addEventListener("touchstart", e => {

    // Only react if the touch happened EXACTLY on the desktop basket icon
    const icon = e.target.closest(".basket-shell, .basket-handle");
    if (!icon) return; // Do NOT block other touches anywhere else

    if (!cart.length) return;

    const open = desktopMini.style.display === "block";

    if (open) {
        desktopMini.style.display = "none";
        desktopMini.style.opacity = "0";
        desktopMini.style.visibility = "hidden";
    } else {
        desktopMini.style.display = "block";
        desktopMini.style.opacity = "1";
        desktopMini.style.visibility = "visible";
    }

    e.preventDefault(); // Prevent scroll ONLY for the basket icon
}, { passive: false });


    }

    // =====================================================================
    // 13. SCREEN & ORIENTATION
    // =====================================================================
    window.addEventListener("resize", updateMPriceLine);
    window.matchMedia("(orientation: portrait)").addEventListener("change", updateMPriceLine);
    window.matchMedia("(orientation: landscape)").addEventListener("change", updateMPriceLine);

})(); // END wrapper



// ======================================================================
// 14. CHECKOUT BUTTON
// ======================================================================
document.addEventListener("click", e => {
    const btn = e.target.closest("#btn-buy");
    if (btn) window.location.href = "/cart/checkout.html";
});
