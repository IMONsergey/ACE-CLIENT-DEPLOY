#!/usr/bin/env node
'use strict';

/**
 * ACE handoff regression checks. No production writes or external navigation.
 * Run on imon-workstation via imon-job, using the existing imon-node toolkit:
 *   imon-node scripts/verify-handoff.cjs --out /home/sergey/Work/Reports/ACE
 * Optional: --browsers chromium,firefox,webkit --screenshots chromium|all|failures|none
 *           --base-path /ACE-CLIENT-DEPLOY/ --source docs/news-source.json
 *
 * The script serves only this checkout's public files on 127.0.0.1, closes its
 * own server/browser processes, never submits a form and blocks external HTTP.
 * Geometry is tested with reduced motion, not by disabling production scripts.
 * Screenshots are evidence for a human comparison, not a pixel-match assertion.
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const SELECTOR = Object.freeze({
  opener: '[data-news-open="spief-2025"]',
  dialog: 'dialog[data-news-dialog]',
  scroll: '[data-news-scroll]',
  close: '[data-news-close]',
  article: '[data-news-article]',
  title: '[data-news-title]',
  body: '[data-news-body]',
  source: '[data-news-source]',
  map: '[data-countries-map]',
  scene: '[data-map-scene]',
  logos: '[data-map-logo]',
  cards: '[data-map-country]'
});

// Measured against the map image, not the viewport or the section. The source
// is the client's Design screenshot in the supplied comments document.
const MAP_TARGET = Object.freeze({
  spimex: { left: 32.529, top: 17.290, width: 5.605 },
  butb: { left: 30.203, top: 22.366, width: 4.660 },
  ets: { left: 59.044, top: 29.312, width: 3.778 },
  asia: { left: 64.016, top: 29.226, width: 6.864 },
  uzex: { left: 50.796, top: 32.013, width: 5.668 },
  irenex: { left: 45.313, top: 37.643, width: 4.723 },
  ime: { left: 49.094, top: 41.244, width: 4.912 },
  emx: { left: 33.413, top: 43.332, width: 5.730 }
});

const PHOTO_HASHES = [
  '163f24c878e5277f70d199bed96fead3ca66c984ca4156def6f97880b37ea8d1',
  'c603b30abc2e39f4d0aa63610070cb20ef180ec993b49851b9e9dcc2d3271818'
];
const POPUP_VIEWPORTS = [
  { width: 1440, height: 1000 },
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
  { width: 320, height: 740 }
];
const MAP_WIDTHS = [901, 1024, 1440, 1920];
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff',
  '.ttf': 'font/ttf', '.mp4': 'video/mp4'
};

function optionsFrom(argv) {
  const options = {
    browsers: ['chromium', 'firefox', 'webkit'], screenshots: 'chromium',
    out: process.env.ACE_REPORT_DIR || path.join(ROOT, 'artifacts', 'qa'),
    source: path.join(ROOT, 'docs', 'news-source.json'), basePath: '/'
  };
  const flags = new Map([
    ['--browsers', 'browsers'], ['--screenshots', 'screenshots'],
    ['--out', 'out'], ['--source', 'source'], ['--base-path', 'basePath']
  ]);
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--help' || argv[i] === '-h') {
      process.stdout.write('Usage: imon-node scripts/verify-handoff.cjs [--browsers chromium,firefox,webkit] [--screenshots chromium|all|failures|none] [--out DIRECTORY] [--source docs/news-source.json] [--base-path /ACE-CLIENT-DEPLOY/]\n');
      return null;
    }
    const key = flags.get(argv[i]);
    if (!key || !argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Invalid argument: ${argv[i]}`);
    options[key] = argv[++i];
  }
  if (typeof options.browsers === 'string') options.browsers = options.browsers.split(',').map((name) => name.trim());
  options.browsers = [...new Set(options.browsers)];
  if (!options.browsers.length || options.browsers.some((name) => !['chromium', 'firefox', 'webkit'].includes(name))) throw new Error('Unknown browser selection');
  if (!['chromium', 'all', 'failures', 'none'].includes(options.screenshots)) throw new Error('Unknown screenshots mode');
  if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(options.basePath)) throw new Error('base-path must be a safe absolute URL path ending with /');
  options.source = path.resolve(ROOT, options.source);
  options.out = path.resolve(ROOT, options.out);
  return options;
}

const options = optionsFrom(process.argv.slice(2));
if (!options) process.exit(0);

const RUN_ID = `${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')}-${process.pid}`;
const OUT = path.join(options.out, RUN_ID);
const report = {
  project: 'ACE-CLIENT-DEPLOY', startedAt: new Date().toISOString(),
  root: ROOT, output: OUT, basePath: options.basePath,
  scope: 'Approved Page 3 news popup and exchange-logo placement only',
  methodology: 'Live local site, native interactions, sequential browsers, reduced-motion geometry; no external navigation or form submission',
  visualTarget: 'https://www.figma.com/design/Ya1g999mQznIQYmhI3rU1l/Untitled?node-id=48-62',
  mapTarget: 'https://docs.google.com/document/d/1iUsqmLMdtUdEDmdtp2dnonSeBH0HlLBJdiXKCODCD8k/edit?tab=t.0',
  browsers: [], cases: [], limitations: [], checks: { requestedBrowsers: options.browsers }
};
const liveBrowsers = new Set();
let localServer;
let origin;
let shuttingDown = false;
let signalReceived;

function invariant(condition, message, details) {
  if (condition) return;
  const error = new Error(message);
  error.details = details;
  throw error;
}

function closeTo(actual, expected, tolerance, label) {
  invariant(Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected} ± ${tolerance}, got ${actual}`, { actual, expected, tolerance });
}

function normalizeText(text) {
  return text.normalize('NFKC').replace(/[\u2010-\u2015]/g, '-').replace(/\s+/g, ' ').trim();
}

function safeURL(value) {
  try { const url = new URL(value); return `${url.origin}${url.pathname}`; } catch { return String(value).slice(0, 240); }
}

function relativeAsset(url) {
  const parsed = new URL(url);
  invariant(parsed.origin === origin, 'A requested component asset is not local', { url: safeURL(url) });
  invariant(parsed.pathname.startsWith(options.basePath), 'Asset escaped the configured base path', { url: safeURL(url) });
  return decodeURIComponent(parsed.pathname.slice(options.basePath.length));
}

function pathInsideRoot(relative) {
  const resolved = path.resolve(ROOT, relative);
  invariant(resolved.startsWith(`${ROOT}${path.sep}`), 'Asset path is outside the project', { relative });
  const real = fs.realpathSync(resolved);
  invariant(real.startsWith(`${ROOT}${path.sep}`), 'Asset symlink is outside the project', { relative });
  return real;
}

function localFileProof(url) {
  const relative = relativeAsset(url);
  const bytes = fs.readFileSync(pathInsideRoot(relative));
  invariant(bytes.length > 0, 'Component asset is empty', { relative });
  const proof = { path: relative, bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  if (path.extname(relative).toLowerCase() === '.svg') {
    // Read only SVG root metadata, never use SVG path bytes to redraw an asset.
    const tag = bytes.toString('utf8').match(/<svg\b[^>]*>/i)?.[0] || '';
    proof.svg = Object.fromEntries(['width', 'height', 'viewBox'].map((key) => [key, tag.match(new RegExp(`\\b${key}=["']([^"']+)["']`))?.[1] || null]));
    invariant(tag.length > 0, 'Downloaded icon is not an SVG document', { relative });
  }
  return proof;
}

async function startServer() {
  localServer = http.createServer(async (request, response) => {
    try {
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405, { Allow: 'GET, HEAD' }); response.end(); return;
      }
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      if (!pathname.startsWith(options.basePath)) { response.writeHead(404); response.end(); return; }
      let relative = pathname.slice(options.basePath.length);
      if (!relative) relative = 'index.html';
      if (relative.endsWith('/')) relative += 'index.html';
      // Never expose Git/configuration, test output or any private file.
      if (!(['index.html', 'news-preview.html', 'bids-offers/index.html'].includes(relative) || /^(?:assets|bids-offers\/assets)\//.test(relative)) || relative.split('/').some((part) => part.startsWith('.'))) {
        response.writeHead(404); response.end(); return;
      }
      const file = pathInsideRoot(relative);
      const stat = await fsp.stat(file);
      if (!stat.isFile()) { response.writeHead(404); response.end(); return; }
      response.writeHead(200, {
        'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'Content-Length': stat.size, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
      });
      if (request.method === 'HEAD') { response.end(); return; }
      fs.createReadStream(file).on('error', () => response.destroy()).pipe(response);
    } catch {
      if (!response.headersSent) response.writeHead(404);
      response.end();
    }
  });
  localServer.requestTimeout = 15000;
  await new Promise((resolve, reject) => {
    localServer.once('error', reject);
    localServer.listen(0, '127.0.0.1', resolve);
  });
  origin = `http://127.0.0.1:${localServer.address().port}`;
}

async function settle(page) {
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function waitForReady(page) {
  await page.waitForFunction(() => document.documentElement.classList.contains('is-ready') &&
    (!window.__AXE_PRELOADER__ || window.__AXE_PRELOADER__.getState().hidden), null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => !window.__AXE_MOTION__ || window.__AXE_MOTION__.getState().ready, null, { timeout: 5000 });
  await settle(page);
}

async function screenshot(page, browserName, name, force = false) {
  const enabled = force ? options.screenshots !== 'none' :
    options.screenshots === 'all' || (options.screenshots === 'chromium' && browserName === 'chromium');
  if (!enabled || page.isClosed()) return null;
  const filename = `${browserName}-${name}.png`;
  await page.screenshot({ path: path.join(OUT, filename), fullPage: false, animations: 'disabled' });
  return filename;
}

async function runCase(browserName, page, name, task) {
  if (signalReceived) throw new Error(`Interrupted by ${signalReceived}`);
  const entry = { browser: browserName, name, startedAt: new Date().toISOString() };
  const started = Date.now();
  try {
    entry.evidence = await task();
    entry.status = 'passed';
    process.stdout.write(`PASS ${browserName} ${name}\n`);
  } catch (error) {
    entry.status = 'failed';
    entry.error = { message: error.message, details: error.details || null, stack: error.stack?.slice(0, 4500) };
    try { entry.failureScreenshot = await screenshot(page, browserName, `${name}-FAILED`, true); } catch (captureError) { entry.captureError = captureError.message; }
    process.stdout.write(`FAIL ${browserName} ${name}: ${error.message}\n`);
  }
  entry.durationMs = Date.now() - started;
  report.cases.push(entry);
  await fsp.writeFile(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  // Teardown is deliberately limited to this component, not a page mutation.
  try {
    if (await page.locator(SELECTOR.dialog).isVisible()) {
      await page.keyboard.press('Escape');
      await page.locator(SELECTOR.dialog).waitFor({ state: 'hidden', timeout: 2000 });
    }
  } catch { /* The next case will retain and report any genuine failure. */ }
}

