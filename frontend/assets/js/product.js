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

  if ($(".product-title"))
    $(".product-title").textContent = product.name;

  if ($(".product-category"))
    $(".product-category").textContent = `${product.category} / ${product.subcategory}`;

  if ($(".product-price"))
    $(".product-price").textContent = "£" + product.price.toFixed(2);

  if ($(".product-desc"))
    $(".product-desc").textContent = product.description;

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

  const addBtn = document.querySelector(".btn-add");
  if (!addBtn) return;

  addBtn.addEventListener("click", () => {
    let cart = JSON.parse(localStorage.getItem("cart") || "[]").filter(i => i && i.id);

    const existing = cart.find(i => i.id === product.id);
    if (existing) {
      existing.quantity = (existing.quantity || 0) + 1;
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

    const badge = document.querySelector(".basket-qty");
    if (badge) {
      const totalQty = cart.reduce((sum, x) => sum + (x.quantity || 0), 0);
      badge.textContent = totalQty;
      badge.classList.remove("hide");
      badge.classList.add("bump");
      setTimeout(() => badge.classList.remove("bump"), 220);
    }

    console.log("✔ Added to basket:", product.name);
  });
})();
