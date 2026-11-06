#!/usr/bin/env node
'use strict';

// Read-only UI smoke of the published preview. Run through imon-node / imon-job.
// No forms, APIs, source links, external navigation, or configurable target.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://ace.imon.world';
const VIEWPORT = { width: 1440, height: 1000 };
const SELECTOR = {
  dialog: 'dialog[data-news-dialog]',
  article: '[data-news-article]',
  scroll: '[data-news-scroll]',
  close: '[data-news-close]',
  map: '[data-countries-map]',
  logos: '[data-map-logo]',
};
const started = Date.now();
const report = {
  origin: ORIGIN, startedAt: new Date().toISOString(), status: 'running',
  viewport: VIEWPORT, checks: [], screenshots: [],
  pageErrors: [], ownResourceErrors: [], blockedRequests: [], unexpectedPopups: [],
};
let browser;
let outputDir;
let deadline;

function saveReport() {
  if (!outputDir) return;
  report.finishedAt = new Date().toISOString();
  report.durationMs = Date.now() - started;
  fs.writeFileSync(path.join(outputDir, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}

// Normalizes only layout whitespace and the typographer's nonbreaking hyphens.
// Words, punctuation, paragraph order, and article content remain exact.
function text(value) {
  return value.normalize('NFKC').replace(/[\u2010\u2011]/g, '-').replace(/\s+/g, ' ').trim();
}

async function settle(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function ready(page, fullSite = false) {
  if (fullSite) {
    await page.waitForFunction(() =>
      document.documentElement.classList.contains('is-ready') &&
      (!window.__AXE_PRELOADER__ || window.__AXE_PRELOADER__.getState().hidden),
    null, { timeout: 15000 });
  }
  await page.evaluate(() => document.fonts.ready);
  await settle(page);
}

async function assertOpen(page) {
  const dialog = page.locator(SELECTOR.dialog);
  await dialog.waitFor({ state: 'visible' });
  assert.ok(await dialog.evaluate(node => node.open && node.matches(':modal')), 'Native modal is not open');
}

async function screenshot(page, name) {
  const target = path.join(outputDir, name);
  await page.screenshot({ path: target, fullPage: false, animations: 'disabled' });
  report.screenshots.push(target);
}

async function checkUI() {
  assert.equal(process.argv.length, 2, 'This smoke has a fixed target and accepts no arguments');
  const source = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/news-source.json'), 'utf8'));
  assert.equal(source.paragraphs.length, 10, 'Canonical article must contain ten paragraphs');
  browser = await chromium.launch({ headless: true, timeout: 10000, args: ['--disable-dev-shm-usage'] });
  report.browser = { name: 'chromium', version: browser.version() };
  const context = await browser.newContext({
    viewport: VIEWPORT, reducedMotion: 'reduce', serviceWorkers: 'block', acceptDownloads: false,
  });
  await context.route('**/*', async route => {
    const request = route.request();
    const url = new URL(request.url());
    const own = url.origin === ORIGIN;
    const allowedPath = ['/', '/index.html', '/news-preview.html', '/favicon.ico'].includes(url.pathname) ||
      /^\/assets\/[A-Za-z0-9_./%~-]+\.(?:css|js|mjs|json|svg|png|jpe?g|webp|gif|ico|woff2?|ttf|otf|mp4)$/i.test(url.pathname);
    if (!own || !allowedPath || !['GET', 'HEAD'].includes(request.method())) {
      report.blockedRequests.push({ url: request.url(), method: request.method() });
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(15000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  page.on('response', response => {
    if (new URL(response.url()).origin === ORIGIN && response.status() >= 400) {
      report.ownResourceErrors.push({ url: response.url(), status: response.status() });
    }
  });
  page.on('requestfailed', request => {
    if (new URL(request.url()).origin === ORIGIN) {
      report.ownResourceErrors.push({ url: request.url(), error: request.failure()?.errorText });
    }
  });
  page.on('popup', popup => {
    report.unexpectedPopups.push(popup.url());
    void popup.close().catch(() => {});
  });
  page.on('dialog', dialog => { void dialog.dismiss().catch(() => {}); });

  await page.goto(ORIGIN + '/news-preview.html?article=spief-2025', { waitUntil: 'load' });
  await ready(page);
  await assertOpen(page);
  const article = page.locator(SELECTOR.dialog).locator(SELECTOR.article);
  assert.equal(text(await article.locator('[data-news-title]').textContent()), text(source.title));
  const paragraphs = await article.locator('[data-news-body] > p').allTextContents();
  assert.equal(paragraphs.length, 10);
  paragraphs.forEach((paragraph, index) => assert.equal(text(paragraph), text(source.paragraphs[index]), `Paragraph ${index + 1}`));
  report.checks.push('Deep link opens native dialog; title and all ten canonical paragraphs match');

  const photos = article.locator('figure > img');
  assert.equal(await photos.count(), 2);
  for (const photo of await photos.all()) {
    await photo.scrollIntoViewIfNeeded();
    await photo.evaluate(image => image.decode());
  }
  report.photos = await photos.evaluateAll(images => images.map(image => ({
    src: image.currentSrc, loaded: image.complete, width: image.naturalWidth, height: image.naturalHeight,
  })));
  assert.equal(report.photos[0].src, ORIGIN + '/assets/images/news/article/spief-2025-documents.jpg');
  assert.equal(report.photos[1].src, ORIGIN + '/assets/images/news/article/spief-2025-signing.jpg');
  report.photos.forEach(photo => assert.ok(photo.loaded && photo.width === 3000 && photo.height === 2000));
  await page.locator(SELECTOR.scroll).evaluate(node => { node.scrollTop = 0; });
  await settle(page);
  await screenshot(page, 'news-open.png');
  report.checks.push('Approved cover and inline photograph load at original dimensions');

  await page.keyboard.press('Escape');
  await page.locator(SELECTOR.dialog).waitFor({ state: 'hidden' });
  assert.equal(await page.locator(SELECTOR.dialog).evaluate(node => node.open), false);
  const cards = page.locator('#news .news-card');
  assert.equal(await cards.count(), 3);
  assert.equal(await cards.nth(2).locator('[data-news-open="spief-2025"]').count(), 1);
  await cards.nth(2).locator('.news-card__image').click();
  await assertOpen(page);
  await page.locator(SELECTOR.dialog).locator(SELECTOR.close).click();
  await page.locator(SELECTOR.dialog).waitFor({ state: 'hidden' });
  report.checks.push('Escape closes; third card reopens; close button closes');

  await page.goto(ORIGIN + '/#countries', { waitUntil: 'load' });
  await ready(page, true);
  const map = page.locator(SELECTOR.map);
  await map.evaluate(node => node.scrollIntoView({ block: 'start', behavior: 'auto' }));
  const logos = map.locator(SELECTOR.logos);
  assert.equal(await logos.count(), 8);
  for (const image of await map.locator('.countries-map__desktop img').all()) {
    await image.evaluate(node => node.decode());
  }
  await settle(page);
  report.logos = await logos.evaluateAll(images => images.map(image => {
    const box = image.getBoundingClientRect();
    const style = getComputedStyle(image);
    return {
      country: image.dataset.mapLogo, src: image.currentSrc,
      loaded: image.complete && image.naturalWidth > 0,
      visible: style.display !== 'none' && style.visibility === 'visible' && Number(style.opacity) > 0,
      x: box.x, y: box.y, width: box.width, height: box.height, right: box.right, bottom: box.bottom,
    };
  }));
  for (const logo of report.logos) {
    assert.ok(logo.loaded && logo.visible && logo.width > 0 && logo.height > 0, `Invisible logo: ${logo.country}`);
    assert.ok(logo.x >= -1 && logo.right <= VIEWPORT.width + 1 && logo.y >= -1 && logo.bottom <= VIEWPORT.height + 1,
      `Logo outside desktop viewport: ${logo.country}`);
  }
  await screenshot(page, 'countries-map.png');
  report.checks.push('Main page shows all eight loaded exchange logos in the desktop viewport');
  assert.deepEqual(report.pageErrors, [], 'Page JavaScript errors');
  assert.deepEqual(report.ownResourceErrors, [], 'Failed own static resources');
  assert.deepEqual(report.unexpectedPopups, [], 'Unexpected navigation opened a new window');
  assert.deepEqual(report.blockedRequests, [], 'Unexpected external or non-static request');
  report.checks.push('No page errors, failed own resources, external requests, or unexpected popups');
}

(async () => {
  const base = path.join(ROOT, 'artifacts', 'published-smoke');
  fs.mkdirSync(base, { recursive: true });
  outputDir = fs.mkdtempSync(path.join(base, 'run-'));
  // The normal deadline closes our own browser in finally. The hard stop is a
  // last-resort ceiling, leaving a failed report instead of a hanging queue job.
  const hardStop = setTimeout(() => {
    report.status = 'failed';
    report.error = 'Published smoke exceeded 59 seconds, including browser cleanup';
    saveReport();
    process.exit(1);
  }, 59000);
  try {
    await Promise.race([
      checkUI(),
      new Promise((_, reject) => {
        deadline = setTimeout(() => reject(new Error('Published UI smoke exceeded 54 seconds')), 54000);
      }),
    ]);
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = error.stack || String(error);
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
    if (browser) {
      try { await browser.close(); }
      catch (error) { report.status = 'failed'; report.cleanupError = String(error); process.exitCode = 1; }
    }
    clearTimeout(hardStop);
    saveReport();
    console.log(JSON.stringify({ status: report.status, checks: report.checks.length,
      output: path.join(outputDir, 'report.json'), error: report.error || report.cleanupError || null }));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
