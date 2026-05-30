// sell4life-core/js/gallery-slider.js
(function () {

  /* ── Video URL parser ──────────────────────────────── */
  function parseVideo(url) {
    if (!url) return null;
    const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    if (yt) return {
      embed:  `https://www.youtube.com/embed/${yt[1]}?autoplay=1`,
      poster: `https://img.youtube.com/vi/${yt[1]}/mqdefault.jpg`,
    };
    const vim = url.match(/vimeo\.com\/(\d+)/);
    if (vim) return {
      embed:  `https://player.vimeo.com/video/${vim[1]}?autoplay=1`,
      poster: '',
    };
    if (/\.(mp4|webm|ogv)(\?.*)?$/i.test(url)) return {
      embed:  url,
      poster: '',
      direct: true,
    };
    return null;
  }

  /* ── Video helpers ─────────────────────────────────── */

  function stopSlideVideo(slide) {
    if (!slide || !slide.classList.contains('slide-video')) return;
    if (!slide.querySelector('iframe, video')) return;
    const poster = slide.dataset.videoPoster || '';
    slide.innerHTML = `
      <div class="slide-video-poster"${poster ? ` style="background-image:url('${poster}')"` : ''}>
        <button class="slide-video-play" aria-label="Play video">&#9654;</button>
      </div>`;
  }

  function playSlideVideo(slide) {
    if (!slide || !slide.classList.contains('slide-video')) return;
    if (slide.classList.contains('clone')) return;
    if (slide.querySelector('iframe, video')) return;
    const embed  = slide.dataset.videoEmbed;
    const direct = slide.dataset.videoDirect === '1';
    if (direct) {
      slide.innerHTML = `<video class="slide-video-el" src="${embed}" autoplay controls></video>`;
    } else {
      slide.innerHTML = `<iframe class="slide-video-iframe" src="${embed}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen frameborder="0"></iframe>`;
    }
  }

  function initSlider() {
    const hiddenGallery    = document.getElementById('hidden-gallery');
    const sliderTrack      = document.getElementById('sliderTrack');
    const thumbnailGallery = document.getElementById('thumbnailGallery');
    const nextBtn          = document.getElementById('main-next');
    const prevBtn          = document.getElementById('main-prev');

    if (!hiddenGallery || !sliderTrack || !thumbnailGallery) return;
    if (sliderTrack.dataset.inited === '1') return;

    const mediaItems = hiddenGallery.querySelectorAll('img, .video-slide-src');
    if (!mediaItems.length) return;

    sliderTrack.dataset.inited = '1';
    sliderTrack.innerHTML = '';
    thumbnailGallery.innerHTML = '';

    const getSrc = (img) => img.currentSrc || img.src || img.getAttribute('src');

    mediaItems.forEach((item, i) => {
      if (item.tagName === 'IMG') {
        const src = getSrc(item);
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

      } else {
        const url  = item.dataset.url;
        const info = parseVideo(url);
        if (!info) return;

        const slide = document.createElement('div');
        slide.className = 'slide-img slide-video';
        slide.dataset.videoEmbed  = info.embed;
        slide.dataset.videoDirect = info.direct ? '1' : '';
        slide.dataset.videoUrl    = url;
        slide.dataset.videoPoster = info.poster || '';
        slide.innerHTML = `
          <div class="slide-video-poster"${info.poster ? ` style="background-image:url('${info.poster}')"` : ''}>
            <button class="slide-video-play" aria-label="Play video">&#9654;</button>
          </div>`;
        sliderTrack.appendChild(slide);

        const thumb = document.createElement('div');
        thumb.className = 'thumb-img thumb-video';
        if (i === 0) thumb.classList.add('active-thumb');
        if (info.poster) thumb.style.backgroundImage = `url('${info.poster}')`;
        thumb.innerHTML = `<span class="thumb-video-icon">&#9654;</span>`;
        thumbnailGallery.appendChild(thumb);
      }
    });

    if (!sliderTrack.querySelector('.slide-img')) return;

    sliderTrack.addEventListener('click', (e) => {
      const slide = e.target.closest('.slide-video');
      if (!slide || slide.querySelector('iframe, video')) return;
      playSlideVideo(slide);
    });

    const H_BREAK = 1280;
    function applyThumbLayout() {
      const horizontal = window.innerWidth <= H_BREAK;
      if (!horizontal) { thumbnailGallery.classList.remove('overflowing'); return; }
      const isOverflowing = thumbnailGallery.scrollWidth > thumbnailGallery.clientWidth + 1;
      thumbnailGallery.classList.toggle('overflowing', isOverflowing);
      if (isOverflowing) thumbnailGallery.scrollLeft = 0;
    }
    applyThumbLayout();
    window.addEventListener('resize', applyThumbLayout);

    const wrapper = sliderTrack.parentElement;
    const slideW  = () => wrapper.clientWidth;

    let index  = 1;
    let slides = Array.from(sliderTrack.querySelectorAll('.slide-img'));

    const firstClone = slides[0].cloneNode(true);
    const lastClone  = slides[slides.length - 1].cloneNode(true);
    firstClone.classList.add('clone');
    lastClone.classList.add('clone');
    sliderTrack.appendChild(firstClone);
    sliderTrack.insertBefore(lastClone, slides[0]);
    slides = Array.from(sliderTrack.querySelectorAll('.slide-img'));

    const updateActiveThumb = (realIndex, smooth = false) => {
      const thumbs = thumbnailGallery.querySelectorAll('.thumb-img');
      thumbs.forEach((t) => t.classList.remove('active-thumb'));
      const active = thumbs[realIndex];
      if (!active) return;
      active.classList.add('active-thumb');

      // Always scroll so the active thumbnail is centred in the strip
      const behavior = smooth ? 'smooth' : 'auto';
      const isHorizontal = window.innerWidth <= 1280;

      if (isHorizontal) {
        const target = active.offsetLeft
          - (thumbnailGallery.offsetWidth / 2)
          + (active.offsetWidth           / 2);
        thumbnailGallery.scrollTo({ left: Math.max(0, target), behavior });
      } else {
        const target = active.offsetTop
          - (thumbnailGallery.offsetHeight / 2)
          + (active.offsetHeight           / 2);
        thumbnailGallery.scrollTo({ top: Math.max(0, target), behavior });
      }
    };

    const goTo = (i, animate = true) => {
      sliderTrack.style.transition = animate ? 'transform 0.3s ease' : 'none';
      sliderTrack.style.transform  = `translate3d(${-slideW() * i}px,0,0)`;
    };

    nextBtn && nextBtn.addEventListener('click', () => {
      if (index >= slides.length - 1) return;
      stopSlideVideo(slides[index]);
      index++;
      goTo(index);
      updateActiveThumb((index - 1) % (slides.length - 2), true);
    });

    prevBtn && prevBtn.addEventListener('click', () => {
      if (index <= 0) return;
      stopSlideVideo(slides[index]);
      index--;
      goTo(index);
      updateActiveThumb((index - 1 + (slides.length - 2)) % (slides.length - 2), true);
    });

    sliderTrack.addEventListener('transitionend', () => {
      if (!slides[index].classList.contains('clone')) {
        playSlideVideo(slides[index]);
        return;
      }
      index = (index === slides.length - 1) ? 1 : (slides.length - 2);
      goTo(index, false);
      updateActiveThumb((index - 1 + (slides.length - 2)) % (slides.length - 2));
      playSlideVideo(slides[index]);
    });

    thumbnailGallery.querySelectorAll('.thumb-img').forEach((thumb, i) => {
      let tapStartX = 0, tapStartY = 0;
      thumb.addEventListener('touchstart', (e) => {
        tapStartX = e.touches[0].clientX;
        tapStartY = e.touches[0].clientY;
      }, { passive: true });
      thumb.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - tapStartX;
        const dy = e.changedTouches[0].clientY - tapStartY;
        if (Math.abs(dx) < 12 && Math.abs(dy) < 12) {
          e.preventDefault();
          stopSlideVideo(slides[index]);
          index = i + 1;
          goTo(index);
          updateActiveThumb(i, true);
        }
      }, { passive: false });
      thumb.addEventListener('click', () => {
        stopSlideVideo(slides[index]);
        index = i + 1;
        goTo(index);
        updateActiveThumb(i, true);
      });
    });

    window.addEventListener('resize', () => {
      goTo(index, false);
      updateActiveThumb((index - 1 + (slides.length - 2)) % (slides.length - 2));
    });

    let startX = 0, startY = 0, isDragging = false, rafId = null, pendingDelta = 0;
    const swipeZone = wrapper;

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

      const realCount = slides.length - 2;
      const threshold = slideW() * 0.35;
      let liveIdx = index;
      if (pendingDelta < -threshold) liveIdx = index + 1;
      else if (pendingDelta > threshold) liveIdx = index - 1;
      liveIdx = Math.max(1, Math.min(liveIdx, slides.length - 2));
      updateActiveThumb(((liveIdx - 1) % realCount + realCount) % realCount);

      if (rafId === null) {
        rafId = requestAnimationFrame(() => {
          sliderTrack.style.transition = 'none';
          sliderTrack.style.transform  = `translate3d(${-(slideW() * index) + pendingDelta}px,0,0)`;
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
        stopSlideVideo(slides[index]);
        index += diff < 0 ? 1 : -1;
        index = Math.max(0, Math.min(index, slides.length - 1));
      }
      goTo(index);
      updateActiveThumb((index - 1 + (slides.length - 2)) % (slides.length - 2));
    }, { passive: true });

    // Double rAF ensures layout is complete before reading slideW()
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        goTo(index, false);
        thumbnailGallery.scrollLeft = 0;
        playSlideVideo(slides[index]);
      });
    });
  }

  document.addEventListener('productImagesLoaded', initSlider);
  document.addEventListener('DOMContentLoaded', () => { setTimeout(initSlider, 0); });
  setTimeout(initSlider, 0);

})();
