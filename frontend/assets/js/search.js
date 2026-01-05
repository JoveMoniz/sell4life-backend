console.log("search.js loaded");

(async function bindSearch() {

    // Wait for both bars to exist
    while (
        !document.querySelector("#desktop-search-input") ||
        !document.querySelector("#mobile-search-input")
    ) {
        await new Promise(r => setTimeout(r, 20));
    }

    console.log("Binding search...");

    // Desktop selectors
    const desktop = {
        form: document.querySelector("#desktop-search-form"),
        input: document.querySelector("#desktop-search-input"),
        box: document.querySelector(".desktop-ac"),
        wrapper: document.querySelector("#desktop-search-form")
    };

    // Mobile selectors
    const mobile = {
        form: document.querySelector("#mobile-search-form"),
        input: document.querySelector("#mobile-search-input"),
        box: document.querySelector(".mobile-ac"),
        wrapper: document.querySelector("#mobile-search-form")
    };

    function hide(box) {
        if (box) box.classList.remove("show");
    }

    function show(box) {
        if (box) box.classList.add("show");
    }

    // Load product list
    let products = [];
    try {
        const res = await fetch("/data/products.json", { cache: "no-store" });
        products = await res.json();
    } catch (err) {
        console.error("Failed loading products.json:", err);
    }

    // Bind autocomplete to an input and its own box
    function bind(input, box, wrapper) {

        input.addEventListener("input", () => {
            const q = input.value.trim().toLowerCase();

            if (!q) return hide(box);

            const matches = products
                .filter(p =>
                    p.name.toLowerCase().includes(q) ||
                    p.category.toLowerCase().includes(q) ||
                    p.subcategory.toLowerCase().includes(q)
                )
                .slice(0, 8);

            if (!matches.length) return hide(box);

            box.innerHTML = matches.map(m => `
                <div class="ac-item" data-id="${m.id}">
                    <img src="/assets/images/products/${m.images[0]}" class="ac-thumb" />
                    <div class="ac-details">
                        <span class="ac-name">${m.name}</span>
                        <span class="ac-cat">${m.category} → ${m.subcategory}</span>
                    </div>
                </div>
            `).join("");

            show(box);
        });

        // Click on suggestion
        box.addEventListener("click", e => {
            const item = e.target.closest(".ac-item");
            if (!item) return;
            window.location.href = `/product/product.html?id=${item.dataset.id}`;
        });

        // Close only if click is outside THAT form AND outside THAT box
        document.addEventListener("click", e => {
            if (!wrapper.contains(e.target) && !box.contains(e.target)) {
                hide(box);
            }
        });
    }

    // Attach both search bars
    bind(desktop.input, desktop.box, desktop.wrapper);
    bind(mobile.input, mobile.box, mobile.wrapper);

    // Desktop submit
    desktop.form.addEventListener("submit", e => {
        e.preventDefault();
        const term = desktop.input.value.trim();
        if (term) window.location.href = `/shop/?q=${encodeURIComponent(term)}`;
    });

    // Mobile submit
    mobile.form.addEventListener("submit", e => {
        e.preventDefault();
        const term = mobile.input.value.trim();
        if (term) window.location.href = `/shop/?q=${encodeURIComponent(term)}`;
    });

    console.log("Search ready.");
})();
