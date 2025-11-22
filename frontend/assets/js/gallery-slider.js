// sell4life-core/js/gallery-slider.js
(function () {
  function initSlider() {
    const hiddenGallery   = document.getElementById('hidden-gallery');
    const sliderTrack     = document.getElementById('sliderTrack');
    const thumbnailGallery = document.getElementById('thumbnailGallery');
    const nextBtn         = document.getElementById('main-next');
    const prevBtn         = document.getElementById('main-prev');

    if (!hiddenGallery || !sliderTrack || !thumbnailGallery) return;
    if (sliderTrack.dataset.inited === '1') return;
    sliderTrack.dataset.inited = '1';

    const images = hiddenGallery.querySelectorAll('img');
    if (!images.length) return;

    sliderTrack.innerHTML = '';
    thumbnailGallery.innerHTML = '';

    const getSrc = (img) => img.currentSrc || img.src || img.getAttribute('src');

    images.forEach((img, i) => {
      const src = getSrc(img);
      if (!src) return;

      const slide = document.createElement('img');
      slide.src = src;
      slide.className = 'slide-img';
      sliderTrack.appendChild(slide);

      const thumb = document.createElement('img');
      thumb.src = src;
      thumb.className = 'thumb-img';
      if (i === 0) thumb.classList.add('active-thumb');
      thumbnailGallery.appendChild(thumb);
    });

    if (!sliderTrack.querySelector('.slide-img')) return;

    const H_BREAK = 1280;
    function applyThumbLayout() {
      const horizontal = window.innerWidth <= H_BREAK;
      if (!horizontal) {
        thumbnailGallery.classList.remove('overflowing');
        return;
      }
      const isOverflowing = thumbnailGallery.scrollWidth > thumbnailGallery.clientWidth + 1;
      thumbnailGallery.classList.toggle('overflowing', isOverflowing);
      if (isOverflowing) thumbnailGallery.scrollLeft = 0;
    }
    applyThumbLayout();
    window.addEventListener('resize', applyThumbLayout);

    const trackWidth = () => sliderTrack.getBoundingClientRect().width;

    let index = 1;
    let slides = Array.from(sliderTrack.querySelectorAll('.slide-img'));
    let slideWidth = trackWidth();

    const firstClone = slides[0].cloneNode(true);
    const lastClone = slides[slides.length - 1].cloneNode(true);
    firstClone.classList.add('clone');
    lastClone.classList.add('clone');
    sliderTrack.appendChild(firstClone);
    sliderTrack.insertBefore(lastClone, slides[0]);
    slides = Array.from(sliderTrack.querySelectorAll('.slide-img'));

    const updateActiveThumb = (realIndex) => {
      const thumbs = thumbnailGallery.querySelectorAll('.thumb-img');
      thumbs.forEach((t) => t.classList.remove('active-thumb'));
      const active = thumbs[realIndex];
      if (!active) return;
      active.classList.add('active-thumb');

      const isHorizontal = window.innerWidth <= 1280;
      const thumbStart = isHorizontal ? active.offsetLeft : active.offsetTop;
      const thumbSize = isHorizontal ? active.offsetWidth : active.offsetHeight;
      const galleryScroll = isHorizontal ? thumbnailGallery.scrollLeft : thumbnailGallery.scrollTop;
      const gallerySize = isHorizontal ? thumbnailGallery.offsetWidth : thumbnailGallery.offsetHeight;

      if (isHorizontal && realIndex === 0 && galleryScroll === 0) return;

      if (thumbStart < galleryScroll) {
        isHorizontal ? (thumbnailGallery.scrollLeft = thumbStart) : (thumbnailGallery.scrollTop = thumbStart);
      } else if (thumbStart + thumbSize > galleryScroll + gallerySize) {
        const scrollTo = thumbStart - gallerySize + thumbSize;
        isHorizontal ? (thumbnailGallery.scrollLeft = scrollTo) : (thumbnailGallery.scrollTop = scrollTo);
      }
    };

    const moveToSlide = () => {
      slideWidth = trackWidth();
      sliderTrack.style.transition = 'transform 0.3s ease';
      sliderTrack.style.transform = `translate3d(${-slideWidth * index}px,0,0)`;
    };

    nextBtn && nextBtn.addEventListener('click', () => {
      if (index >= slides.length - 1) return;
      index++;
      moveToSlide();
      updateActiveThumb((index - 1) % (slides.length - 2));
    });

    prevBtn && prevBtn.addEventListener('click', () => {
      if (index <= 0) return;
      index--;
      moveToSlide();
      updateActiveThumb((index - 1 + (slides.length - 2)) % (slides.length - 2));
    });

    sliderTrack.addEventListener('transitionend', () => {
      if (!slides[index].classList.contains('clone')) return;
      sliderTrack.style.transition = 'none';
      index = (index === slides.length - 1) ? 1 : (slides.length - 2);
      sliderTrack.style.transform = `translate3d(${-trackWidth() * index}px,0,0)`;
      updateActiveThumb((index - 1 + (slides.length - 2)) % (slides.length - 2));
    });

    thumbnailGallery.querySelectorAll('.thumb-img').forEach((thumb, i) => {
      thumb.addEventListener('click', () => {
        index = i + 1;
        moveToSlide();
        updateActiveThumb(i);
      }, { passive: true });
    });

    window.addEventListener('resize', () => {
      sliderTrack.style.transition = 'none';
      sliderTrack.style.transform = `translate3d(${-trackWidth() * index}px,0,0)`;
      updateActiveThumb((index - 1 + (slides.length - 2)) % (slides.length - 2));
    });

    let startX = 0, startY = 0, isDragging = false, rafId = null, pendingDelta = 0;
    const swipeZone = sliderTrack.parentElement || sliderTrack;

    swipeZone.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      isDragging = true;
    }, { passive: true });

    swipeZone.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (Math.abs(dy) > Math.abs(dx)) { isDragging = false; return; }
      e.preventDefault();
      pendingDelta = dx;
      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          sliderTrack.style.transition = 'none';
          const translateX = -(trackWidth() * index) + pendingDelta;
          sliderTrack.style.transform = `translate3d(${translateX}px,0,0)`;
          rafId = null;
        });
      }
    }, { passive: false });

    swipeZone.addEventListener('touchend', (e) => {
      if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
      if (!isDragging) return;
      isDragging = false;
      const diff = e.changedTouches[0].clientX - startX;
      if (Math.abs(diff) > 50) {
        index += diff < 0 ? 1 : -1;
        index = Math.max(0, Math.min(index, slides.length - 1));
      }
      moveToSlide();
      updateActiveThumb((index - 1 + (slides.length - 2)) % (slides.length - 2));
    }, { passive: true });

    sliderTrack.style.transition = 'none';
    sliderTrack.style.transform = `translate3d(${-trackWidth() * index}px,0,0)`;
    thumbnailGallery.scrollLeft = 0;
  }

// Re-init the slider when product.js finishes injecting images
document.addEventListener("productImagesLoaded", initSlider);
})();
