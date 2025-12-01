// /assets/js/layout.js
(async function loadLayout() {

    // 1. LOAD HEADER
    try {
        const headerRes = await fetch("/includes/header.html", { cache: "no-store" });
        const headerHTML = await headerRes.text();
        document.body.insertAdjacentHTML("afterbegin", headerHTML);

        // Header is ready → tell the world
        document.dispatchEvent(new Event("headerLoaded"));
    } catch (err) {
        console.error("Failed to load header:", err);
    }


    // 1B. LOAD MOBILE / TABLET HEADER
try {
    const mobRes = await fetch("/includes/header-mobile.html", { cache: "no-store" });
    const mobHTML = await mobRes.text();
    document.body.insertAdjacentHTML("afterbegin", mobHTML);
} catch (err) {
    console.error("Failed to load mobile header:", err);
}



    // 2. LOAD FOOTER
    try {
        const footerRes = await fetch("/includes/footer.html", { cache: "no-store" });
        const footerHTML = await footerRes.text();
        document.body.insertAdjacentHTML("beforeend", footerHTML);
    } catch (err) {
        console.error("Failed to load footer:", err);
    }

    // 3. LOAD CART JS ONCE
    if (!window.__cartScriptLoaded) {
        const c = document.createElement("script");
        c.src = "/assets/js/cart.js?v=9999";
        document.body.appendChild(c);
        window.__cartScriptLoaded = true;
    }

})();
 

// 4. LOAD SEARCH ONLY AFTER HEADER EXISTS
document.addEventListener("headerLoaded", () => {
    console.log("headerLoaded → injecting search.js");

    if (!window.__searchLoaded) {
        const s = document.createElement("script");
        s.src = "/assets/js/search.js?v=9999";
        document.body.appendChild(s);
        window.__searchLoaded = true;
    }
});
