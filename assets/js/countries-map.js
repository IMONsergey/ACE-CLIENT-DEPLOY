(() => {
  const root = document.querySelector('[data-countries-map]');
  const scene = root?.querySelector('[data-map-scene]');
  const connections = root?.querySelector('[data-map-connections]');
  const cards = [...(root?.querySelectorAll('[data-map-country]') ?? [])];
  const logos = [...(root?.querySelectorAll('[data-map-logo]') ?? [])];
  const desktop = window.matchMedia('(min-width: 1181px)');
  const svgNamespace = 'http://www.w3.org/2000/svg';

  if (!root || !scene || !connections || !cards.length || window.__AXE_COUNTRIES_MAP__) return;

  let activeCard = null;
  let linesEnabled = desktop.matches;
  let activeLogos = [];
  let paths = [];
  let hoveredCard = null;
  let lastInput = 'focus';
  let frame = 0;
  let suspended = false;
  let destroyed = false;
  const listeners = [];
  const transitions = new Map();

  function listen(target, type, handler, options) {
    if (!target?.addEventListener) return;
    target.addEventListener(type, handler, options);
    listeners.push(() => target.removeEventListener(type, handler, options));
  }

  function focusedCard() {
    return cards.find((card) => card === document.activeElement) ?? null;
  }

  function selectCard() {
    const focused = focusedCard();
    // Keyboard focus wins until the pointer enters another card. Leaving that
    // card restores the real focus, rather than clearing its connection.
    return lastInput === 'focus' && focused ? focused : hoveredCard ?? focused;
  }

  function activate(card) {
    if (activeCard === card && linesEnabled === desktop.matches) return;
    activeCard = card;
    linesEnabled = desktop.matches;
    const country = card?.dataset.mapCountry;
    cards.forEach((item) => item.classList.toggle('is-active', item === card));
    logos.forEach((logo) => logo.classList.toggle('is-active', Boolean(country) && logo.dataset.mapLogo === country));
    activeLogos = country ? logos.filter((logo) => logo.dataset.mapLogo === country) : [];
    paths = (linesEnabled ? activeLogos : []).map(() => {
      const path = document.createElementNS(svgNamespace, 'path');
      path.classList.add('countries-map__connection');
      return path;
    });
    // Reuse these path nodes during geometry updates: replacing them each
    // frame would continually restart their entry animation.
    connections.replaceChildren(...paths);
  }

  function drawConnections() {
    const sceneRect = scene.getBoundingClientRect();
    const width = scene.clientWidth;
    const height = scene.clientHeight;
    if (!width || !height || !sceneRect.width || !sceneRect.height) return;

    const viewBox = `0 0 ${width} ${height}`;
    if (connections.getAttribute('viewBox') !== viewBox) connections.setAttribute('viewBox', viewBox);
    if (connections.getAttribute('preserveAspectRatio') !== 'none') connections.setAttribute('preserveAspectRatio', 'none');

    // Measure in screen CSS pixels, including any ancestor reveal transform,
    // then convert back to this SVG's coordinates. The 6/9 px gaps therefore
    // remain exact during scaling, scrolling and viewport changes.
    const matrix = connections.getScreenCTM();
    if (!matrix || !Number.isFinite(matrix.a * matrix.d - matrix.b * matrix.c) ||
        Math.abs(matrix.a * matrix.d - matrix.b * matrix.c) < 1e-10) return;
    const inverse = matrix.inverse();
    const point = connections.createSVGPoint();
    function localPoint(x, y) {
      point.x = x;
      point.y = y;
      return point.matrixTransform(inverse);
    }

    const cardRect = activeCard.getBoundingClientRect();
    const headingRect = activeCard.querySelector('.countries-map__country-heading')?.getBoundingClientRect() ?? cardRect;
    const start = localPoint(cardRect.right + 6, headingRect.top + headingRect.height / 2);
    const bounds = activeLogos.map((logo) => logo.getBoundingClientRect());
    bounds.forEach((logoRect, index) => {
      const target = localPoint(logoRect.left - 9, logoRect.top + logoRect.height / 2);
      const span = Math.max(1, target.x - start.x);
      const offset = Math.min(112, Math.max(42, span * 0.2));
      const d = `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} C ${(start.x + offset).toFixed(2)} ${start.y.toFixed(2)}, ${(target.x - offset).toFixed(2)} ${target.y.toFixed(2)}, ${target.x.toFixed(2)} ${target.y.toFixed(2)}`;
      if (paths[index].getAttribute('d') !== d) paths[index].setAttribute('d', d);
    });
  }

  function scheduleUpdate() {
    if (!destroyed && !suspended && !document.hidden && !frame) frame = requestAnimationFrame(update);
  }

  function geometryChanged() {
    if (activeCard) scheduleUpdate();
  }

  function pruneTransitions(now) {
    transitions.forEach((properties, target) => {
      properties.forEach((deadline, property) => {
        if (deadline <= now) properties.delete(property);
      });
      if (!properties.size) transitions.delete(target);
    });
  }

  function update(now) {
    frame = 0;
    if (destroyed || suspended || document.hidden) return;
    pruneTransitions(now);
    activate(root.isConnected ? selectCard() : null);
    if (!activeCard || !linesEnabled) return;
    drawConnections();
    // No permanent animation loop. Only geometry transitions request another
    // frame; normal scroll/resize/font changes are coalesced into one update.
    if (transitions.size) scheduleUpdate();
  }

  function cancelFrame() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
  }

  const geometryProperty = /^(transform|translate|scale|rotate|grid-template-rows|grid-template-columns|width|height|min-width|max-width|min-height|max-height|top|right|bottom|left|font-size|line-height|padding(?:-.+)?|margin(?:-.+)?|gap|row-gap|column-gap)$/;
  const milliseconds = (value) => (Number.parseFloat(value) || 0) * (value.trim().endsWith('ms') ? 1 : 1000);

  function transitionBudget(target, property) {
    const style = getComputedStyle(target);
    const properties = style.transitionProperty.split(',').map((value) => value.trim());
    const durations = style.transitionDuration.split(',').map(milliseconds);
    const delays = style.transitionDelay.split(',').map(milliseconds);
    let budget = 0;
    properties.forEach((value, index) => {
      if (value === 'all' || value === property) {
        budget = Math.max(budget, durations[index % durations.length] + delays[index % delays.length]);
      }
    });
    // A cancelled/removed transition must never leave a live RAF loop.
    return Math.min(5000, Math.max(100, budget + 100));
  }

  listen(root, 'transitionrun', (event) => {
    if (!geometryProperty.test(event.propertyName)) return;
    const properties = transitions.get(event.target) ?? new Map();
    properties.set(event.propertyName, performance.now() + transitionBudget(event.target, event.propertyName));
    transitions.set(event.target, properties);
    geometryChanged();
  });
  const transitionFinished = (event) => {
    const properties = transitions.get(event.target);
    if (!properties?.delete(event.propertyName)) return;
    if (!properties.size) transitions.delete(event.target);
    geometryChanged();
  };
  listen(root, 'transitionend', transitionFinished);
  listen(root, 'transitioncancel', transitionFinished);

  cards.forEach((card) => {
    listen(card, 'pointerenter', (event) => {
      if (event.pointerType === 'touch') return;
      hoveredCard = card;
      lastInput = 'hover';
      scheduleUpdate();
    });
    const leave = () => {
      if (hoveredCard !== card) return;
      hoveredCard = null;
      lastInput = 'focus';
      scheduleUpdate();
    };
    listen(card, 'pointerleave', leave);
    listen(card, 'pointercancel', leave);
    listen(card, 'pointerup', (event) => {
      if (event.pointerType !== 'touch') return;
      hoveredCard = null;
      lastInput = 'focus';
      card.focus({ preventScroll: true });
      scheduleUpdate();
    });
    listen(card, 'focus', () => { lastInput = 'focus'; scheduleUpdate(); });
    listen(card, 'blur', scheduleUpdate);
  });

  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(geometryChanged) : null;
  const geometryTargets = [root, scene, root.querySelector('.countries-map__cards'), ...cards, ...logos,
    ...cards.map((card) => card.querySelector('.countries-map__country-heading'))];
  [...new Set(geometryTargets)].filter(Boolean).forEach((target) => resizeObserver?.observe(target));
  listen(root, 'load', geometryChanged, true);
  listen(window, 'resize', geometryChanged, { passive: true });
  listen(window, 'scroll', geometryChanged, { passive: true });
  listen(window.visualViewport, 'resize', geometryChanged, { passive: true });
  listen(window.visualViewport, 'scroll', geometryChanged, { passive: true });
  listen(document.fonts, 'loadingdone', geometryChanged);
  listen(document.fonts, 'loadingerror', geometryChanged);
  document.fonts?.ready.then(geometryChanged);

  listen(desktop, 'change', () => {
    hoveredCard = null;
    lastInput = 'focus';
    scheduleUpdate();
  });
  listen(document, 'pointerdown', (event) => {
    if (event.pointerType !== 'touch' || cards.some((card) => card.contains(event.target))) return;
    hoveredCard = null;
    lastInput = 'focus';
    focusedCard()?.blur();
    scheduleUpdate();
  }, { passive: true });
  listen(window, 'blur', () => {
    hoveredCard = null;
    lastInput = 'focus';
    scheduleUpdate();
  });
  listen(document, 'visibilitychange', () => {
    if (document.hidden) {
      hoveredCard = null;
      lastInput = 'focus';
      cancelFrame();
    }
    else scheduleUpdate();
  });

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    cancelFrame();
    resizeObserver?.disconnect();
    transitions.clear();
    listeners.splice(0).forEach((remove) => remove());
    activate(null);
    if (window.__AXE_COUNTRIES_MAP__ === api) delete window.__AXE_COUNTRIES_MAP__;
  }

  listen(window, 'pagehide', (event) => {
    if (!event.persisted) { destroy(); return; }
    suspended = true;
    hoveredCard = null;
    transitions.clear();
    cancelFrame();
  });
  listen(window, 'pageshow', () => {
    suspended = false;
    lastInput = 'focus';
    scheduleUpdate();
  });

  const api = {
    getState() {
      return {
        activeCountry: activeCard?.dataset.mapCountry ?? null,
        connections: connections.childElementCount,
        desktop: desktop.matches,
        logos: logos.length
      };
    },
    destroy
  };
  Object.defineProperty(window, '__AXE_COUNTRIES_MAP__', { configurable: true, value: api });
})();
