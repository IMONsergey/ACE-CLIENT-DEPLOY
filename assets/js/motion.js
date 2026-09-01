(() => {
  const root = document.documentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const revealTargets = [];
  const wordTargets = [];
  let ready = false;
  let visibleCount = 0;

  function splitWords(element, step = 32, base = 0) {
    if (!element || element.dataset.motionSplit === 'true') return;

    const original = element.textContent.replace(/\s+/g, ' ').trim();
    if (!original) return;

    element.dataset.motionSplit = 'true';
    element.classList.add('motion-words');
    element.setAttribute('aria-label', original);
    element.textContent = '';

    const words = original.split(' ');
    words.forEach((word, index) => {
      if (index) element.appendChild(document.createTextNode(' '));

      const outer = document.createElement('span');
      outer.className = 'motion-word';
      outer.setAttribute('aria-hidden', 'true');

      const inner = document.createElement('span');
      inner.className = 'motion-word__inner';
      inner.style.setProperty('--word-delay', `${base + index * step}ms`);
      inner.textContent = word;

      outer.appendChild(inner);
      element.appendChild(outer);
    });

    wordTargets.push(element);
  }

  function registerReveal(element, options = {}) {
    if (!element || element.dataset.motionReveal === 'true') return;
    element.dataset.motionReveal = 'true';
    element.classList.add('motion-reveal');
    if (options.short) element.classList.add('motion-reveal--short');
    if (options.scale) element.classList.add('motion-reveal--scale');
    if (options.delay) element.style.setProperty('--motion-delay', `${options.delay}ms`);
    revealTargets.push(element);
  }

  function registerGroup(selector, options = {}) {
    const {
      base = 0,
      step = 42,
      maxDelay = 180,
      ...revealOptions
    } = options;

    document.querySelectorAll(selector).forEach((element, index) => {
      registerReveal(element, {
        ...revealOptions,
        delay: base + Math.min(index * step, maxDelay)
      });
    });
  }

  function reveal(element) {
    if (!element || element.classList.contains('is-visible')) return;
    element.classList.add('is-visible');
    visibleCount += 1;
  }

  function setupContent() {
    if (!reducedMotion.matches) {
      splitWords(document.querySelector('.hero__title'), 24, 60);
      splitWords(document.querySelector('.association-mosaic__about h2'), 28, 0);
      splitWords(document.querySelector('.countries-map__title'), 26, 0);
    }

    registerReveal(document.querySelector('.hero__copy'), { delay: 130 });
    registerReveal(document.querySelector('.hero__visual'), { delay: 70, scale: true });
    registerReveal(document.querySelector('.bids-promo'), { delay: 35, scale: true });

    registerReveal(document.querySelector('.association-mosaic'), { delay: 35, scale: true });
    registerReveal(document.querySelector('.goal-statement__label'), { delay: 15, short: true });
    registerReveal(document.querySelector('.goal-statement__title'), { delay: 55 });

    registerGroup('.tasks__header, .tasks__card', { short: true });
    registerGroup('.directions__header, .directions__card', { short: true });
    registerGroup('.timeline__header, .timeline__card', { short: true });
    registerGroup('.countries-map__desktop, .countries-map__mobile', { base: 35, scale: true });
    registerGroup('.events__header, .events__slide', { short: true });
    registerGroup('.leaders__header, .leader-card', { short: true });
    registerGroup('.governance__copy, .governance-person', { short: true });
    registerGroup('.members-section__header, .member-card', { short: true });
    registerGroup('.documents-section__inner > h2, .document-card', { short: true });
    registerGroup('.news-section__header, .news-card', { short: true });
    registerGroup('.membership-section h2, .membership-section__copy, .membership-document', { short: true });
    registerGroup('.contact-stage__inner > h2, .contact-form, .site-footer', { short: true });
  }

  function waitForSiteReady(callback) {
    const started = performance.now();

    function check() {
      const preloaderState = window.__AXE_PRELOADER__?.getState?.();
      if (root.classList.contains('is-ready') || preloaderState?.hidden || performance.now() - started > 13000) {
        callback();
        return;
      }
      requestAnimationFrame(check);
    }

    check();
  }

  function startObservers() {
    root.classList.add('motion-intro-visible');

    if (reducedMotion.matches || !('IntersectionObserver' in window)) {
      [...wordTargets, ...revealTargets].forEach(reveal);
      ready = true;
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        reveal(entry.target);
        observer.unobserve(entry.target);
      });
    }, {
      threshold: 0.08,
      rootMargin: '0px 0px -7% 0px'
    });

    [...wordTargets, ...revealTargets].forEach((element) => observer.observe(element));
    ready = true;
  }

  setupContent();
  root.classList.add('motion-ready');
  waitForSiteReady(startObservers);

  reducedMotion.addEventListener?.('change', () => {
    if (!reducedMotion.matches) return;
    root.classList.add('motion-intro-visible');
    [...wordTargets, ...revealTargets].forEach(reveal);
  });

  Object.defineProperty(window, '__AXE_MOTION__', {
    configurable: true,
    value: {
      getState() {
        return {
          ready,
          reducedMotion: reducedMotion.matches,
          revealTargets: revealTargets.length,
          wordTargets: wordTargets.length,
          visibleCount
        };
      }
    }
  });
})();
