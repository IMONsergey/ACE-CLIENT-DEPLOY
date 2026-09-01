(() => {
  document.querySelectorAll('[data-responsive-slider]').forEach((root) => {
    const slides = [...root.querySelectorAll('[data-slider-slide]')];
    const controls = root.previousElementSibling?.querySelector('[data-slider-controls]') ?? root.querySelector('[data-slider-controls]');
    const previous = controls?.querySelector('[data-slider-previous]');
    const next = controls?.querySelector('[data-slider-next]');
    const advanceButtons = [...root.querySelectorAll('[data-slider-advance]')];
    const breakpoint = Number(root.dataset.sliderBreakpoint) || 780;
    const mobile = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const trackMode = root.dataset.sliderMode === 'track';
    const responsiveTrackMode = root.dataset.sliderMode === 'responsive-track';
    const mobileTrackMode = root.dataset.sliderMode === 'mobile-track';
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let activeIndex = 0;
    let touchStartX = null;
    let scrollSyncTimer = null;
    let resizeFrame = null;
    let transitionTimer = null;
    let transitionCleanup = null;

    function isTrackMode() {
      return trackMode || (responsiveTrackMode && !mobile.matches) || (mobileTrackMode && mobile.matches);
    }

    function getTrackStops() {
      if (!isTrackMode() || !slides.length) return [];

      const firstOffset = slides[0].offsetLeft;
      const maximum = Math.max(0, root.scrollWidth - root.clientWidth);
      const stride = slides[1] ? slides[1].offsetLeft - firstOffset : slides[0].offsetWidth;
      const mergeDistance = Math.max(1, stride * 0.5);
      const stops = [];

      slides.forEach((slide, index) => {
        if (stops.at(-1)?.left === maximum) return;
        const natural = Math.max(0, slide.offsetLeft - firstOffset);
        if (maximum - natural <= mergeDistance) {
          stops.push({ left: maximum, slideIndex: slides.length - 1 });
          return;
        }
        stops.push({ left: natural, slideIndex: index });
      });

      if (stops.at(-1)?.left !== maximum) {
        stops.push({ left: maximum, slideIndex: slides.length - 1 });
      }

      return stops.filter((stop, index) => index === 0 || Math.abs(stop.left - stops[index - 1].left) > 1);
    }

    function setActiveSlide(slideIndex, options = {}) {
      const usesSingleSlide = !isTrackMode() && mobile.matches;
      const animate = options.animate && usesSingleSlide && !reducedMotion.matches;

      if (transitionTimer) {
        window.clearTimeout(transitionTimer);
        transitionTimer = null;
      }
      transitionCleanup?.();
      transitionCleanup = null;

      if (animate) {
        const previousSlide = slides.find((slide) => slide.classList.contains('is-active'));
        const nextSlide = slides[slideIndex];

        if (previousSlide && nextSlide && previousSlide !== nextSlide) {
          const rootStyles = {
            minHeight: root.style.minHeight,
            position: root.style.position,
            overflow: root.style.overflow
          };
          const rootPosition = window.getComputedStyle(root).position;
          const rootRect = root.getBoundingClientRect();
          const slideRect = previousSlide.getBoundingClientRect();
          const slideTop = slideRect.top - rootRect.top;
          const slideLeft = slideRect.left - rootRect.left;
          const slideWidth = previousSlide.offsetWidth;
          const rootHeight = root.offsetHeight;

          root.classList.add('is-slider-transitioning');
          root.style.minHeight = `${rootHeight}px`;
          root.style.overflow = 'hidden';
          if (rootPosition === 'static') root.style.position = 'relative';

          previousSlide.classList.add('is-slider-leaving');
          previousSlide.classList.remove('is-slider-entering');
          nextSlide.hidden = false;
          nextSlide.setAttribute('aria-hidden', 'false');
          nextSlide.classList.add('is-active', 'is-slider-entering');
          nextSlide.classList.remove('is-slider-leaving');

          [previousSlide, nextSlide].forEach((slide, index) => {
            slide.style.position = 'absolute';
            slide.style.top = `${slideTop}px`;
            slide.style.left = `${slideLeft}px`;
            slide.style.width = `${slideWidth}px`;
            slide.style.zIndex = String(index + 1);
          });

          const previousAnimation = previousSlide.animate?.([
            { opacity: 1, transform: 'translate3d(0, 0, 0)' },
            { opacity: 0, transform: 'translate3d(-12px, 0, 0)' }
          ], {
            duration: 260,
            easing: 'cubic-bezier(.4, 0, .2, 1)',
            fill: 'forwards'
          });

          const nextAnimation = nextSlide.animate?.([
            { opacity: 0, transform: 'translate3d(18px, 0, 0)' },
            { opacity: 1, transform: 'translate3d(0, 0, 0)' }
          ], {
            duration: 420,
            easing: 'cubic-bezier(.16, .84, .24, 1)',
            fill: 'forwards'
          });

          transitionCleanup = () => {
            root.classList.remove('is-slider-transitioning');
            root.style.minHeight = rootStyles.minHeight;
            root.style.position = rootStyles.position;
            root.style.overflow = rootStyles.overflow;
            [previousSlide, nextSlide].forEach((slide) => {
              slide.style.position = '';
              slide.style.top = '';
              slide.style.left = '';
              slide.style.width = '';
              slide.style.zIndex = '';
            });
          };

          transitionTimer = window.setTimeout(() => {
            previousAnimation?.cancel();
            nextAnimation?.cancel();
            transitionCleanup?.();
            transitionCleanup = null;
            slides.forEach((slide, index) => {
              const isActive = index === slideIndex;
              slide.classList.toggle('is-active', isActive);
              slide.hidden = !isActive;
              slide.setAttribute('aria-hidden', isActive ? 'false' : 'true');
              slide.classList.remove('is-slider-entering', 'is-slider-leaving');
            });
            transitionTimer = null;
          }, 430);
          return;
        }
      }

      slides.forEach((slide, index) => {
        const isActive = index === slideIndex;
        slide.classList.toggle('is-active', isActive);
        slide.classList.remove('is-slider-entering', 'is-slider-leaving');
        slide.hidden = !isTrackMode() && mobile.matches && !isActive;
        slide.setAttribute('aria-hidden', !isTrackMode() && mobile.matches && !isActive ? 'true' : 'false');
      });
    }

    function render(options = {}) {
      if (isTrackMode()) {
        const stops = getTrackStops();
        activeIndex = Math.min(activeIndex, Math.max(0, stops.length - 1));
        const stop = stops[activeIndex] ?? { left: 0, slideIndex: 0 };
        setActiveSlide(stop.slideIndex);
        root.scrollTo({
          left: stop.left,
          behavior: reducedMotion.matches ? 'auto' : 'smooth'
        });
        return;
      }

      if (responsiveTrackMode || mobileTrackMode) root.scrollTo({ left: 0, behavior: 'auto' });
      setActiveSlide(activeIndex, options);
    }

    function move(step) {
      const itemCount = isTrackMode() ? getTrackStops().length : slides.length;
      if (!itemCount) return;
      activeIndex = (activeIndex + step + itemCount) % itemCount;
      render({ animate: true });
    }

    function syncTrackPosition() {
      if (!isTrackMode()) return;
      const stops = getTrackStops();
      if (!stops.length) return;
      activeIndex = stops.reduce((closest, stop, index) => (
        Math.abs(stop.left - root.scrollLeft) < Math.abs(stops[closest].left - root.scrollLeft) ? index : closest
      ), 0);
      setActiveSlide(stops[activeIndex].slideIndex);
    }

    previous?.addEventListener('click', () => move(-1));
    next?.addEventListener('click', () => move(1));
    advanceButtons.forEach((button) => button.addEventListener('click', () => move(1)));
    mobile.addEventListener?.('change', render);

    if (trackMode || responsiveTrackMode || mobileTrackMode) {
      root.addEventListener('scroll', () => {
        window.clearTimeout(scrollSyncTimer);
        scrollSyncTimer = window.setTimeout(syncTrackPosition, 100);
      }, { passive: true });

      window.addEventListener('resize', () => {
        window.cancelAnimationFrame(resizeFrame);
        resizeFrame = window.requestAnimationFrame(render);
      }, { passive: true });
    }

    root.addEventListener('touchstart', (event) => {
      touchStartX = event.touches[0]?.clientX ?? null;
    }, { passive: true });

    root.addEventListener('touchend', (event) => {
      if (touchStartX === null) return;
      const touchEndX = event.changedTouches[0]?.clientX ?? touchStartX;
      const distance = touchEndX - touchStartX;
      touchStartX = null;
      if (Math.abs(distance) < 45) return;
      move(distance > 0 ? -1 : 1);
    }, { passive: true });

    render();
  });
})();
