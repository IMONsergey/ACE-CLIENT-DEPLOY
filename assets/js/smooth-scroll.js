(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let running = false;
  let targetY = window.scrollY;
  let finishTimer = 0;

  function finish() {
    running = false;
    window.clearTimeout(finishTimer);
    finishTimer = 0;
  }

  function targetForHash(hash) {
    if (!hash || hash === '#') return null;
    try {
      return document.getElementById(decodeURIComponent(hash.slice(1)));
    } catch {
      return null;
    }
  }

  function navigate(hash) {
    const target = targetForHash(hash);
    const behavior = reducedMotion.matches ? 'auto' : 'smooth';

    if (target) {
      const scrollMargin = Number.parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
      targetY = Math.max(0, target.getBoundingClientRect().top + window.scrollY - scrollMargin);
      target.scrollIntoView({ behavior, block: 'start' });
    } else {
      targetY = 0;
      window.scrollTo({ top: 0, behavior });
    }

    running = behavior === 'smooth';
    window.clearTimeout(finishTimer);
    finishTimer = window.setTimeout(finish, running ? 1800 : 0);
  }

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const link = event.target.closest('a[href]');
    if (!link || link.hasAttribute('download') || link.target === '_blank') return;

    const href = link.getAttribute('href');
    const pointsToTop = href === '#';
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin || url.pathname !== window.location.pathname || (!url.hash && !pointsToTop)) return;

    event.preventDefault();
    history.pushState(null, '', pointsToTop ? window.location.pathname : url.hash);
    navigate(pointsToTop ? '#' : url.hash);
  });

  window.addEventListener('scrollend', finish, { passive: true });

  Object.defineProperty(window, '__AXE_SMOOTH_SCROLL__', {
    configurable: true,
    value: {
      getState() {
        return {
          ready: true,
          enabled: !reducedMotion.matches,
          running,
          native: true,
          currentY: window.scrollY,
          targetY
        };
      },
      stop() {
        finish();
        window.scrollTo({ top: window.scrollY, behavior: 'auto' });
      }
    }
  });
})();
