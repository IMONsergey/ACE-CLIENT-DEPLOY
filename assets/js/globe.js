import LAND_DATA from './globe-land-data.js';
import {
  GLOBE_STYLE,
  GLOBE_VIEW,
  clamp,
  pointAppearance,
  prepareLandPoints,
  projectPoint,
  wrapPi
} from './globe-model.js';

const canvas = document.getElementById('axe-globe');
const globeShell = document.querySelector('.hero__globe-shell');

if (canvas && globeShell) {
  const context = canvas.getContext('2d', { alpha: true });
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const renderQuery = window.matchMedia('(min-width: 901px)');
  const landModel = prepareLandPoints(LAND_DATA);
  const landPoints = landModel.points;

  let phi = GLOBE_VIEW.phi;
  let theta = GLOBE_VIEW.theta;
  let targetPhi = phi;
  let targetTheta = theta;
  let velocityPhi = 0;
  let velocityTheta = 0;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let resumeAt = performance.now() + 1200;
  let lastFrame = performance.now();
  let readyDispatched = false;
  let animationFrame = 0;

  const DRAG_SENSITIVITY = 0.0030;
  const DRAG_INERTIA_FACTOR = 0.28;
  const ROTATION_SMOOTHING = 0.16;
  const INERTIA = 0.87;
  const AUTO_RESUME_DELAY = 1600;
  const AUTO_SPEED = reducedMotion ? 0.008 : 0.075;
  const VERTICAL_LIMIT = 68 * Math.PI / 180;

  function canvasSize() {
    const rect = canvas.getBoundingClientRect();
    return Math.max(1, Math.round(Math.min(rect.width, rect.height)));
  }

  function resizeCanvas() {
    const size = canvasSize();
    const pixelSize = Math.max(1, Math.round(size * dpr));

    if (canvas.width !== pixelSize || canvas.height !== pixelSize) {
      canvas.width = pixelSize;
      canvas.height = pixelSize;
    }

    return size;
  }

  function drawGlobe(size) {
    if (!context) return;

    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const radius = size * GLOBE_STYLE.radiusRatio;

    const glow = context.createRadialGradient(cx, cy, radius * 0.84, cx, cy, radius * 1.04);
    glow.addColorStop(0, GLOBE_STYLE.glow[0]);
    glow.addColorStop(0.82, GLOBE_STYLE.glow[1]);
    glow.addColorStop(0.97, GLOBE_STYLE.glow[2]);
    glow.addColorStop(1, GLOBE_STYLE.glow[3]);
    context.fillStyle = glow;
    context.beginPath();
    context.arc(cx, cy, radius * 1.04, 0, Math.PI * 2);
    context.fill();

    const sphere = context.createRadialGradient(
      cx - radius * 0.24,
      cy - radius * 0.22,
      radius * 0.07,
      cx,
      cy,
      radius
    );
    sphere.addColorStop(0, GLOBE_STYLE.sphere[0]);
    sphere.addColorStop(0.56, GLOBE_STYLE.sphere[1]);
    sphere.addColorStop(1, GLOBE_STYLE.sphere[2]);
    context.fillStyle = sphere;
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.fill();

    for (const point of landPoints) {
      const projected = projectPoint(point, phi, theta);
      if (projected.z <= 0.012) continue;

      const appearance = pointAppearance(projected.z, size);
      const px = cx + radius * projected.x;
      const py = cy - radius * projected.y;

      context.fillStyle = `rgba(${GLOBE_STYLE.dot[0]}, ${GLOBE_STYLE.dot[1]}, ${GLOBE_STYLE.dot[2]}, ${appearance.alpha.toFixed(3)})`;
      context.beginPath();
      context.arc(px, py, appearance.radius, 0, Math.PI * 2);
      context.fill();
    }

    context.strokeStyle = GLOBE_STYLE.outline;
    context.lineWidth = Math.max(0.65, size / 1000);
    context.beginPath();
    context.arc(cx, cy, radius, 0, Math.PI * 2);
    context.stroke();
  }

  function markReady() {
    if (readyDispatched) return;
    readyDispatched = true;
    requestAnimationFrame(() => {
      canvas.dataset.globeReady = 'true';
      window.__AXE_GLOBE_READY__ = true;
      window.dispatchEvent(new Event('axe:globe-ready'));
    });
  }

  if ('ResizeObserver' in window) {
    const resizeObserver = new ResizeObserver(() => {
      if (renderQuery.matches) resizeCanvas();
    });
    resizeObserver.observe(globeShell);
  }
  window.addEventListener('resize', () => {
    if (renderQuery.matches) resizeCanvas();
  }, { passive: true });
  document.fonts?.ready?.then(() => {
    if (renderQuery.matches) resizeCanvas();
  });

  canvas.addEventListener('pointerdown', (event) => {
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    targetPhi = phi;
    targetTheta = theta;
    velocityPhi = 0;
    velocityTheta = 0;
    resumeAt = Infinity;
    canvas.setPointerCapture?.(event.pointerId);
  });

  canvas.addEventListener('pointermove', (event) => {
    if (!dragging) return;

    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;

    const dragScale = 420 / Math.max(340, canvas.clientWidth);
    const deltaPhi = -dx * DRAG_SENSITIVITY * dragScale;
    const deltaTheta = dy * DRAG_SENSITIVITY * dragScale;

    targetPhi = wrapPi(targetPhi + deltaPhi);
    targetTheta = clamp(targetTheta + deltaTheta, -VERTICAL_LIMIT, VERTICAL_LIMIT);
    velocityPhi = deltaPhi * DRAG_INERTIA_FACTOR;
    velocityTheta = deltaTheta * DRAG_INERTIA_FACTOR;
  });

  function finishDrag(event) {
    if (!dragging) return;
    dragging = false;
    resumeAt = performance.now() + AUTO_RESUME_DELAY;
    canvas.releasePointerCapture?.(event.pointerId);
  }

  canvas.addEventListener('pointerup', finishDrag);
  canvas.addEventListener('pointercancel', finishDrag);
  canvas.addEventListener('lostpointercapture', () => {
    if (!dragging) return;
    dragging = false;
    resumeAt = performance.now() + AUTO_RESUME_DELAY;
  });

  function frame(now) {
    animationFrame = 0;
    if (!renderQuery.matches) return;

    const dt = Math.min(50, now - lastFrame);
    lastFrame = now;

    if (!dragging) {
      targetPhi = wrapPi(targetPhi + velocityPhi);
      targetTheta = clamp(targetTheta + velocityTheta, -VERTICAL_LIMIT, VERTICAL_LIMIT);

      velocityPhi *= Math.pow(INERTIA, dt / 16.67);
      velocityTheta *= Math.pow(INERTIA, dt / 16.67);

      if (Math.abs(velocityPhi) < 0.00001) velocityPhi = 0;
      if (Math.abs(velocityTheta) < 0.00001) velocityTheta = 0;

      if (now > resumeAt && Math.abs(velocityPhi) < 0.00035 && Math.abs(velocityTheta) < 0.00035) {
        targetPhi = wrapPi(targetPhi + AUTO_SPEED * dt / 1000);
      }
    }

    const follow = 1 - Math.pow(1 - ROTATION_SMOOTHING, dt / 16.67);
    const phiDelta = wrapPi(targetPhi - phi);
    phi = wrapPi(phi + phiDelta * follow);
    theta += (targetTheta - theta) * follow;

    const size = resizeCanvas();
    drawGlobe(size);
    if (size > 24) markReady();
    animationFrame = requestAnimationFrame(frame);
  }

  function syncRendering() {
    if (!renderQuery.matches) {
      if (animationFrame) cancelAnimationFrame(animationFrame);
      animationFrame = 0;
      context?.clearRect(0, 0, canvas.width, canvas.height);
      markReady();
      return;
    }

    resizeCanvas();
    lastFrame = performance.now();
    if (!animationFrame) animationFrame = requestAnimationFrame(frame);
  }

  if (renderQuery.addEventListener) {
    renderQuery.addEventListener('change', syncRendering);
  } else {
    renderQuery.addListener(syncRendering);
  }

  Object.defineProperty(window, '__AXE_GLOBE__', {
    configurable: true,
    value: {
      getState() {
        return {
          ready: canvas.dataset.globeReady === 'true',
          phi,
          theta,
          dragging,
          enabled: renderQuery.matches,
          size: canvasSize(),
          sourceSamples: landModel.sourceCount,
          invalidSamples: landModel.invalidCount,
          samples: landPoints.length,
          autoSpeed: AUTO_SPEED,
          renderer: 'natural-earth-dotted-globe'
        };
      }
    }
  });

  syncRendering();
}
