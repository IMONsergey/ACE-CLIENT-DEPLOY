(() => {
  const loader = document.getElementById('site-preloader');
  const percent = loader?.querySelector('.preloader__percent');
  const bar = loader?.querySelector('.preloader__bar');

  if (!loader || !percent || !bar) {
    document.documentElement.classList.remove('is-loading');
    document.documentElement.classList.add('is-ready');
    return;
  }

  const start = performance.now();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const minimumVisible = reducedMotion ? 260 : 760;
  const fallbackAfter = 12000;

  const tasks = {
    dom: document.readyState !== 'loading',
    fonts: !document.fonts,
    dots: false,
    globe: Boolean(window.__AXE_GLOBE_READY__)
  };

  let shown = 0;
  let target = 0;
  let hidden = false;
  let forced = false;
  let frameId = 0;

  function allReady() {
    return tasks.dom && tasks.fonts && tasks.dots && tasks.globe;
  }

  function calculateTarget() {
    const weighted = (tasks.dom ? 12 : 0)
      + (tasks.fonts ? 14 : 0)
      + (tasks.dots ? 16 : 0)
      + (tasks.globe ? 52 : 0);

    target = Math.max(target, Math.min(94, weighted));

    if ((allReady() && performance.now() - start >= minimumVisible) || forced) {
      target = 100;
    }
  }

  function renderProgress(value) {
    const rounded = Math.max(0, Math.min(100, Math.round(value)));
    percent.textContent = `${rounded}%`;
    loader.style.setProperty('--loader-progress', String(rounded / 100));
  }

  function complete() {
    if (hidden) return;
    hidden = true;
    shown = 100;
    renderProgress(100);
    document.documentElement.classList.remove('is-loading');
    document.documentElement.classList.add('is-ready');
    loader.classList.add('is-complete');

    window.setTimeout(() => {
      loader.hidden = true;
    }, reducedMotion ? 0 : 520);
  }

  function tick(now) {
    tasks.dots = Boolean(window.__AXE_DOT_FIELD__?.getState?.().ready);
    tasks.globe = tasks.globe || Boolean(window.__AXE_GLOBE_READY__);

    if (!forced && now - start >= fallbackAfter) {
      forced = true;
    }

    calculateTarget();

    const distance = target - shown;
    const easing = target === 100 ? 0.16 : 0.075;
    shown += distance * easing;

    if (target < 100 && distance < 0.35) {
      shown = Math.min(target, shown + 0.08);
    }

    renderProgress(shown);

    if (target === 100 && shown >= 99.45) {
      complete();
      return;
    }

    frameId = requestAnimationFrame(tick);
  }

  if (!tasks.dom) {
    document.addEventListener('DOMContentLoaded', () => {
      tasks.dom = true;
      calculateTarget();
    }, { once: true });
  }

  document.fonts?.ready?.then(() => {
    tasks.fonts = true;
    calculateTarget();
  }).catch(() => {
    tasks.fonts = true;
    calculateTarget();
  });

  window.addEventListener('axe:globe-ready', () => {
    tasks.globe = true;
    calculateTarget();
  }, { once: true });

  window.addEventListener('axe:dot-field-ready', () => {
    tasks.dots = true;
    calculateTarget();
  }, { once: true });

  renderProgress(0);
  calculateTarget();
  frameId = requestAnimationFrame(tick);

  Object.defineProperty(window, '__AXE_PRELOADER__', {
    configurable: true,
    value: {
      getState() {
        return {
          shown: Math.round(shown),
          target,
          hidden,
          forced,
          tasks: { ...tasks },
          frame: frameId
        };
      }
    }
  });
})();
