// Lightbox for .gallery images: click to enlarge, arrows/swipe to browse, Esc to close.
(() => {
    const imgs = Array.from(document.querySelectorAll(".gallery img"));
    if (!imgs.length) return;

    const box = document.createElement("div");
    box.className = "lightbox";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", "Photo viewer");
    box.hidden = true;
    box.innerHTML = `
        <button class="lb-btn lb-close" aria-label="Close">✕</button>
        <button class="lb-btn lb-prev" aria-label="Previous photo">‹</button>
        <figure class="lb-figure">
            <img class="lb-img" alt="">
            <figcaption class="lb-count"></figcaption>
        </figure>
        <button class="lb-btn lb-next" aria-label="Next photo">›</button>`;
    document.body.appendChild(box);

    const big = box.querySelector(".lb-img");
    const count = box.querySelector(".lb-count");
    let index = 0;
    let lastFocus = null;

    function show(i) {
        index = (i + imgs.length) % imgs.length;
        big.src = imgs[index].src;
        big.alt = imgs[index].alt;
        count.textContent = `${index + 1} / ${imgs.length}`;
        // Preload neighbours so browsing feels instant
        [index - 1, index + 1].forEach((n) => { new Image().src = imgs[(n + imgs.length) % imgs.length].src; });
    }

    function open(i) {
        lastFocus = document.activeElement;
        show(i);
        box.hidden = false;
        document.body.classList.add("lb-open");
        box.querySelector(".lb-close").focus();
    }

    function close() {
        box.hidden = true;
        document.body.classList.remove("lb-open");
        if (lastFocus) lastFocus.focus();
    }

    imgs.forEach((img, i) => {
        img.tabIndex = 0;
        img.setAttribute("role", "button");
        img.addEventListener("click", () => open(i));
        img.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(i); }
        });
    });

    box.querySelector(".lb-close").addEventListener("click", close);
    box.querySelector(".lb-prev").addEventListener("click", () => show(index - 1));
    box.querySelector(".lb-next").addEventListener("click", () => show(index + 1));
    // Clicking the dark backdrop (not the photo or buttons) closes
    box.addEventListener("click", (e) => { if (e.target === box || e.target.classList.contains("lb-figure")) close(); });

    document.addEventListener("keydown", (e) => {
        if (box.hidden) return;
        if (e.key === "Escape") close();
        else if (e.key === "ArrowLeft") show(index - 1);
        else if (e.key === "ArrowRight") show(index + 1);
        else if (e.key === "Tab") {
            // Keep focus inside the viewer
            const btns = Array.from(box.querySelectorAll("button"));
            const at = btns.indexOf(document.activeElement);
            e.preventDefault();
            btns[(at + (e.shiftKey ? -1 : 1) + btns.length) % btns.length].focus();
        }
    });

    // Swipe on touch screens
    let startX = null;
    box.addEventListener("touchstart", (e) => { startX = e.touches[0].clientX; }, { passive: true });
    box.addEventListener("touchend", (e) => {
        if (startX === null) return;
        const dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) > 50) show(index + (dx < 0 ? 1 : -1));
        startX = null;
    });
})();
