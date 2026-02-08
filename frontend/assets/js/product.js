// /frontend/assets/js/product.js
(async function () {
  const $ = sel => document.querySelector(sel);
  const IMAGE_BASE = "/assets/images/products/";

  const params = new URLSearchParams(location.search);
  const productId = params.get("id");

  if (!productId) {
    console.warn("No ?id=... in URL, cannot load product.");
    return;
  }

  // ---------- LOAD PRODUCTS ----------
  let products = [];
  try {
    const res = await fetch("/data/products.json", { cache: "no-store" });
    products = await res.json();
  } catch (err) {
    console.error("Failed to load /data/products.json", err);
    return;
  }

  const product = products.find(p => p.id === productId);
  if (!product) {
    console.error("Product not found:", productId);
    return;
  }

  // ---------- RENDER PRODUCT ----------
  $(".product-title") &&
    ($(".product-title").textContent = product.name);

  $(".product-category") &&
    ($(".product-category").textContent =
      `${product.category} / ${product.subcategory}`);

  $(".product-price") &&
    ($(".product-price").textContent = `£${product.price.toFixed(2)}`);

  $(".product-desc") &&
    ($(".product-desc").textContent = product.description);

  // ---------- IMAGES ----------
  const hiddenGallery = document.getElementById("hidden-gallery");
  if (hiddenGallery) {
    hiddenGallery.innerHTML = "";
    product.images.forEach(imgFile => {
      const img = document.createElement("img");
      img.src = IMAGE_BASE + imgFile;
      img.alt = product.name;
      hiddenGallery.appendChild(img);
    });
    document.dispatchEvent(new Event("productImagesLoaded"));
  }

  // ---------- CART HELPER ----------
  function addToCart() {
    let cart = JSON.parse(localStorage.getItem("cart") || "[]")
      .filter(i => i && i.id);

    const existing = cart.find(i => i.id === product.id);

    if (existing) {
      existing.quantity = (existing.quantity || 1) + 1;
    } else {
      cart.push({
        id: product.id,
        name: product.name,
        price: product.price,
        image: IMAGE_BASE + (product.images[0] || ""),
        quantity: 1,
        category: product.category,
        subcategory: product.subcategory
      });
    }

    localStorage.setItem("cart", JSON.stringify(cart));
    document.dispatchEvent(new Event("cartUpdated"));

    return cart;
  }

  // ---------- ADD TO BASKET ----------
  const addBtn = $(".btn-add");
  if (addBtn) {
    addBtn.addEventListener("click", () => {
      const cart = addToCart();

      const badge = document.querySelector(".basket-qty");
      if (badge) {
        const totalQty = cart.reduce(
          (sum, item) => sum + (item.quantity || 0),
          0
        );
        badge.textContent = totalQty;
        badge.classList.remove("hide");
        badge.classList.add("bump");
        setTimeout(() => badge.classList.remove("bump"), 220);
      }

      console.log("✔ Added to basket:", product.name);
    });
  }

  // ---------- BUY NOW (ISOLATED FLOW) ----------
  const buyBtn = $(".btn-buy");
  if (buyBtn) {
    buyBtn.addEventListener("click", () => {

      // ✅ Backup cart ONLY ONCE
      if (!localStorage.getItem("cart_backup")) {
        const existingCart =
          JSON.parse(localStorage.getItem("cart") || "[]");

        if (existingCart.length) {
          localStorage.setItem(
            "cart_backup",
            JSON.stringify(existingCart)
          );
        }
      }

      // Replace cart with ONLY this product
      const buyNowCart = [{
        id: product.id,
        name: product.name,
        price: product.price,
        image: IMAGE_BASE + (product.images[0] || ""),
        quantity: 1,
        category: product.category,
        subcategory: product.subcategory
      }];

      localStorage.setItem("cart", JSON.stringify(buyNowCart));

      // Set intent
      localStorage.setItem("buyNow", "true");

      // Go straight to checkout
      window.location.href = "/cart/checkout.html";
    });
  }

  document.dispatchEvent(new Event("productLoaded"));
})();