async function revealOpener(page) {
  const opener = page.locator(SELECTOR.opener).first();
  invariant(await opener.count() === 1, 'Approved article opener is absent');
  for (let count = 0; count < 4 && !(await opener.isVisible()); count += 1) {
    const next = page.locator('#news [data-slider-next]');
    invariant(await next.isVisible(), 'Mobile news controls are unavailable');
    await next.click();
    await settle(page);
  }
  invariant(await opener.isVisible(), 'Approved article is not reachable through the news slider');
  await opener.scrollIntoViewIfNeeded();
  await opener.focus();
  await settle(page);
  return opener;
}

async function assertOpen(page) {
  await page.locator(SELECTOR.dialog).waitFor({ state: 'visible', timeout: 5000 });
  const state = await page.locator(SELECTOR.dialog).evaluate((dialog) => ({
    open: dialog.open, modal: dialog.matches(':modal'),
    labelledBy: dialog.getAttribute('aria-labelledby'),
    label: document.getElementById(dialog.getAttribute('aria-labelledby'))?.textContent,
    focusInside: dialog.contains(document.activeElement)
  }));
  invariant(state.open && state.modal, 'Popup did not open as a native modal dialog', state);
  invariant(state.labelledBy && state.label?.trim(), 'Dialog has no accessible title', state);
  invariant(state.focusInside, 'Focus was not moved inside the popup', state);
}

