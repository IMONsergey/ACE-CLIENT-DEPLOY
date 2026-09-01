const stage = document.querySelector('.visual-stage');
const canvas = stage?.querySelector('.visual-stage__dot-field');
const associationMosaic = stage?.querySelector('.association-mosaic');

if (stage && canvas) {
  const context = canvas.getContext('2d', { alpha: true, desynchronized: true });

  if (context) {
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const finePointerQuery = window.matchMedia('(hover: hover) and (pointer: fine)');

    const TWO_PI = Math.PI * 2;
    const POINTER_RADIUS = 168;
    const MAX_CANVAS_PIXELS = 8_000_000;

    let width = 1;
    let height = 1;
    let dpr = 1;
    let dots = [];
    let frameId = 0;
    let frameCount = 0;
    let lastFrame = performance.now();
    let resizeFrame = 0;

    const pointer = {
      clientX: 0,
      clientY: 0,
      x: 0,
      y: 0,
      target: 0,
      strength: 0,
      hasPosition: false
    };

    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

    function smoothstep(min, max, value) {
      const t = clamp((value - min) / (max - min), 0, 1);
      return t * t * (3 - 2 * t);
    }

    function createRandom(seed) {
      let state = seed >>> 0;
      return () => {
        state += 0x6D2B79F5;
        let value = state;
        value = Math.imul(value ^ (value >>> 15), value | 1);
        value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
      };
    }

    function parseHexColor(value) {
      const hex = value.trim().replace('#', '');
      if (/^[0-9a-f]{3}$/i.test(hex)) {
        return hex.split('').map((part) => parseInt(part + part, 16));
      }
      if (/^[0-9a-f]{6}$/i.test(hex)) {
        return [0, 2, 4].map((index) => parseInt(hex.slice(index, index + 2), 16));
      }
      return [47, 224, 253];
    }

    const dotColor = parseHexColor(
      getComputedStyle(stage).getPropertyValue('--cyan') || '#2fe0fd'
    );
    context.fillStyle = `rgb(${dotColor[0]} ${dotColor[1]} ${dotColor[2]})`;

    function regionEnvelope(y, offset) {
      const localY = y - offset;
      if (localY <= 24 || localY >= 1740) return 0;

      const fadeIn = smoothstep(30, 240, localY);
      const fadeOut = 1 - smoothstep(1260, 1740, localY);
      return fadeIn * fadeOut;
    }

    function getMiddleOffset() {
      if (!associationMosaic) return Math.min(890, height * 0.42);
      const stageRect = stage.getBoundingClientRect();
      const mosaicRect = associationMosaic.getBoundingClientRect();
      return clamp(mosaicRect.top - stageRect.top - 160, 720, Math.max(720, height - 900));
    }

    function buildDots() {
      const mobile = width <= 680;
      const tablet = width <= 900;
      const spacing = mobile ? 42 : tablet ? 38 : 34;
      const jitter = spacing * 0.14;
      const columns = Math.ceil(width / spacing) + 2;
      const rows = Math.ceil(height / spacing) + 2;
      const middleOffset = getMiddleOffset();
      const random = createRandom((0x41A7C3 ^ (columns * 73856093) ^ (rows * 19349663)) >>> 0);
      const nextDots = [];

      for (let row = -1; row < rows; row += 1) {
        for (let column = -1; column < columns; column += 1) {
          const x = column * spacing + (random() - 0.5) * jitter * 2;
          const y = row * spacing + (random() - 0.5) * jitter * 2;
          const envelope = Math.max(
            regionEnvelope(y, -46),
            regionEnvelope(y, middleOffset)
          );

          if (envelope < 0.018) continue;

          const prominent = random() > 0.92;
          const radius = prominent
            ? 1.65 + random() * 0.85
            : 0.72 + random() * 0.68;
          const alpha = (0.11 + random() * 0.13 + (prominent ? 0.04 : 0)) * envelope;

          nextDots.push({
            x,
            y,
            radius,
            alpha,
            envelope,
            phase: random() * TWO_PI,
            speed: 0.72 + random() * 0.52,
            breath: 0.08 + random() * 0.15
          });
        }
      }

      dots = nextDots;
    }

    function adaptiveDpr() {
      const requested = Math.min(window.devicePixelRatio || 1, 2);
      const area = Math.max(1, width * height);
      const areaLimit = Math.sqrt(MAX_CANVAS_PIXELS / area);
      return Math.max(1, Math.min(requested, areaLimit));
    }

    function updatePointerFromClient() {
      if (!pointer.hasPosition || !finePointerQuery.matches || motionQuery.matches) {
        pointer.target = 0;
        return;
      }

      const rect = stage.getBoundingClientRect();
      const inside = pointer.clientX >= rect.left
        && pointer.clientX <= rect.right
        && pointer.clientY >= rect.top
        && pointer.clientY <= rect.bottom;

      if (!inside) {
        pointer.target = 0;
        return;
      }

      pointer.x = pointer.clientX - rect.left;
      pointer.y = pointer.clientY - rect.top;
      pointer.target = 1;
    }

    function draw(now) {
      context.clearRect(0, 0, width, height);
      context.fillStyle = `rgb(${dotColor[0]} ${dotColor[1]} ${dotColor[2]})`;

      const reducedMotion = motionQuery.matches;
      const pointerRadiusSquared = POINTER_RADIUS * POINTER_RADIUS;

      for (let index = 0; index < dots.length; index += 1) {
        const dot = dots[index];
        const wave = reducedMotion
          ? 0
          : Math.sin(now * 0.00055 * dot.speed + dot.phase);
        let radius = dot.radius * (1 + wave * dot.breath);
        let alpha = dot.alpha * (1 + wave * 0.13);
        let pointerInfluence = 0;

        if (pointer.strength > 0.002) {
          const dx = dot.x - pointer.x;
          const dy = dot.y - pointer.y;

          if (Math.abs(dx) < POINTER_RADIUS && Math.abs(dy) < POINTER_RADIUS) {
            const distanceSquared = dx * dx + dy * dy;
            if (distanceSquared < pointerRadiusSquared) {
              const distance = Math.sqrt(distanceSquared);
              let influence = 1 - distance / POINTER_RADIUS;
              influence = influence * influence * pointer.strength;
              pointerInfluence = influence;
              radius += influence * 0.86;
              alpha += influence * 0.17 * dot.envelope;
            }
          }
        }

        if (alpha <= 0.003 || radius <= 0) continue;

        context.globalAlpha = Math.min(0.42 + pointerInfluence * 0.11, alpha);
        context.beginPath();
        context.arc(dot.x, dot.y, radius, 0, TWO_PI);
        context.fill();
      }

      context.globalAlpha = 1;
      frameCount += 1;
    }

    function frame(now) {
      const delta = Math.min(64, Math.max(1, now - lastFrame));
      lastFrame = now;

      const pointerFollow = 1 - Math.exp(-delta / 120);
      pointer.strength += (pointer.target - pointer.strength) * pointerFollow;

      draw(now);
      frameId = requestAnimationFrame(frame);
    }

    function startAnimation() {
      if (motionQuery.matches || document.hidden || frameId) return;
      lastFrame = performance.now();
      frameId = requestAnimationFrame(frame);
    }

    function stopAnimation() {
      if (!frameId) return;
      cancelAnimationFrame(frameId);
      frameId = 0;
    }

    function resizeCanvas() {
      resizeFrame = 0;
      const rect = stage.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width));
      height = Math.max(1, Math.round(rect.height));
      dpr = adaptiveDpr();

      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);

      buildDots();
      updatePointerFromClient();
      draw(performance.now());
      canvas.dataset.dotFieldReady = 'true';
    }

    function scheduleResize() {
      if (resizeFrame) return;
      resizeFrame = requestAnimationFrame(resizeCanvas);
    }

    function handlePointerMove(event) {
      pointer.clientX = event.clientX;
      pointer.clientY = event.clientY;
      pointer.hasPosition = event.pointerType !== 'touch';
      updatePointerFromClient();
    }

    function resetPointer() {
      pointer.target = 0;
    }

    function handleScroll() {
      pointer.target = 0;
    }

    function handleMotionPreference() {
      pointer.target = 0;
      pointer.strength = 0;

      if (motionQuery.matches) {
        stopAnimation();
        draw(performance.now());
      } else {
        startAnimation();
      }
    }

    function handleVisibility() {
      if (document.hidden) {
        stopAnimation();
      } else if (!motionQuery.matches) {
        startAnimation();
      }
    }

    const resizeObserver = new ResizeObserver(scheduleResize);
    resizeObserver.observe(stage);

    window.addEventListener('resize', scheduleResize, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('blur', resetPointer);
    document.addEventListener('mouseleave', resetPointer);
    document.addEventListener('visibilitychange', handleVisibility);
    motionQuery.addEventListener?.('change', handleMotionPreference);
    finePointerQuery.addEventListener?.('change', updatePointerFromClient);

    resizeCanvas();
    startAnimation();

    Object.defineProperty(window, '__AXE_DOT_FIELD__', {
      configurable: true,
      value: {
        getState() {
          return {
            ready: canvas.dataset.dotFieldReady === 'true',
            frame: frameCount,
            dots: dots.length,
            width,
            height,
            dpr,
            reducedMotion: motionQuery.matches,
            pointerStrength: pointer.strength
          };
        }
      }
    });

    window.dispatchEvent(new Event('axe:dot-field-ready'));
  }
}
