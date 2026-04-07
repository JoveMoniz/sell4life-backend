// ======================================================
// SELL4LIFE – CORE.JS
// Global cart UI controller
// Handles:
// - basket badge
// - mini-cart
// - full cart page
// - remove/decrement actions
// - cartUpdated event
// Data source: localStorage
// ======================================================

document.addEventListener('DOMContentLoaded', () => {
  console.log('✅ core.js loaded');

  // ======================================================
  // DOM ELEMENT REFERENCES
  // ======================================================

  const badge = document.querySelector('.basket-qty');
  const miniCartList = document.querySelector('.mini-cart-items');
  const miniCartTotal = document.querySelector('.mini-cart-total span');
  const cartList = document.querySelector('.cart-items');
  const totalSpan = document.getElementById('cart-total');

  // ======================================================
  // LOAD CART FROM LOCAL STORAGE
  // ======================================================

  let cart = JSON.parse(localStorage.getItem('cart')) || [];
  console.log('🧾 Loaded cart:', cart);

  // ======================================================
  // UPDATE BASKET BADGE
  // ======================================================

  function updateBadge() {
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);

    if (!badge) return;

    if (count > 0) {
      badge.textContent = count;
      badge.classList.remove('hide');
    } else {
      badge.classList.add('hide');
    }

    console.log('🔢 Badge updated:', count);
  }

  // ======================================================
  // RENDER MINI CART
  // Used in header / basket dropdown
  // ======================================================

  function renderMiniCart() {
    if (!miniCartList) {
      console.warn('⚠️ miniCartList not found');
      return;
    }

    miniCartList.innerHTML = '';

    if (cart.length === 0) {
      console.log('🧺 Mini-cart empty');
      miniCartList.innerHTML = `<li>No items in basket.</li>`;

      if (miniCartTotal) {
        miniCartTotal.textContent = '£0.00';
      }

      return;
    }

    let total = 0;

    cart.forEach((item) => {
      total += item.price * item.quantity;

      const li = document.createElement('li');
      li.textContent = `${item.name} x${item.quantity}`;
      miniCartList.appendChild(li);
    });

    if (miniCartTotal) {
      miniCartTotal.textContent = `£${total.toFixed(2)}`;
    }

    console.log('🛒 Mini-cart rendered:', cart);
  }

  // ======================================================
  // RENDER FULL CART PAGE
  // Used on cart page only
  // ======================================================

  function renderCartPage() {
    if (!cartList || !totalSpan) return;

    cartList.innerHTML = '';

    if (cart.length === 0) {
      cartList.innerHTML = `<li>No items in your basket yet.</li>`;
      totalSpan.textContent = '0.00';
      return;
    }

    let total = 0;

    cart.forEach((item, index) => {
      const lineTotal = item.price * item.quantity;
      total += lineTotal;

      const li = document.createElement('li');
      li.innerHTML = `
        <div class="cart-item">
          <span>${item.name}</span>
          <span>x${item.quantity}</span>
          <span>£${lineTotal.toFixed(2)}</span>
          <button class="cart-remove" data-index="${index}">✕</button>
        </div>
      `;

      cartList.appendChild(li);
    });

    totalSpan.textContent = total.toFixed(2);
    console.log('🧮 Cart page rendered:', cart);
  }

  // ======================================================
  // REMOVE ITEM / DECREMENT QUANTITY
  // ======================================================

  document.addEventListener('click', (e) => {
    if (!e.target.classList.contains('cart-remove')) return;

    const index = Number(e.target.dataset.index);
    console.log('❌ Removing index', index);

    if (!cart[index]) return;

    if (cart[index].quantity > 1) {
      cart[index].quantity--;
    } else {
      cart.splice(index, 1);
    }

    localStorage.setItem('cart', JSON.stringify(cart));

    renderCartPage();
    renderMiniCart();
    updateBadge();
  });

  // ======================================================
  // LISTEN FOR GLOBAL CART UPDATE EVENT
  // Other scripts can dispatch: document.dispatchEvent(new Event('cartUpdated'))
  // ======================================================

  document.addEventListener('cartUpdated', () => {
    console.log('🟢 cartUpdated event received');

    cart = JSON.parse(localStorage.getItem('cart')) || [];

    renderMiniCart();
    renderCartPage();
    updateBadge();
  });

  // ======================================================
  // INITIALIZE UI
  // ======================================================

  updateBadge();
  renderMiniCart();
  renderCartPage();

  console.log('🚀 core.js initialization complete');
});