async function assertClosedAndRestored(page, opener, original) {
  await page.locator(SELECTOR.dialog).waitFor({ state: 'hidden', timeout: 3000 });
  await settle(page);
  invariant(await opener.evaluate((element) => element === document.activeElement), 'Focus did not return to the news opener');
  const current = await page.evaluate(() => ({
    x: window.scrollX, y: window.scrollY,
    bodyStyles: Object.fromEntries(['position', 'top', 'left', 'width', 'paddingRight', 'overflow'].map((key) => [key, document.body.style[key]])),
    htmlOverflow: document.documentElement.style.overflow,
    htmlScrollBehavior: document.documentElement.style.scrollBehavior
  }));
  closeTo(current.y, original.y, 3, 'Restored document scrollY');
  closeTo(current.x, original.x, 1, 'Restored document scrollX');
  assert.deepEqual(current.bodyStyles, original.bodyStyles, 'Closing must restore the original inline body styles');
  assert.equal(current.htmlOverflow, original.htmlOverflow, 'Closing must restore html overflow');
  assert.equal(current.htmlScrollBehavior, original.htmlScrollBehavior, 'Closing must restore html scroll behavior');
}

async function checkFocusCycle(page) {
  const focusableSelector = 'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  const count = await page.locator(SELECTOR.dialog).evaluate((dialog, selector) =>
    [...dialog.querySelectorAll(selector)].filter((element) => element.getClientRects().length && !element.closest('[hidden], [inert]')).length, focusableSelector);
  invariant(count >= 2, 'Expected a keyboard-accessible scroll region, source and close control');
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let step = 0; step < count + 2; step += 1) {
      await page.keyboard.press(key);
      invariant(await page.locator(SELECTOR.dialog).evaluate((dialog) => dialog.contains(document.activeElement)), `${key} escaped the modal focus boundary`, { step, count });
    }
  }
  for (const reverse of [false, true]) {
    await page.locator(SELECTOR.dialog).evaluate((dialog, { selector, reverse }) => {
      const elements = [...dialog.querySelectorAll(selector)].filter((element) => element.getClientRects().length && !element.closest('[hidden], [inert]'));
      elements[reverse ? 0 : elements.length - 1].focus({ preventScroll: true });
    }, { selector: focusableSelector, reverse });
    await page.keyboard.press(reverse ? 'Shift+Tab' : 'Tab');
    const wrapped = await page.locator(SELECTOR.dialog).evaluate((dialog, { selector, reverse }) => {
      const elements = [...dialog.querySelectorAll(selector)].filter((element) => element.getClientRects().length && !element.closest('[hidden], [inert]'));
      return document.activeElement === elements[reverse ? elements.length - 1 : 0];
    }, { selector: focusableSelector, reverse });
    invariant(wrapped, `${reverse ? 'Reverse' : 'Forward'} tab wrap did not reach the opposite boundary`);
  }
  return { tabbableCount: count, directions: ['Tab', 'Shift+Tab'], boundaryWraps: 2 };
}

