console.log("search.js loaded");

(async function bindSearch() {

    // Wait for header to exist
    while (
        !document.querySelector("#header-search-form") ||
        !document.querySelector("#header-search-input") ||
        !document.querySelector(".search-autocomplete")
    ) {
        await new Promise(r => setTimeout(r, 20));
    }

    console.log("Binding search...");

    const form = document.querySelector("#header-search-form");
    const input = document.querySelector("#header-search-input");
    const box  = document.querySelector(".search-autocomplete");

    // SHOW / HIDE
    function hideBox() { box.classList.remove("show"); }
    function showBox() { box.classList.add("show"); }

    // LOAD PRODUCTS ONCE
    let products = [];
    try {
        const res = await fetch("/data/products.json", { cache: "no-store" });
        products = await res.json();
    } catch (err) {
        console.error("autocomplete load failed:", err);
    }

    // AUTOCOMPLETE
    input.addEventListener("input", () => {
        const q = input.value.trim().toLowerCase();
        if (!q) return hideBox();

        let matches = products.filter(p =>
            p.name.toLowerCase().includes(q) ||
            p.category.toLowerCase().includes(q) ||
            p.subcategory.toLowerCase().includes(q)
        ).slice(0, 8);

        if (!matches.length) return hideBox();

        box.innerHTML = matches.map(m => `
            <div class="ac-item" data-id="${m.id}">
                <img src="/assets/images/products/${m.images[0]}" class="ac-thumb" />
                <div class="ac-details">
                    <span class="ac-name">${m.name}</span>
                    <span class="ac-cat">${m.category} → ${m.subcategory}</span>
                </div>
            </div>
        `).join("");

        showBox();
    });

    // CLICK ITEM → OPEN PRODUCT
    box.addEventListener("click", e => {
        const item = e.target.closest(".ac-item");
        if (!item) return;
        window.location.href = `/product/product.html?id=${item.dataset.id}`;
    });

    // CLICK OUTSIDE → CLOSE BOX
    document.addEventListener("click", e => {
        if (!e.target.closest(".header-search")) hideBox();
    });

    // ENTER → GO TO SHOP SEARCH PAGE
    form.addEventListener("submit", e => {
        e.preventDefault();
        const term = input.value.trim();
        if (!term) return;
        window.location.href = `/shop/?q=${encodeURIComponent(term)}`;
    });

    console.log("Search ready.");
})();
