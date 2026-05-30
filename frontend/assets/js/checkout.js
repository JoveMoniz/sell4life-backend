// ======================================================
// SELL4LIFE CHECKOUT
// Stripe Payment Element + Order Creation Flow
// ======================================================

// ======================================================
// URL PARAMETERS
// ======================================================

const params = new URLSearchParams(window.location.search);
const existingOrderId = params.get('order');

// ======================================================
// DOM ELEMENTS
// ======================================================

const itemsWrap = document.getElementById('checkout-items');
const subtotalEl = document.getElementById('checkout-subtotal');
const shippingEl = document.getElementById('checkout-shipping');
const totalEl = document.getElementById('checkout-total');

const orderBtn = document.getElementById('place-order-btn');
const paymentHost = document.getElementById('payment-element');
const msgEl = document.getElementById('payment-message');

if (!itemsWrap || !subtotalEl || !shippingEl || !totalEl || !orderBtn || !paymentHost) {
  console.error('Checkout DOM missing');
}

// ======================================================
// READ CART
// ======================================================

function readCart() {
  try {
    const data = JSON.parse(localStorage.getItem('cart') || '[]');

    return Array.isArray(data) ? data.filter((i) => i && (i.productId || i.id)) : [];
  } catch {
    return [];
  }
}

let cart = readCart();

// ======================================================
// BUY NOW MODE
// ======================================================

const buyNow = localStorage.getItem('buyNow') === 'true';

// ======================================================
// UI HELPERS
// ======================================================

function setMessage(text) {
  if (!msgEl) return;

  msgEl.textContent = text || '';
  msgEl.classList.toggle('hidden', !text);
}

function disableButton(disabled, label) {
  if (!orderBtn) return;

  orderBtn.disabled = !!disabled;

  if (label) orderBtn.textContent = label;
}

// ======================================================
// RENDER CHECKOUT ITEMS
// ======================================================

function renderItems() {
  if (!cart.length) {
    itemsWrap.innerHTML = '<p>Your cart is empty.</p>';

    subtotalEl.textContent = '£0.00';
    shippingEl.textContent = '£0.00';
    totalEl.textContent = '£0.00';

    disableButton(true, 'Pay Now');

    return { subtotal: 0 };
  }

  disableButton(false, 'Pay Now');

  let subtotal = 0;

  itemsWrap.innerHTML = cart
    .map((item) => {
      const qty = Number(item.quantity || 1);
      const price = Number(item.price || 0);

      const line = qty * price;

      subtotal += line;

      return `
      <div class="checkout-item">

        <img
          class="checkout-thumb"
          src="${item.image || '/assets/images/products/sell4life-placeholder.png'}"
          alt="${item.name}"
          width="60"
          height="60"
          onerror="this.onerror=null;this.src='/assets/images/products/sell4life-placeholder.png';"
        />

        <div class="checkout-details">
          <div class="checkout-title-wrap">
            <span class="checkout-title">${item.name}</span>
          </div>
          <span class="checkout-qty">Quantity: ${qty}</span>
        </div>

        <span class="checkout-price">£${line.toFixed(2)}</span>

      </div>
    `;
    })
    .join('');

  subtotalEl.textContent = `£${subtotal.toFixed(2)}`;
  shippingEl.textContent = '£0.00';
  totalEl.textContent = `£${subtotal.toFixed(2)}`;

  // Scroll long titles — same pattern as cart.js
  requestAnimationFrame(() => {
    document.querySelectorAll('.checkout-title-wrap').forEach((wrap) => {
      const span = wrap.querySelector('.checkout-title');
      if (span && span.scrollWidth > wrap.offsetWidth + 2) {
        span.classList.add('scrollable');
      }
    });
  });

  return { subtotal };
}

renderItems();

// ======================================================
// AUTH CHECK
// ======================================================

const token = localStorage.getItem('s4l_token');

if (!token) {
  localStorage.setItem('postLoginRedirect', window.location.pathname + window.location.search);
  window.location.href = '/account/signin.html';
}

// ======================================================
// STRIPE INITIALIZATION
// ======================================================

const STRIPE_PK = window.STRIPE_PUBLISHABLE_KEY || '';

if (!STRIPE_PK) {
  console.error('Stripe publishable key missing');

  setMessage('Payment unavailable right now.');

  disableButton(true);
}

const stripe = STRIPE_PK ? Stripe(STRIPE_PK) : null;

let elements = null;
let currentOrder = null;

// ======================================================
// BUILD ORDER ITEMS PAYLOAD
// ======================================================

function buildOrderItemsPayload() {
  return cart.map((item) => ({
    productId: item.productId || item._id || item.id,
    quantity: Number(item.quantity || 1),
  }));
}

// ======================================================
// INITIALIZE PAYMENT
// ======================================================

async function initPayment() {
  if (!stripe) return;

  setMessage('');
  disableButton(true, 'Preparing payment…');

  try {
    let order;

    // --------------------------------------------------
    // NORMAL CHECKOUT
    // --------------------------------------------------
    if (!cart.length) {
      setMessage('Cart is empty');
      disableButton(true);
      return;
    }

    const res = await fetch(`${API_BASE}/orders/create-payment-intent?t=${Date.now()}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + localStorage.getItem('s4l_token'),
      },
      body: JSON.stringify({
        items: buildOrderItemsPayload(),
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      setMessage(data.error || 'Some items are unavailable');

      itemsWrap.innerHTML = '<p>Some items are out of stock. Please update your cart.</p>';

      disableButton(true, 'Fix cart');

      return;
    }
    order = data;

    // Update shipping + total display with authoritative server values
    if (shippingEl && order.shipping !== undefined) {
      const shipping = Number(order.shipping);
      shippingEl.textContent = shipping > 0 ? `£${shipping.toFixed(2)}` : 'Free';
      if (totalEl) {
        const subtotal = cart.reduce((s, i) => s + (Number(i.price || 0) * Number(i.quantity || 1)), 0);
        totalEl.textContent = `£${(subtotal + shipping).toFixed(2)}`;
      }
    }

    currentOrder = {
      clientSecret: order.clientSecret,
    };

    elements = stripe.elements({
      clientSecret: currentOrder.clientSecret,
    });

    const paymentElement = elements.create('payment');

    paymentElement.mount('#payment-element');

    disableButton(false, 'Pay Now');
  } catch (err) {
    console.error('INIT PAYMENT ERROR:', err);

    setMessage(err.message || 'Payment setup failed');
    disableButton(true);
  }
}

initPayment();

// ======================================================
// PAY NOW BUTTON
// ======================================================

orderBtn?.addEventListener('click', async () => {
  if (!stripe || !elements) {
    setMessage('Payment is not ready.');

    return;
  }

  setMessage('');
  disableButton(true, 'Processing…');

  localStorage.setItem(
    'checkout_cleanup_plan',
    JSON.stringify({
      buyNow,
      createdAt: Date.now(),
    })
  );

  try {
    const result = await stripe.confirmPayment({
      elements,

      confirmParams: {
        return_url: `${window.location.origin}/thankyou/thankyou.html`,
      },
    });

    if (result?.error) {
      console.error('Stripe confirmPayment error:', result.error);

      setMessage(result.error.message || 'Payment failed.');

      disableButton(false, 'Pay Now');

      return;
    }
  } catch (err) {
    console.error('CONFIRM PAYMENT ERROR:', err);

    setMessage('Payment failed.');

    disableButton(false, 'Pay Now');
  }
});