async function checkPopup(page, browserName, viewport, source, browserEvidence) {
  const startErrors = browserEvidence.pageErrors.length;
  const startPopups = browserEvidence.unexpectedPopups.length;
  await page.setViewportSize(viewport);
  await settle(page);
  const opener = await revealOpener(page);
  const original = await page.evaluate(() => ({
    x: window.scrollX, y: window.scrollY,
    bodyStyles: Object.fromEntries(['position', 'top', 'left', 'width', 'paddingRight', 'overflow'].map((key) => [key, document.body.style[key]])),
    htmlOverflow: document.documentElement.style.overflow,
    htmlScrollBehavior: document.documentElement.style.scrollBehavior
  }));
  await page.keyboard.press('Enter');
  await assertOpen(page);
  const dialog = page.locator(SELECTOR.dialog);
  const scroller = dialog.locator(SELECTOR.scroll);
  const article = dialog.locator(SELECTOR.article);
  const body = article.locator(SELECTOR.body);
  const sourceLink = article.locator(SELECTOR.source);
  const title = article.locator(SELECTOR.title);
  invariant(await title.evaluate((element) => element === document.activeElement), 'Initial focus should announce the article title');

  const paragraphs = await body.locator(':scope > p').allTextContents();
  assert.equal(paragraphs.length, source.paragraphs.length, 'The full article must contain every source paragraph');
  paragraphs.forEach((paragraph, index) => assert.equal(normalizeText(paragraph), normalizeText(source.paragraphs[index]), `Article paragraph ${index + 1} differs from the approved source`));
  assert.equal(normalizeText(await title.textContent()), normalizeText(source.title), 'Article title differs from the approved source');
  assert.equal(await sourceLink.getAttribute('href'), source.sourceUrl, 'Footer source link differs from the original article');
  assert.equal(await sourceLink.getAttribute('target'), '_blank', 'Source must not replace the local article');
  invariant(/\b(?:noopener|noreferrer)\b/.test(await sourceLink.getAttribute('rel') || ''), 'External source link lacks opener protection');

  const photos = article.locator('figure > img');
  assert.equal(await photos.count(), 2, 'Both approved photographs must be present');
  for (const photo of await photos.all()) {
    await photo.scrollIntoViewIfNeeded();
    await photo.evaluate((image) => image.decode());
  }
  await scroller.evaluate((element) => { element.scrollTop = 0; });
  await settle(page);

  const geometry = await dialog.evaluate((element) => {
    const rectangle = (node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
    };
    const title = element.querySelector('[data-news-title]');
    const body = element.querySelector('[data-news-body]');
    const scroll = element.querySelector('[data-news-scroll]');
    const style = getComputedStyle(title);
    return {
      dialog: rectangle(element), title: rectangle(title), body: rectangle(body),
      scroll: { ...rectangle(scroll), clientWidth: scroll.clientWidth, scrollWidth: scroll.scrollWidth, clientHeight: scroll.clientHeight, scrollHeight: scroll.scrollHeight, scrollTop: scroll.scrollTop },
      close: rectangle(element.querySelector('[data-news-close]')),
      photos: [...element.querySelectorAll('figure > img')].map((image) => ({ ...rectangle(image), src: image.currentSrc, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, complete: image.complete, alt: image.alt, objectFit: getComputedStyle(image).objectFit })),
      font: { family: style.fontFamily, size: parseFloat(style.fontSize), lineHeight: parseFloat(style.lineHeight), weight: style.fontWeight, oswaldLoaded: document.fonts.check('500 44px Oswald', 'Международная'), interLoaded: document.fonts.check('400 18px Inter', 'Международная') },
      backdrop: getComputedStyle(element, '::backdrop').backgroundColor,
      documentWidth: document.documentElement.scrollWidth, viewportWidth: window.innerWidth,
      scrollX: window.scrollX, scrollY: window.scrollY
    };
  });
  invariant(geometry.dialog.x >= -1 && geometry.dialog.right <= viewport.width + 1, 'Dialog extends outside the viewport horizontally', geometry);
  invariant(geometry.dialog.y >= -1 && geometry.dialog.bottom <= viewport.height + 1, 'Dialog extends outside the viewport vertically', geometry);
  closeTo(geometry.dialog.x + geometry.dialog.width / 2, viewport.width / 2, 1.5, 'Horizontal popup center');
  invariant(geometry.documentWidth <= geometry.viewportWidth + 2, 'Popup causes document horizontal overflow', geometry);
  invariant(geometry.scroll.scrollWidth <= geometry.scroll.clientWidth + 2, 'Article has horizontal overflow', geometry.scroll);
  invariant(geometry.scroll.scrollHeight > geometry.scroll.clientHeight + 100, 'Expected a scrollable full-length article', geometry.scroll);
  closeTo(geometry.scroll.scrollTop, 0, 1, 'Initial article scrollTop');
  closeTo(geometry.close.width, 48, 1, 'Close control width');
  closeTo(geometry.close.height, 48, 1, 'Close control height');
  invariant(geometry.font.oswaldLoaded && geometry.font.interLoaded && geometry.font.family.includes('Oswald'), 'Approved local typefaces were not applied', geometry.font);
  if (viewport.width === 1440) {
    closeTo(geometry.dialog.width, 960, 1, 'Approved dialog width');
    closeTo(geometry.dialog.height, 904, 1.5, 'Approved dialog viewport height');
    closeTo(geometry.dialog.x, 240, 1.5, 'Approved centered dialog left');
    closeTo(geometry.dialog.y, 48, 1, 'Approved dialog top inset');
    closeTo(geometry.title.width, 832, 1, 'Approved title width');
    closeTo(geometry.body.width, 720, 1, 'Approved reading column width');
    closeTo(geometry.font.size, 44, 0.1, 'Approved heading size');
    closeTo(geometry.font.lineHeight, 54, 0.1, 'Approved heading line height');
    assert.equal(geometry.font.weight, '500', 'Approved heading weight');
    closeTo(geometry.photos[0].width, 832, 1, 'Approved cover width');
    closeTo(geometry.photos[0].height, 380, 1, 'Approved cover height');
    closeTo(geometry.photos[1].width, 720, 1, 'Approved inline photo width');
    closeTo(geometry.photos[1].height, 480, 1, 'Approved inline photo height');
  }
  const photoProofs = geometry.photos.map((photo, index) => {
    invariant(photo.complete && photo.naturalWidth > 0 && photo.naturalHeight > 0, 'A news photograph has not loaded', photo);
    invariant(photo.alt.trim().length > 0, 'A news photograph lacks useful alternative text', photo);
    const proof = localFileProof(photo.src);
    assert.equal(proof.sha256, PHOTO_HASHES[index], `Photograph ${index + 1} differs from the verified source JPEG`);
    return { ...proof, naturalWidth: photo.naturalWidth, naturalHeight: photo.naturalHeight };
  });
  const iconProofs = [];
  for (const icon of await dialog.locator('button img, a img').all()) {
    await icon.evaluate((image) => image.decode());
    const iconInfo = await icon.evaluate((image) => ({ src: image.currentSrc, width: image.getBoundingClientRect().width, height: image.getBoundingClientRect().height, complete: image.complete, naturalWidth: image.naturalWidth }));
    invariant(iconInfo.complete && iconInfo.naturalWidth > 0, 'Popup icon failed to load', iconInfo);
    closeTo(iconInfo.width, 24, 1, 'Approved icon width');
    closeTo(iconInfo.height, 24, 1, 'Approved icon height');
    iconProofs.push({ ...localFileProof(iconInfo.src), width: iconInfo.width, height: iconInfo.height });
  }
  assert.equal(iconProofs.length, 2, 'Expected downloaded close and external-source SVGs');
  const topScreenshot = await screenshot(page, browserName, `popup-${viewport.width}-top`);
  const focus = await checkFocusCycle(page);

  await scroller.evaluate((element) => { element.scrollTop = 0; });
  await scroller.focus();
  await page.keyboard.press('PageDown');
  await page.waitForFunction((selector) => document.querySelector(selector).scrollTop > 20, SELECTOR.scroll, { timeout: 3000 });
  const keyboardScrollTop = await scroller.evaluate((element) => element.scrollTop);
  const lockedPosition = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
  closeTo(lockedPosition.y, geometry.scrollY, 1, 'Background scroll while using article PageDown');
  closeTo(lockedPosition.x, geometry.scrollX, 1, 'Background horizontal scroll');
  const closeAfterScroll = await dialog.locator(SELECTOR.close).boundingBox();
  closeTo(closeAfterScroll.y, geometry.close.y, 1, 'Close control must stay visible while article scrolls');

  await sourceLink.focus();
  await sourceLink.scrollIntoViewIfNeeded();
  await settle(page);
  const end = await scroller.evaluate((element) => {
    const area = element.getBoundingClientRect();
    const source = element.querySelector('[data-news-source]').getBoundingClientRect();
    const last = [...element.querySelectorAll('[data-news-body] > p')].at(-1);
    const range = document.createRange();
    range.selectNodeContents(last);
    const lastLine = [...range.getClientRects()].at(-1);
    return { scrollTop: element.scrollTop, area: { top: area.top, bottom: area.bottom }, source: { top: source.top, bottom: source.bottom }, lastLine: lastLine ? { top: lastLine.top, bottom: lastLine.bottom } : null };
  });
  invariant(end.scrollTop > keyboardScrollTop && end.source.top >= end.area.top - 1 && end.source.bottom <= end.area.bottom + 1,
    'The original source at the end of the full article is not reachable', end);
  invariant(end.lastLine && end.lastLine.bottom <= end.area.bottom + 2, 'The final article paragraph is clipped', end);
  const bottomScreenshot = await screenshot(page, browserName, `popup-${viewport.width}-bottom`);

  const outside = geometry.dialog.x >= 8 ? { x: 4, y: Math.min(80, viewport.height / 2) } :
    geometry.dialog.y >= 8 ? { x: viewport.width / 2, y: 4 } : null;
  if (outside) {
    await page.mouse.move(outside.x, outside.y);
    await page.mouse.wheel(0, 500);
    await settle(page);
    const position = await page.evaluate(() => ({ x: window.scrollX, y: window.scrollY }));
    closeTo(position.y, lockedPosition.y, 1, 'Background scroll must stay locked on a backdrop wheel');
  }

  await page.keyboard.press('Escape');
  await assertClosedAndRestored(page, opener, original);
  await opener.click();
  await assertOpen(page);
  closeTo(await scroller.evaluate((element) => element.scrollTop), 0, 1, 'Reopening must reset the article to the beginning');
  await title.click();
  invariant(await dialog.evaluate((element) => element.open), 'Clicking article content closed the dialog');
  if (outside) {
    await page.mouse.click(outside.x, outside.y);
    await assertClosedAndRestored(page, opener, original);
    await opener.click();
    await assertOpen(page);
  }
  await dialog.locator(SELECTOR.close).click();
  await assertClosedAndRestored(page, opener, original);
  invariant(browserEvidence.unexpectedPopups.length === startPopups, 'Opening the local article unexpectedly opened an external browser tab', browserEvidence.unexpectedPopups.slice(startPopups));
  invariant(browserEvidence.pageErrors.length === startErrors, 'A JavaScript exception occurred during news interactions', browserEvidence.pageErrors.slice(startErrors));
  return {
    viewport, geometry, paragraphCount: paragraphs.length,
    words: normalizeText(paragraphs.join(' ')).split(/\s+/).length,
    photoProofs, iconProofs, focus, keyboardScrollTop, end,
    closures: outside ? ['Escape', 'backdrop', 'close control'] : ['Escape', 'close control'],
    restoredScrollY: original.y, screenshots: [topScreenshot, bottomScreenshot].filter(Boolean)
  };
}

