(() => {
  'use strict';

  const dialog = document.querySelector('[data-news-dialog]');
  const scroll = dialog?.querySelector('[data-news-scroll]');
  const article = dialog?.querySelector('[data-news-article]');
  const closeButton = dialog?.querySelector('[data-news-close]');
  if (!dialog || !scroll || !article || !closeButton || window.ACENews) return;

  // Native dialog supplies top-layer rendering and makes the page behind it inert.
  // Unsupported browsers keep the real source URL on each news link.
  const supported = typeof dialog.showModal === 'function';
  let activeId = null;
  let opener = null;
  let locked = null;
  let pointerStartedOnBackdrop = false;
  let restoreFrame = 0;
  let pendingScrollBehavior = null;

  function lockPage() {
    const body = document.body;
    const html = document.documentElement;
    if (restoreFrame) {
      window.cancelAnimationFrame(restoreFrame);
      html.style.scrollBehavior = pendingScrollBehavior;
      restoreFrame = 0;
      pendingScrollBehavior = null;
    }
    const keys = ['position', 'top', 'left', 'width', 'paddingRight', 'overflow'];
    const gap = Math.max(0, window.innerWidth - html.clientWidth);
    locked = {
      x: window.scrollX,
      y: window.scrollY,
      styles: Object.fromEntries(keys.map((key) => [key, body.style[key]])),
      htmlOverflow: html.style.overflow,
      htmlScrollBehavior: html.style.scrollBehavior
    };
    const padding = parseFloat(getComputedStyle(body).paddingRight) || 0;
    html.style.overflow = 'hidden';
    body.style.position = 'fixed';
    body.style.top = `${-locked.y}px`;
    body.style.left = `${-locked.x}px`;
    body.style.width = '100%';
    body.style.overflow = 'hidden';
    if (gap) body.style.paddingRight = `${padding + gap}px`;
  }

  function unlockPage() {
    if (!locked) return;
    const previous = locked;
    locked = null;
    const html = document.documentElement;
    Object.entries(previous.styles).forEach(([key, value]) => { document.body.style[key] = value; });
    html.style.overflow = previous.htmlOverflow;
    html.style.scrollBehavior = 'auto';
    window.scrollTo(previous.x, previous.y);
    window.cancelAnimationFrame(restoreFrame);
    pendingScrollBehavior = previous.htmlScrollBehavior;
    restoreFrame = window.requestAnimationFrame(() => {
      html.style.scrollBehavior = previous.htmlScrollBehavior;
      restoreFrame = 0;
      pendingScrollBehavior = null;
    });
  }

  function open(id, trigger) {
    const template = document.getElementById(`news-${id}`);
    if (!supported || !(template instanceof HTMLTemplateElement)) return false;
    if (dialog.open) return activeId === id;
    // Finish an earlier close synchronously before storing the next page position.
    if (activeId) cleanup();
    opener = trigger instanceof HTMLElement ? trigger : document.activeElement;
    article.replaceChildren(template.content.cloneNode(true));
    activeId = id;
    lockPage();
    try {
      dialog.showModal();
    } catch (error) {
      cleanup();
      return false;
    }
    scroll.scrollTop = 0;
    article.querySelector('[data-news-title]')?.focus({ preventScroll: true });
    return true;
  }

  function cleanup() {
    if (dialog.open) return;
    unlockPage();
    activeId = null;
    pointerStartedOnBackdrop = false;
    const previousOpener = opener;
    opener = null;
    if (previousOpener?.isConnected) previousOpener.focus({ preventScroll: true });
  }

  function close() {
    if (dialog.open) dialog.close();
    cleanup();
  }

  function isOutside(event) {
    const box = dialog.getBoundingClientRect();
    return event.clientX < box.left || event.clientX > box.right ||
      event.clientY < box.top || event.clientY > box.bottom;
  }

  closeButton.addEventListener('click', close);
  dialog.addEventListener('cancel', (event) => { event.preventDefault(); close(); });
  dialog.addEventListener('close', cleanup);
  dialog.addEventListener('pointerdown', (event) => {
    pointerStartedOnBackdrop = event.target === dialog && isOutside(event);
  });
  dialog.addEventListener('pointercancel', () => { pointerStartedOnBackdrop = false; });
  dialog.addEventListener('click', (event) => {
    if (pointerStartedOnBackdrop && event.target === dialog && isOutside(event)) close();
    pointerStartedOnBackdrop = false;
  });

  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const focusable = [...dialog.querySelectorAll('a[href], button:not([disabled]), [tabindex="0"]')]
      .filter((element) => element.getClientRects().length && !element.closest('[hidden]'));
    if (!focusable.length) { event.preventDefault(); return; }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const current = document.activeElement;
    if (event.shiftKey && (current === first || !focusable.includes(current))) {
      event.preventDefault(); last.focus({ preventScroll: true });
    } else if (!event.shiftKey && (current === last || !focusable.includes(current))) {
      event.preventDefault(); first.focus({ preventScroll: true });
    }
  });

  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (!(event.target instanceof Element)) return;
    let trigger = event.target.closest('[data-news-open]');
    if (!trigger) {
      const card = event.target.closest('[data-news-card]');
      if (!card || event.target.closest('a, button, input, select, textarea') || window.getSelection()?.toString()) return;
      trigger = card.querySelector('[data-news-open]');
    }
    if (trigger && open(trigger.dataset.newsOpen, trigger)) event.preventDefault();
  });

  Object.defineProperty(window, 'ACENews', {
    configurable: true,
    value: Object.freeze({ open, close, getState: () => ({ supported, open: dialog.open, activeId }) })
  });
})();
