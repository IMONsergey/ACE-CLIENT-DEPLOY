(() => {
  const root = document.querySelector('[data-countries-map]');
  const scene = root?.querySelector('[data-map-scene]');
  const connections = root?.querySelector('[data-map-connections]');
  const cards = [...(root?.querySelectorAll('[data-map-country]') ?? [])];
  const desktop = window.matchMedia('(min-width: 901px)');
  const svgNamespace = 'http://www.w3.org/2000/svg';
  let activeCard = null;

  if (!root || !scene || !connections || !cards.length) return;

  function clearConnections() {
    connections.replaceChildren();
    cards.forEach((card) => card.classList.remove('is-active'));
    root.querySelectorAll('[data-map-logo]').forEach((logo) => logo.classList.remove('is-active'));
    activeCard = null;
  }

  function drawConnections(card) {
    if (!desktop.matches) {
      clearConnections();
      return;
    }

    const country = card.dataset.mapCountry;
    const logos = [...root.querySelectorAll(`[data-map-logo="${country}"]`)];
    const sceneRect = scene.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const headingRect = card.querySelector('.countries-map__country-heading')?.getBoundingClientRect() ?? cardRect;

    connections.replaceChildren();
    connections.setAttribute('viewBox', `0 0 ${sceneRect.width} ${sceneRect.height}`);
    connections.setAttribute('preserveAspectRatio', 'none');
    cards.forEach((item) => item.classList.toggle('is-active', item === card));
    root.querySelectorAll('[data-map-logo]').forEach((logo) => {
      logo.classList.toggle('is-active', logo.dataset.mapLogo === country);
    });

    const startX = cardRect.right - sceneRect.left + 6;
    const startY = headingRect.top + (headingRect.height / 2) - sceneRect.top;

    logos.forEach((logo) => {
      const logoRect = logo.getBoundingClientRect();
      const targetX = logoRect.left - sceneRect.left - 9;
      const targetY = logoRect.top + (logoRect.height / 2) - sceneRect.top;
      const span = Math.max(1, targetX - startX);
      const controlOffset = Math.min(112, Math.max(42, span * 0.2));
      const path = document.createElementNS(svgNamespace, 'path');
      path.classList.add('countries-map__connection');
      path.setAttribute('d', `M ${startX.toFixed(2)} ${startY.toFixed(2)} C ${(startX + controlOffset).toFixed(2)} ${startY.toFixed(2)}, ${(targetX - controlOffset).toFixed(2)} ${targetY.toFixed(2)}, ${targetX.toFixed(2)} ${targetY.toFixed(2)}`);
      connections.appendChild(path);
    });

    activeCard = card;
  }

  cards.forEach((card) => {
    card.addEventListener('pointerenter', () => drawConnections(card));
    card.addEventListener('pointerleave', () => {
      if (!card.matches(':focus-visible')) clearConnections();
    });
    card.addEventListener('focus', () => drawConnections(card));
    card.addEventListener('blur', clearConnections);
  });

  const resizeObserver = new ResizeObserver(() => {
    if (activeCard) drawConnections(activeCard);
  });
  resizeObserver.observe(scene);

  desktop.addEventListener?.('change', () => {
    if (!desktop.matches) clearConnections();
  });

  Object.defineProperty(window, '__AXE_COUNTRIES_MAP__', {
    configurable: true,
    value: {
      getState() {
        return {
          activeCountry: activeCard?.dataset.mapCountry ?? null,
          connections: connections.childElementCount,
          desktop: desktop.matches,
          logos: root.querySelectorAll('[data-map-logo]').length
        };
      }
    }
  });
})();