function overlaps(first, second, tolerance = 1) {
  return first.x < second.right - tolerance && first.right > second.x + tolerance &&
    first.y < second.bottom - tolerance && first.bottom > second.y + tolerance;
}

async function checkMap(page, browserName, width, browserEvidence) {
  const startErrors = browserEvidence.pageErrors.length;
  await page.setViewportSize({ width, height: 1200 });
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.activeElement?.blur());
  const map = page.locator(SELECTOR.map);
  await map.evaluate((element) => element.scrollIntoView({ block: 'start', behavior: 'auto' }));
  for (const image of await map.locator('.countries-map__desktop img').all()) await image.evaluate((element) => element.decode());
  await settle(page);
  const geometry = await map.evaluate((root) => {
    const rectangle = (node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom };
    };
    const scene = root.querySelector('[data-map-scene]');
    const sceneRect = scene.getBoundingClientRect();
    return {
      section: rectangle(root), scene: rectangle(scene),
      map: rectangle(root.querySelector('.countries-map__map--desktop')),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      cards: [...root.querySelectorAll('[data-map-country]')].map((card) => ({ ...rectangle(card), country: card.dataset.mapCountry })),
      logos: [...root.querySelectorAll('[data-map-logo]')].map((image) => {
        const box = image.getBoundingClientRect();
        const key = [...image.classList].find((name) => name.startsWith('countries-map__logo--')).slice('countries-map__logo--'.length);
        return { key, country: image.dataset.mapLogo, ...rectangle(image), loaded: image.complete && image.naturalWidth > 0,
          src: image.currentSrc, active: image.classList.contains('is-active'),
          normalized: { left: (box.x - sceneRect.x) / sceneRect.width * 100, top: (box.y - sceneRect.y) / sceneRect.height * 100, width: box.width / sceneRect.width * 100 } };
      })
    };
  });
  assert.equal(geometry.logos.length, 8, 'The desktop map must show all eight exchange logos');
  assert.equal(geometry.cards.length, 7, 'The map must retain all seven country controls');
  invariant(geometry.documentWidth <= width + 2, 'Map causes document horizontal overflow', geometry);
  const proofs = [];
  for (const logo of geometry.logos) {
    invariant(logo.loaded && logo.width > 0 && logo.height > 0 && !logo.active, 'Map logo is unloaded, hidden or stuck in active scale', logo);
    invariant(logo.x >= -1 && logo.right <= width + 1 && logo.y >= -1 && logo.bottom <= 1201, 'Exchange logo is outside the visible map viewport', logo);
    invariant(logo.x >= geometry.section.x - 1 && logo.right <= geometry.section.right + 1 && logo.y >= geometry.section.y - 1 && logo.bottom <= geometry.section.bottom + 1, 'Exchange logo is clipped by the map section', logo);
    const target = MAP_TARGET[logo.key];
    invariant(target, 'Unexpected logo identity', logo);
    for (const field of ['left', 'top', 'width']) closeTo(logo.normalized[field], target[field], 0.08, `${logo.key} normalized ${field}`);
    for (const card of geometry.cards) invariant(!overlaps(logo, card), 'Exchange logo overlaps country navigation', { logo, card });
    proofs.push({ key: logo.key, ...localFileProof(logo.src) });
  }
  for (let i = 0; i < geometry.logos.length; i += 1) {
    for (let j = i + 1; j < geometry.logos.length; j += 1) invariant(!overlaps(geometry.logos[i], geometry.logos[j]), 'Two exchange logos overlap', { first: geometry.logos[i], second: geometry.logos[j] });
  }
  const shot = await screenshot(page, browserName, `map-${width}`);

  const iran = map.locator('[data-map-country="iran"]');
  await iran.hover();
  await page.waitForFunction(() => window.__AXE_COUNTRIES_MAP__?.getState().activeCountry === 'iran' && window.__AXE_COUNTRIES_MAP__.getState().connections === 2);
  assert.equal(await map.locator('[data-map-logo="iran"].is-active').count(), 2, 'Hover must highlight both Iranian exchanges');
  await page.mouse.move(0, 0);
  await page.waitForFunction(() => window.__AXE_COUNTRIES_MAP__?.getState().activeCountry === null);
  await map.locator('[data-map-country="egypt"]').focus();
  await page.keyboard.press('Tab');
  invariant(await iran.evaluate((element) => element === document.activeElement), 'Country navigation order cannot reach Iran by keyboard');
  await page.waitForFunction(() => window.__AXE_COUNTRIES_MAP__?.getState().activeCountry === 'iran' && window.__AXE_COUNTRIES_MAP__.getState().connections === 2);
  assert.equal(await map.locator('[data-map-logo="iran"].is-active').count(), 2, 'Keyboard focus must highlight both Iranian exchanges');
  const paths = await map.locator('[data-map-connections] path').evaluateAll((items) => items.map((item) => ({ d: item.getAttribute('d'), length: item.getTotalLength() })));
  invariant(paths.length === 2 && paths.every((item) => Number.isFinite(item.length) && item.length > 0 && !/NaN|Infinity/.test(item.d)), 'Country connection paths are invalid', paths);
  await page.keyboard.press('Tab');
  await page.waitForFunction(() => window.__AXE_COUNTRIES_MAP__?.getState().activeCountry === 'china' && window.__AXE_COUNTRIES_MAP__.getState().connections === 1);
  await page.evaluate(() => document.activeElement?.blur());
  await page.waitForFunction(() => window.__AXE_COUNTRIES_MAP__?.getState().connections === 0);
  invariant(browserEvidence.pageErrors.length === startErrors, 'A JavaScript exception occurred during map interactions', browserEvidence.pageErrors.slice(startErrors));
  return { width, geometry, assetProofs: proofs, iranPaths: paths, keyboard: ['Egypt', 'Tab to Iran: 2 paths', 'Tab to China: 1 path', 'blur: 0 paths'], screenshot: shot };
}

