async function loadLayout() {
  try {
   const headerRes = await fetch("./includes/header.html");
   const footerRes = await fetch("./includes/footer.html");


    if (!headerRes.ok || !footerRes.ok) throw new Error("Failed to load layout files");

    const headerHTML = await headerRes.text();
    const footerHTML = await footerRes.text();

    document.body.insertAdjacentHTML("afterbegin", headerHTML);
    document.body.insertAdjacentHTML("beforeend", footerHTML);

    // Back to Top functionality
    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".back-to-top");
      if (!btn) return;
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });

  } catch (err) {
    console.error("Layout load error:", err);
  }
}

loadLayout();
