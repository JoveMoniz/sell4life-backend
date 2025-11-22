// /assets/js/cart.js v8 – with REMOVE BUTTON support
(async function () {
  if (window.__cartBooted) return;
  window.__cartBooted = true;

  // Listen for product.js updates
  document.addEventListener("cartUpdated", () => {
    cart = readCart();
    renderMiniCart();
    updateBadge();
    renderCartPage();
  });

  // Wait for header/minicart to load
  while (!document.querySelector(".mini-cart-items") || !document.querySelector(".basket-qty")) {
    await new Promise(r => setTimeout(r, 100));
  }

  // Header elements
  const badge         = document.querySelector(".basket-qty");
  const miniCartList  = document.querySelector(".mini-cart-items");
  const miniCartTotal = document.querySelector(".mini-cart-total");

  // Cart page columns
  const colProduct   = document.getElementById("col-product");
  const colQty       = document.getElementById("col-qty");
  const colPrice     = document.getElementById("col-price");
  const colSubtotal  = document.getElementById("col-subtotal");
  const colRemove    = document.getElementById("col-remove");  // NEW COLUMN
  const totalSpan    = document.getElementById("cart-total");

  // Read cart safely
  function readCart() {
    try {
      const arr = JSON.parse(localStorage.getItem("cart") || "[]");
      return Array.isArray(arr) ? arr.filter(x => x && x.id) : [];
    } catch {
      return [];
    }
  }

  let cart = readCart();

  function saveCart() {
    localStorage.setItem("cart", JSON.stringify(cart));
  }

  // Badge in header
  function updateBadge() {
    const count = cart.reduce((s, i) => s + (i.quantity || 0), 0);
    badge.textContent = count;
    badge.classList.toggle("hide", count === 0);
  }

  // Mini-cart render
  function renderMiniCart() {
    miniCartList.innerHTML = "";

    if (!cart.length) {
      miniCartList.innerHTML = `
        <li><div class="mini-cart-empty">No items in basket.</div></li>
      `;
      miniCartTotal.textContent = "£0.00";
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
    <div class="mini-cart-left">
      <div class="mini-cart-name">${item.name}</div>
      <div class="mini-cart-details">£${price.toFixed(2)} × ${qty}</div>
    </div>

    <div class="mini-cart-right">
      <div class="mini-cart-qty">Qty: ${qty}</div>
      <div class="mini-cart-sub">£${sub.toFixed(2)}</div>
    </div>
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

  // Cart page render (with REMOVE column)
  function renderCartPage() {
    if (!colProduct || !colQty || !colPrice || !colSubtotal || !colRemove || !totalSpan) return;

    colProduct.innerHTML  = "";
    colQty.innerHTML      = "";
    colPrice.innerHTML    = "";
    colSubtotal.innerHTML = "";
    colRemove.innerHTML   = "";

    if (!cart.length) {
      totalSpan.textContent = "0.00";
      return;
    }

    let total = 0;

    cart.forEach((item, index) => {
      const price = Number(item.price);
      const qty   = Number(item.quantity);
      const sub   = price * qty;

      total += sub;

      // PRODUCT
  // PRODUCT (thumbnail + name)
// PRODUCT (thumbnail + name with category link)
const p = document.createElement("div");
p.className = "cart-product-info";

const link = document.createElement("a");
link.href = `/${item.category}/${item.subcategory}/?id=${item.id}`;
link.className = "cart-product-link";

// Thumbnail
const img = document.createElement("img");
img.src = item.image || "";
img.alt = item.name;
img.className = "cart-thumb";

// Name
const name = document.createElement("span");
name.textContent = item.name;

link.appendChild(img);
link.appendChild(name);
p.appendChild(link);
colProduct.appendChild(p);


      // QTY
      const qc = document.createElement("div");
      qc.className = "qty-control";

      const minus = document.createElement("button");
      minus.className = "qty-minus";
      minus.dataset.index = index;
      minus.textContent = "−";

      const value = document.createElement("span");
      value.className = "qty-value";
      value.textContent = qty;

      const plus = document.createElement("button");
      plus.className = "qty-plus";
      plus.dataset.index = index;
      plus.textContent = "+";

      qc.appendChild(minus);
      qc.appendChild(value);
      qc.appendChild(plus);

      colQty.appendChild(qc);

      // PRICE
      const pr = document.createElement("div");
      pr.textContent = `£${price.toFixed(2)}`;
      colPrice.appendChild(pr);

      // SUBTOTAL
      const st = document.createElement("div");
      st.textContent = `£${sub.toFixed(2)}`;
      colSubtotal.appendChild(st);

      // REMOVE BUTTON (NEW)
      const rm = document.createElement("button");
      rm.className = "remove-item";
      rm.dataset.index = index;
      rm.textContent = "×";
const wrap = document.createElement("div");
wrap.className = "remove-wrap";   // optional
wrap.appendChild(rm);
colRemove.appendChild(wrap);
    });

    totalSpan.textContent = total.toFixed(2);
  }

  // Master refresh
  function refreshAll() {
    cart = readCart();
    renderMiniCart();
    updateBadge();
    renderCartPage();
  }

  // Button logic
  document.addEventListener("click", e => {

    // Increase qty
    if (e.target.classList.contains("qty-plus")) {
      const i = +e.target.dataset.index;
      cart[i].quantity++;
      saveCart();
      refreshAll();
      return;
    }

    // Decrease qty
    if (e.target.classList.contains("qty-minus")) {
      const i = +e.target.dataset.index;
      if (cart[i].quantity > 1) {
        cart[i].quantity--;
      } else {
        cart.splice(i, 1);
      }
      saveCart();
      refreshAll();
      return;
    }

    // REMOVE ITEM BUTTON
    if (e.target.classList.contains("remove-item")) {
      const i = +e.target.dataset.index;
      cart.splice(i, 1);
      saveCart();
      refreshAll();
      return;
    }

    // CONFIRM CLEAR
if (e.target.classList.contains("confirm-clear")) {
  cart = [];
  saveCart();
  refreshAll();
  document.querySelector(".clear-cart-modal").classList.remove("show");
  return;
}

// CANCEL CLEAR
if (e.target.classList.contains("cancel-clear")) {
  document.querySelector(".clear-cart-modal").classList.remove("show");
  return;
}


    // Clear cart
    if (e.target.id === "clear-cart") {
      if (cart.length) {
  document.querySelector(".clear-cart-modal").classList.add("show");
}

      return;
    }
  });

  // Initial paint
  refreshAll();
})();