async function checkApprovedPreview(page, browserName, browserEvidence) {
  const startErrors = browserEvidence.pageErrors.length;
  await page.setViewportSize({ width: 1440, height: 1000 });
  const response = await page.goto(`${origin}${options.basePath}news-preview.html?article=spief-2025`, { waitUntil: 'domcontentloaded' });
  assert.equal(response.status(), 200, 'Standalone news preview is missing');
  await page.evaluate(() => document.fonts.ready);
  await assertOpen(page);
  const dialog = page.locator(SELECTOR.dialog);
  const scroller = dialog.locator(SELECTOR.scroll);
  const article = dialog.locator(SELECTOR.article);
  for (const image of await article.locator('figure > img').all()) {
    await image.scrollIntoViewIfNeeded();
    await image.evaluate((element) => element.decode());
  }
  await scroller.evaluate((element) => { element.scrollTop = 0; });
  await settle(page);
  const original = await dialog.boundingBox();
  closeTo(original.width, 960, 1, 'Preview dialog width');
  closeTo(original.height, 904, 1.5, 'Preview dialog height');
  closeTo(original.y, 48, 1, 'Preview dialog top');
  const topScreenshot = await screenshot(page, browserName, 'approved-preview-1440-top');
  // Full-content companion: emulate a taller viewport, retaining all production
  // CSS/DOM and the exact 1440 px width. This does not claim a real monitor size.
  const articleBox = await article.boundingBox();
  const height = Math.ceil(articleBox.height + 96);
  invariant(height > 1000 && height <= 12000, 'Unexpected full-article height', { articleBox });
  await page.setViewportSize({ width: 1440, height });
  await scroller.evaluate((element) => { element.scrollTop = 0; });
  await settle(page);
  const full = await scroller.evaluate((element) => ({ clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop }));
  invariant(full.scrollHeight <= full.clientHeight + 2, 'Full-content companion still clips the article', full);
  const fullScreenshot = await screenshot(page, browserName, 'approved-preview-1440-full');
  invariant(browserEvidence.pageErrors.length === startErrors, 'A JavaScript exception occurred in the standalone preview', browserEvidence.pageErrors.slice(startErrors));
  await page.keyboard.press('Escape');
  return { originalViewport: { width: 1440, height: 1000 }, originalDialog: original,
    fullViewport: { width: 1440, height }, full, productionStylesModified: false,
    screenshots: [topScreenshot, fullScreenshot].filter(Boolean),
    note: 'Full screenshot uses a taller viewport to reveal the whole article without changing or flattening production markup.' };
}

async function runBrowser(name, source, playwright) {
  const evidence = { name, status: 'running', pageErrors: [], consoleErrors: [], blockedExternal: [], localHttpErrors: [], unexpectedPopups: [], unsafeRequests: [] };
  report.browsers.push(evidence);
  let browser;
  let context;
  try {
    const launchOptions = { headless: true };
    if (name === 'chromium') launchOptions.args = ['--disable-dev-shm-usage'];
    browser = await playwright[name].launch(launchOptions);
    liveBrowsers.add(browser);
    evidence.version = browser.version();
    context = await browser.newContext({ viewport: POPUP_VIEWPORTS[0], reducedMotion: 'reduce', serviceWorkers: 'block', acceptDownloads: false });
    await context.route('**/*', async (route) => {
      const request = route.request();
      let url;
      try { url = new URL(request.url()); } catch { await route.abort(); return; }
      if (url.origin !== origin) {
        evidence.blockedExternal.push({ url: safeURL(request.url()), type: request.resourceType() });
        await route.abort('blockedbyclient'); return;
      }
      if (!['GET', 'HEAD'].includes(request.method())) {
        evidence.unsafeRequests.push({ method: request.method(), url: safeURL(request.url()) });
        await route.abort('blockedbyclient'); return;
      }
      await route.continue();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    page.setDefaultNavigationTimeout(20000);
    page.on('pageerror', (error) => evidence.pageErrors.push({ message: error.message, stack: error.stack?.slice(0, 3000) }));
    page.on('console', (message) => { if (message.type() === 'error') evidence.consoleErrors.push({ text: message.text().slice(0, 1500), location: message.location() }); });
    page.on('response', (response) => { if (response.url().startsWith(origin) && response.status() >= 400) evidence.localHttpErrors.push({ url: safeURL(response.url()), status: response.status() }); });
    page.on('popup', async (popup) => { evidence.unexpectedPopups.push({ url: safeURL(popup.url()) }); await popup.close().catch(() => {}); });
    page.on('dialog', async (dialog) => { evidence.unsafeRequests.push({ javascriptDialog: dialog.type(), message: dialog.message().slice(0, 250) }); await dialog.dismiss(); });
    const response = await page.goto(`${origin}${options.basePath}`, { waitUntil: 'domcontentloaded' });
    assert.equal(response.status(), 200, 'Local homepage failed to load');
    await waitForReady(page);
    evidence.preloader = await page.evaluate(() => window.__AXE_PRELOADER__?.getState());
    evidence.baselinePageErrorCount = evidence.pageErrors.length;
    if (evidence.preloader?.forced) report.limitations.push(`${name}: existing WebGL preloader reached its fallback while external network was blocked; popup/map code was not bypassed.`);

    await runCase(name, page, 'source-fallbacks', async () => {
      const hrefs = await page.locator('#news .news-card__link').evaluateAll((links) => links.map((link) => ({ tag: link.tagName, href: link.getAttribute('href'), target: link.getAttribute('target'), disabled: link.hasAttribute('disabled') })));
      assert.equal(hrefs.length, 3);
      assert.deepEqual(hrefs.map((item) => item.href), ['https://spimex.global/about/news/1942/', 'https://spimex.global/about/news/1943/', source.sourceUrl]);
      invariant(hrefs.every((item) => item.tag === 'A' && item.target === '_blank' && !item.disabled), 'News cards must retain real non-JavaScript source fallbacks', hrefs);
      const cardCover = await page.locator('#news [data-news-card] .news-card__image').getAttribute('src');
      assert.equal(cardCover, 'assets/images/news/article/spief-2025-documents.jpg', 'The SPIEF card must show the approved photo from the same event');
      const cardCoverProof = localFileProof(new URL(cardCover, `${origin}${options.basePath}`).href);
      assert.equal(cardCoverProof.sha256, PHOTO_HASHES[0], 'The card cover must match the approved article photo');
      return { hrefs, cardCoverProof, navigation: 'Not followed: external network intentionally blocked' };
    });
    for (const viewport of POPUP_VIEWPORTS) await runCase(name, page, `popup-${viewport.width}`, () => checkPopup(page, name, viewport, source, evidence));
    for (const width of MAP_WIDTHS) await runCase(name, page, `map-${width}`, () => checkMap(page, name, width, evidence));
    await runCase(name, page, 'approved-preview', () => checkApprovedPreview(page, name, evidence));
    await runCase(name, page, 'component-resources-and-errors', async () => {
      const componentErrors = evidence.pageErrors.filter((error) => /news-dialog(?:\.min)?\.js|countries-map(?:\.min)?\.js/.test(error.stack || ''));
      const relevantHttpErrors = evidence.localHttpErrors.filter((item) => /\/assets\/(?:css\/(?:fonts|styles|news-dialog)\.css|js\/(?:news-dialog|countries-map)\.js|images\/(?:news|countries)\/|fonts\/)/.test(item.url));
      invariant(!componentErrors.length, 'News or map script raised an exception', componentErrors);
      invariant(!relevantHttpErrors.length, 'A required news/map/font resource returned an HTTP error', relevantHttpErrors);
      invariant(!evidence.unsafeRequests.length, 'Unexpected non-read-only page action was blocked', evidence.unsafeRequests);
      invariant(!evidence.unexpectedPopups.length, 'Unexpected browser popup occurred', evidence.unexpectedPopups);
      return { componentErrors, relevantHttpErrors, externalRequestsBlocked: evidence.blockedExternal.length, baselineErrorsOutsideScope: evidence.pageErrors.filter((item) => !componentErrors.includes(item)) };
    });
    evidence.status = report.cases.some((item) => item.browser === name && item.status === 'failed') ? 'failed' : 'passed';
  } catch (error) {
    evidence.status = 'failed';
    evidence.error = { message: error.message, stack: error.stack?.slice(0, 4000) };
    process.stdout.write(`FAIL ${name} suite: ${error.message}\n`);
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
    liveBrowsers.delete(browser);
    evidence.finishedAt = new Date().toISOString();
  }
}

async function cleanup() {
  if (shuttingDown) return;
  shuttingDown = true;
  await Promise.all([...liveBrowsers].map((browser) => browser.close().catch(() => {})));
  if (localServer) {
    localServer.closeAllConnections?.();
    await new Promise((resolve) => localServer.close(resolve));
  }
}

async function main() {
  await fsp.mkdir(OUT, { recursive: true });
  const sourceBytes = await fsp.readFile(options.source);
  const source = JSON.parse(sourceBytes);
  invariant(source.title && source.sourceUrl && Array.isArray(source.paragraphs) && source.paragraphs.length === 10, 'The canonical source file must contain the approved title and all ten paragraphs');
  report.canonicalSource = { path: path.relative(ROOT, options.source), sha256: crypto.createHash('sha256').update(sourceBytes).digest('hex'), paragraphs: source.paragraphs.length, words: normalizeText(source.paragraphs.join(' ')).split(/\s+/).length };
  report.playwrightVersion = require('playwright/package.json').version;
  const playwright = require('playwright');
  await startServer();
  process.stdout.write(`ACE_QA_OUTPUT ${OUT}\n`);
  for (const name of options.browsers) {
    if (signalReceived) break;
    await runBrowser(name, source, playwright);
  }
  report.status = signalReceived ? 'interrupted' : report.browsers.length === options.browsers.length && report.browsers.every((browser) => browser.status === 'passed') ? 'passed' : 'failed';
  report.finishedAt = new Date().toISOString();
  report.checks.passed = report.cases.filter((item) => item.status === 'passed').length;
  report.checks.failed = report.cases.filter((item) => item.status === 'failed').length;
  report.limitations = [...new Set(report.limitations)];
  report.limitations.push('No real external navigation, live client deployment, form submission or physical Safari/iOS session was performed. Playwright WebKit is not the Safari application.');
  report.limitations.push('Screenshots require a visual comparison with the approved Figma and document references; passing geometry does not establish pixel-perfect identity.');
  await fsp.writeFile(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
  process.stdout.write(`${report.status === 'passed' ? 'ACE_QA_PASSED' : 'ACE_QA_FAILED'} ${report.checks.passed}/${report.cases.length} cases; report ${path.join(OUT, 'report.json')}\n`);
  process.exitCode = report.status === 'passed' ? 0 : signalReceived ? 130 : 1;
}

for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => {
  signalReceived = signal;
  void cleanup();
});

main().catch(async (error) => {
  report.status = signalReceived ? 'interrupted' : 'failed';
  report.error = { message: error.message, stack: error.stack?.slice(0, 4500) };
  report.finishedAt = new Date().toISOString();
  try { await fsp.mkdir(OUT, { recursive: true }); await fsp.writeFile(path.join(OUT, 'report.json'), `${JSON.stringify(report, null, 2)}\n`); } catch { /* Preserve the original diagnostic. */ }
  process.stderr.write(`ACE_QA_FAILED ${error.stack || error.message}\n`);
  process.exitCode = signalReceived ? 130 : 1;
}).finally(cleanup);
