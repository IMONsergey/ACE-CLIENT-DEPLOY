#!/usr/bin/env node
'use strict';
/* Package the verified client runtime. No deployment, network or browsers.
   Copy original bytes. Keep packaging evidence outside the ZIP. */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const ROOT = fs.realpathSync(path.resolve(__dirname, '..'));
const RELEASE = '/srv/ace-preview/releases/20261109-b1b4bb7e6463';
const OUTPUT = path.join(ROOT, 'artifacts/client-delivery-20261109');
const ARCHIVE_NAME = 'ACE-Разработчикам.zip';
const README_TEMPLATE = 'docs/client-README.md';
const RUNTIME_FILES = Object.freeze([
  "assets/css/fonts.css",
  "assets/css/motion.css",
  "assets/css/news-dialog.css",
  "assets/css/news-preview.css",
  "assets/css/styles.css",
  "assets/fonts/inter-tight/OFL.txt",
  "assets/fonts/inter-tight/inter-tight-cyrillic.woff2",
  "assets/fonts/inter-tight/inter-tight-latin.woff2",
  "assets/fonts/inter/OFL.txt",
  "assets/fonts/inter/inter-cyrillic.woff2",
  "assets/fonts/inter/inter-latin.woff2",
  "assets/fonts/oswald/OFL.txt",
  "assets/fonts/oswald/oswald-cyrillic.woff2",
  "assets/fonts/oswald/oswald-latin.woff2",
  "assets/images/association-mosaic/icons/directions.svg",
  "assets/images/association-mosaic/icons/down.svg",
  "assets/images/association-mosaic/icons/goals.svg",
  "assets/images/association-mosaic/icons/members.svg",
  "assets/images/association-mosaic/icons/stages.svg",
  "assets/images/association-mosaic/photos/fertilizer.jpg",
  "assets/images/association-mosaic/photos/metals.jpg",
  "assets/images/association-mosaic/photos/oil.jpg",
  "assets/images/association-mosaic/photos/pistachios.jpg",
  "assets/images/association-mosaic/photos/sugar.jpg",
  "assets/images/association-mosaic/photos/timber.jpg",
  "assets/images/association-mosaic/photos/wheat.jpg",
  "assets/images/bids-offers-promo/commodity-network.png",
  "assets/images/bids-offers-promo/section-background.png",
  "assets/images/bids-offers-promo/terminal-photo.png",
  "assets/images/brand/logo-ace.svg",
  "assets/images/brand/logo-caption.svg",
  "assets/images/contact/attach-file.svg",
  "assets/images/countries/logos/asia-europe-exchange.png",
  "assets/images/countries/logos/butb.png",
  "assets/images/countries/logos/emx.png",
  "assets/images/countries/logos/ets.png",
  "assets/images/countries/logos/ime.png",
  "assets/images/countries/logos/irenex.png",
  "assets/images/countries/logos/spimex.png",
  "assets/images/countries/logos/uzex.png",
  "assets/images/countries/map.png",
  "assets/images/directions/featured-background.png",
  "assets/images/documents/document.svg",
  "assets/images/events/event-link-arrow.svg",
  "assets/images/events/key-event-2.png",
  "assets/images/events/key-event.png",
  "assets/images/flags/flag-belarus.png",
  "assets/images/flags/flag-china.png",
  "assets/images/flags/flag-egypt.png",
  "assets/images/flags/flag-iran.png",
  "assets/images/flags/flag-kazakhstan.png",
  "assets/images/flags/flag-russia.png",
  "assets/images/flags/flag-uzbekistan.png",
  "assets/images/governance/igor-artemyev.png",
  "assets/images/governance/samir-dadashov.png",
  "assets/images/hero/globe-orbit.svg",
  "assets/images/leaders/alexander-osmolovsky.png",
  "assets/images/leaders/igor-artemyev.png",
  "assets/images/leaders/kurmet-orazaev.png",
  "assets/images/leaders/mohammed-nazifi.png",
  "assets/images/leaders/quote.svg",
  "assets/images/leaders/zhang-hongping.png",
  "assets/images/members/asia-europe-exchange.png",
  "assets/images/members/butb.png",
  "assets/images/members/emx.png",
  "assets/images/members/ets.png",
  "assets/images/members/ime.png",
  "assets/images/members/irenex.png",
  "assets/images/members/spimex.png",
  "assets/images/members/uzex.png",
  "assets/images/membership/background.png",
  "assets/images/meta/favicon.ico",
  "assets/images/meta/social-preview.jpg",
  "assets/images/news/article/close.svg",
  "assets/images/news/article/external-link.svg",
  "assets/images/news/article/spief-2025-documents.jpg",
  "assets/images/news/article/spief-2025-signing.jpg",
  "assets/images/news/association-work.png",
  "assets/images/news/strategy-development.png",
  "assets/images/tasks/logo-background.png",
  "assets/images/tasks/logo.svg",
  "assets/images/ui/slider-arrow-left-active.svg",
  "assets/images/ui/slider-arrow-left.svg",
  "assets/images/ui/slider-arrow-right-active.svg",
  "assets/images/ui/slider-arrow-right.svg",
  "assets/js/contact-form.js",
  "assets/js/countries-map.js",
  "assets/js/dot-field.js",
  "assets/js/globe-land-data.js",
  "assets/js/globe-model.js",
  "assets/js/globe.js",
  "assets/js/motion.js",
  "assets/js/navigation.js",
  "assets/js/news-dialog.js",
  "assets/js/news-preview.js",
  "assets/js/preloader.js",
  "assets/js/responsive-slider.js",
  "assets/js/smooth-scroll.js",
  "assets/js/typograph.js",
  "bids-offers/assets/images/icon-back.svg",
  "bids-offers/assets/images/icon-calendar.svg",
  "bids-offers/assets/images/icon-chevron-down.svg",
  "bids-offers/assets/images/icon-close.svg",
  "bids-offers/assets/images/icon-search.svg",
  "bids-offers/assets/images/logo-bids-offers.svg",
  "bids-offers/assets/images/russia-flag.png",
  "bids-offers/assets/images/spimex-logo.png",
  "bids-offers/index.html",
  "bids-offers/script.js",
  "bids-offers/styles.css",
  "index.html",
  "news-preview.html"
]);
const OMITTED_UNUSED = Object.freeze(['assets/images/news/pmief-agreement.png', 'bids-offers/assets/images/logo-ace.svg']);
const LICENSES = ['assets/fonts/inter/OFL.txt', 'assets/fonts/inter-tight/OFL.txt', 'assets/fonts/oswald/OFL.txt'];
const PRIMARY_HASHES = {
  'index.html': '87204b8e3f269f434e54e2d13b22663a8286eb779d1d34a24ea3f21a7935bea8',
  'assets/css/styles.css': '911467288fe77f13ea3f5092411d59db68815424a1f9383a5194439056d1fc29',
  'assets/js/countries-map.js': '56ff3e34a840551c8005877a99d96bfa21f714d79e0e89cea9b7c02fe0f78fc4'
};
const BROWSERS = ['chromium', 'firefox', 'webkit'];
const CASES = ['source-fallbacks', 'popup-1440', 'popup-1280', 'popup-390', 'popup-320',
  'map-320', 'map-390', 'map-599', 'map-600', 'map-900', 'map-901', 'map-1024',
  'map-1180', 'map-1181', 'map-1440', 'map-1920', 'map-2048', 'map-2560',
  'map-resize-continuity', 'map-normal-motion', 'map-touch', 'approved-preview', 'component-resources-and-errors'];
const MAX_BYTES = 128 * 1024 * 1024;
const TEXT_FILE = /\.(?:html?|css|[cm]?js|json|md|txt|svg|xml)$/i;
const AI_MARKERS = /\b(?:ChatGPT|OpenAI|Codex|DALL[ -]?E|Midjourney|ComfyUI|Automatic1111|InvokeAI)\b|Stable Diffusion|Adobe Firefly|Google Imagen|generated[- ]by|ai[- ]generated/i;
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const sorted = values => [...values].sort();
const relativeOK = name => typeof name === 'string' && name.length > 0 && !path.isAbsolute(name) &&
  !/[\\\u0000-\u001f\u007f]/.test(name) && !name.startsWith('-') &&
  name.split('/').every(part => part && part !== '.' && part !== '..' && !part.startsWith('.'));

function options(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--help' || argv[i] === '-h') return null;
    const key = argv[i] === '--qa-report' ? 'qaReport' : argv[i] === '--code-proof' ? 'codeProof' : null;
    assert(key && argv[i + 1] && path.isAbsolute(argv[i + 1]) && !result[key], 'Use unique --qa-report and --code-proof with absolute paths');
    result[key] = argv[++i];
  }
  assert(result.qaReport && result.codeProof, 'Both --qa-report and --code-proof are required');
  return result;
}
async function regular(base, relative) {
  assert(relativeOK(relative), 'Unsafe relative path');
  let current = base;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    assert(!(await fsp.lstat(current)).isSymbolicLink(), 'Symlink refused: ' + relative);
  }
  const real = await fsp.realpath(current);
  assert(real.startsWith(base + path.sep) && (await fsp.lstat(real)).isFile(), 'Expected regular in-root file: ' + relative);
  return real;
}
async function stableRead(file, maximum = MAX_BYTES) {
  const before = await fsp.lstat(file);
  assert(before.isFile() && !before.isSymbolicLink() && before.size <= maximum, 'Unsafe or oversized input: ' + path.basename(file));
  const handle = await fsp.open(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = await handle.stat();
    assert(opened.ino === before.ino && opened.dev === before.dev, 'Input replaced while opening');
    const bytes = await handle.readFile();
    for (const value of [await handle.stat(), await fsp.lstat(file)]) {
      assert(value.ino === before.ino && value.dev === before.dev && value.size === before.size &&
        value.mtimeMs === before.mtimeMs && !value.isSymbolicLink(), 'Input changed while reading');
    }
    assert(bytes.length === before.size, 'Incomplete input capture');
    return { bytes, size: bytes.length, sha256: digest(bytes) };
  } finally { await handle.close(); }
}
async function tree(base, relative) {
  const directory = path.join(base, relative), stat = await fsp.lstat(directory);
  assert(stat.isDirectory() && !stat.isSymbolicLink(), 'Expected real asset directory');
  const result = [];
  for (const entry of await fsp.readdir(directory, { withFileTypes: true })) {
    const rel = relative + '/' + entry.name;
    assert(relativeOK(rel) && !entry.isSymbolicLink(), 'Hidden, unsafe or linked asset: ' + rel);
    if (entry.isDirectory()) result.push(...await tree(base, rel));
    else { assert(entry.isFile(), 'Special file in assets'); result.push(rel); }
  }
  return sorted(result);
}
function inspectBytes(name, bytes) {
  assert(!AI_MARKERS.test(TEXT_FILE.test(name) ? bytes.toString('utf8') : bytes.toString('latin1')), 'Service marker requires manual review: ' + name);
  if (!TEXT_FILE.test(name)) return;
  const text = bytes.toString('utf8');
  const secrets = [/-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/,
    /\bgh[pousr]_[A-Za-z0-9]{30,255}\b/, /\bgithub_pat_[A-Za-z0-9_]{50,255}\b/,
    /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,255}\b/, /\bAKIA[0-9A-Z]{16}\b/];
  assert(!secrets.some(pattern => pattern.test(text)), 'Credential-like content refused without printing: ' + name);
}
function inspectReferences(files) {
  const references = [], fragments = [], external = [], failures = [], ids = new Map();
  for (const [name, bytes] of files) if (/\.(?:html|svg)$/.test(name)) {
    ids.set(name, new Set([...bytes.toString('utf8').matchAll(/\bid\s*=\s*["']([^"']+)["']/g)].map(match => match[1])));
  }
  function add(from, raw, base = path.posix.dirname(from)) {
    let url = raw.trim().replace(/&amp;/g, '&');
    if (!url || /^(?:data:|mailto:|tel:)/i.test(url)) return;
    assert(!/^javascript:/i.test(url), 'JavaScript URL refused');
    if (/^(?:https?:)?\/\//i.test(url)) {
      external.push({ from, url });
      const prefix = 'https://imonsergey.github.io/ACE-CLIENT-DEPLOY/';
      if (url.startsWith(prefix)) references.push({ from, target: url.slice(prefix.length), kind: 'social-preview-copy' });
      return;
    }
    const hashAt = url.indexOf('#'), fragment = hashAt < 0 ? null : url.slice(hashAt + 1);
    url = url.split(/[?#]/)[0];
    if (!url) { if (fragment) fragments.push({ from, target: from, fragment }); return; }
    let target = path.posix.normalize(url.startsWith('/') ? url.slice(1) : path.posix.join(base, url));
    if (target === '.' || url.endsWith('/')) target = path.posix.join(target, 'index.html');
    if (!files.has(target) && files.has(target + '/index.html')) target += '/index.html';
    if (!relativeOK(target) || !files.has(target)) failures.push({ from, target, reason: 'missing local dependency' });
    references.push({ from, target, kind: 'local' });
    if (fragment) fragments.push({ from, target, fragment });
  }
  for (const [name, bytes] of files) {
    if (!/\.(?:html|css|js|svg)$/.test(name)) continue;
    const text = bytes.toString('utf8');
    if (/\.(?:html|svg)$/.test(name)) {
      for (const match of text.matchAll(/\b(src|href|xlink:href|poster|action|content)\s*=\s*(["'])(.*?)\2/gs)) {
        if (match[1] !== 'content' || /^(?:https?:)?\/\//i.test(match[3]) || /\.(?:png|jpe?g|webp|svg)(?:[?#]|$)/i.test(match[3])) add(name, match[3]);
      }
      for (const match of text.matchAll(/\bsrcset\s*=\s*["']([^"']+)["']/g)) {
        assert(!match[1].includes('data:'), 'Review data URLs in srcset manually');
        for (const candidate of match[1].split(',')) add(name, candidate.trim().split(/\s+/)[0]);
      }
    }
    if (/\.(?:css|svg)$/.test(name)) {
      for (const match of text.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)) add(name, match[1]);
      if (/\.css$/.test(name)) for (const match of text.matchAll(/@import\s+["']([^"']+)["']/g)) add(name, match[1]);
    }
    if (/\.js$/.test(name)) {
      for (const match of text.matchAll(/(?:from|import)\s*["']([^"']+)["']/g)) add(name, match[1]);
      for (const match of text.matchAll(/["']((?:\.{0,2}\/)?assets\/[^"']+\.(?:png|jpe?g|svg|webp|woff2|css|js))["']/g)) {
        add(name, match[1], name.startsWith('bids-offers/') ? 'bids-offers' : '.');
      }
    }
  }
  for (const link of fragments) if (!ids.get(link.target)?.has(decodeURIComponent(link.fragment))) failures.push({ ...link, reason: 'missing local fragment' });
  for (const ref of references) if (!files.has(ref.target)) failures.push({ ...ref, reason: 'missing linked local asset' });
  assert.equal(failures.length, 0, 'Static local links failed: ' + JSON.stringify(failures));
  const reachable = new Set(['index.html', 'news-preview.html', 'bids-offers/index.html']);
  let changed;
  do {
    changed = false;
    for (const ref of references) if (reachable.has(ref.from) && !reachable.has(ref.target)) { reachable.add(ref.target); changed = true; }
  } while (changed);
  for (const name of LICENSES) reachable.add(name);
  assert.deepEqual(sorted(reachable), sorted(RUNTIME_FILES), 'Dependency closure differs from fixed allowlist');
  return { localReferences: references.length, fragments: fragments.length, missing: [], external: sorted(new Set(external.map(link => link.url))) };
}
function verifyQA(report) {
  assert.equal(report.project, 'ACE-CLIENT-DEPLOY'); assert.equal(report.status, 'passed');
  assert.equal(fs.realpathSync(report.root), ROOT);
  assert.equal(report.checks?.passed, 69); assert.equal(report.checks?.failed, 0); assert.equal(report.cases?.length, 69);
  assert(report.cases.every(item => item.status === 'passed'));
  assert(report.browsers?.length === 3 && report.browsers.every(item => item.status === 'passed'));
  for (const browser of BROWSERS) {
    assert(report.browsers.some(item => item.name === browser));
    for (const name of CASES) assert.equal(report.cases.filter(item => item.browser === browser && item.name === name).length, 1, 'QA case absent: ' + browser + '/' + name);
  }
  assert(Number.isFinite(Date.parse(report.finishedAt)) && Date.parse(report.finishedAt) >= Date.parse(report.startedAt));
  assert.equal(report.canonicalSource?.path, 'docs/news-source.json');
}
function run(command, args, settings = {}) {
  const result = spawnSync(command, args, { timeout: 120000, maxBuffer: 4 * 1024 * 1024, ...settings });
  if (result.error || result.status !== 0) throw new Error(command + ' failed: ' +
    (result.error?.message || result.stderr?.toString('utf8').trim().slice(0, 1000) || String(result.status)));
  return result.stdout;
}
async function safeDirectory(relative, exclusive = false) {
  assert(relativeOK(relative), 'Unsafe output directory');
  let current = ROOT;
  const parts = relative.split('/');
  for (let i = 0; i < parts.length; i += 1) {
    current = path.join(current, parts[i]);
    try { await fsp.mkdir(current); }
    catch (error) { if (error.code !== 'EEXIST' || (exclusive && i === parts.length - 1)) throw error; }
    const stat = await fsp.lstat(current);
    assert(stat.isDirectory() && !stat.isSymbolicLink(), 'Unsafe output ancestor');
  }
  return current;
}
async function writeNew(base, relative, bytes) {
  assert(relativeOK(relative), 'Unsafe output name');
  const destination = path.join(base, relative);
  assert(destination.startsWith(base + path.sep));
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  await fsp.writeFile(destination, bytes, { flag: 'wx', mode: 0o644 });
}
async function main(args) {
  assert.equal(await fsp.realpath(RELEASE), RELEASE, 'Use immutable release, not current');
  assert.equal(RUNTIME_FILES.length, 112);
  const actual = sorted(['index.html', 'news-preview.html', ...await tree(RELEASE, 'assets'), ...await tree(RELEASE, 'bids-offers')]);
  assert.deepEqual(actual, sorted([...RUNTIME_FILES, ...OMITTED_UNUSED]), 'Release inventory changed; review allowlist first');
  const qaCapture = await stableRead(args.qaReport, 8 * 1024 * 1024), qa = JSON.parse(qaCapture.bytes.toString('utf8'));
  verifyQA(qa);
  const proofCapture = await stableRead(args.codeProof, 2 * 1024 * 1024), proof = JSON.parse(proofCapture.bytes.toString('utf8'));
  assert(Array.isArray(proof.files) && proof.files.length > 0, 'Expected nonempty code proof');
  const proven = new Map();
  for (const item of proof.files) {
    assert(relativeOK(item.path) && /^[a-f0-9]{64}$/.test(item.sha256) && !proven.has(item.path), 'Invalid code proof');
    assert.equal((await stableRead(await regular(ROOT, item.path))).sha256, item.sha256, 'Tested source changed: ' + item.path);
    proven.set(item.path, item.sha256);
  }
  for (const name of Object.keys(PRIMARY_HASHES)) assert.equal(proven.get(name), PRIMARY_HASHES[name], 'Required tested runtime hash absent: ' + name);
  assert.equal((await stableRead(await regular(ROOT, 'docs/news-source.json'))).sha256, qa.canonicalSource.sha256, 'Article changed since QA');
  const files = new Map(), records = [];
  for (const name of RUNTIME_FILES) {
    const capture = await stableRead(await regular(RELEASE, name));
    assert.equal((await stableRead(await regular(ROOT, name))).sha256, capture.sha256, 'Checkout/release mismatch: ' + name);
    if (proven.has(name)) assert.equal(capture.sha256, proven.get(name), 'Release differs from tested runtime');
    if (PRIMARY_HASHES[name]) assert.equal(capture.sha256, PRIMARY_HASHES[name]);
    inspectBytes(name, capture.bytes); files.set(name, capture.bytes);
    records.push({ path: name, bytes: capture.size, sha256: capture.sha256 });
  }
  for (const name of LICENSES) assert(files.has(name) && files.get(name).includes(Buffer.from('SIL OPEN FONT LICENSE')), 'Original font license missing');
  const links = inspectReferences(files), readme = await stableRead(await regular(ROOT, README_TEMPLATE), 64 * 1024);
  inspectBytes('README.md', readme.bytes); files.set('README.md', readme.bytes);
  records.push({ path: 'README.md', bytes: readme.size, sha256: readme.sha256 });
  assert([...files.values()].reduce((sum, bytes) => sum + bytes.length, 0) < MAX_BYTES);
  const entries = sorted(files.keys());
  assert(entries.length === 113 && !entries.some(name => /^(?:docs|scripts|deploy|qa|artifacts)\//.test(name)));
  await safeDirectory('artifacts/client-delivery-20261109');
  const archivePath = path.join(OUTPUT, ARCHIVE_NAME), proofPath = path.join(OUTPUT, 'package-proof.json');
  for (const destination of [archivePath, proofPath, path.join(OUTPUT, 'site')]) {
    const existing = await fsp.lstat(destination).catch(error => { if (error.code === 'ENOENT') return null; throw error; });
    assert(!existing, 'Output already exists; nothing is replaced: ' + path.basename(destination));
  }
  const stage = await fsp.mkdtemp(path.join(OUTPUT, 'stage-')), payload = path.join(stage, 'payload');
  await fsp.mkdir(payload);
  for (const [name, bytes] of files) await writeNew(payload, name, bytes);
  const stagedArchive = path.join(stage, ARCHIVE_NAME);
  run('zip', ['-q', '-X', '-@', stagedArchive], { cwd: payload, input: entries.join('\n') + '\n' });
  run('unzip', ['-tqq', stagedArchive]);
  const listed = run('unzip', ['-Z1', stagedArchive], { encoding: 'utf8' }).trimEnd().split('\n');
  assert.deepEqual(sorted(listed), entries, 'ZIP inventory mismatch');
  const restored = path.join(stage, 'restored'); await fsp.mkdir(restored);
  run('unzip', ['-qq', stagedArchive, '-d', restored]);
  for (const record of records) {
    const capture = await stableRead(await regular(restored, record.path));
    assert.equal(capture.sha256, record.sha256, 'Round-trip SHA mismatch');
    assert.equal(capture.size, record.bytes, 'Round-trip size mismatch');
  }
  for (const record of records.filter(item => item.path !== 'README.md')) {
    assert.equal((await stableRead(await regular(RELEASE, record.path))).sha256, record.sha256);
    assert.equal((await stableRead(await regular(ROOT, record.path))).sha256, record.sha256);
  }
  assert.equal((await stableRead(await regular(ROOT, README_TEMPLATE))).sha256, readme.sha256);
  assert.equal((await stableRead(args.qaReport)).sha256, qaCapture.sha256);
  assert.equal((await stableRead(args.codeProof)).sha256, proofCapture.sha256);
  for (const [name, expected] of proven) assert.equal((await stableRead(await regular(ROOT, name))).sha256, expected);
  const archive = await stableRead(stagedArchive), site = await safeDirectory('artifacts/client-delivery-20261109/site', true);
  for (const name of entries) {
    const destination = path.join(site, name); await fsp.mkdir(path.dirname(destination), { recursive: true });
    await fsp.link(path.join(payload, name), destination);
    assert.equal((await stableRead(destination)).sha256, digest(files.get(name)));
  }
  const record = {
    status: 'verified', createdAt: new Date().toISOString(), sourceRelease: RELEASE,
    archive: archivePath, archiveBytes: archive.size, archiveSha256: archive.sha256, site,
    files: records.sort((a, b) => a.path.localeCompare(b.path)), fileCount: entries.length,
    originalQASha256: qaCapture.sha256, originalCodeProofSha256: proofCapture.sha256,
    sourceQaCases: qa.cases.length, sourceQaFinishedAt: qa.finishedAt,
    sourceQaBrowsers: qa.browsers.map(item => ({ name: item.name, version: item.version })),
    excludedUnusedAssets: OMITTED_UNUSED, references: links,
    checks: ['fixed allowlist', 'unchanged tested runtime', 'original font licenses',
      'literal local dependencies and fragments', 'service and secret marker scan',
      'ZIP CRC', 'exact ZIP inventory', 'all round-trip sizes and SHA-256'],
    packagedSiteBrowserAcceptance: 'not performed by this script; validate site before client handoff',
    deploymentPerformed: false
  };
  await fsp.writeFile(proofPath, JSON.stringify(record, null, 2) + '\n', { flag: 'wx', mode: 0o644 });
  await fsp.link(stagedArchive, archivePath);
  assert.equal((await stableRead(archivePath)).sha256, archive.sha256);
  assert(path.dirname(stage) === OUTPUT && /^stage-[A-Za-z0-9]+$/.test(path.basename(stage)) && !(await fsp.lstat(stage)).isSymbolicLink());
  await fsp.rm(stage, { recursive: true, force: false });
  process.stdout.write(JSON.stringify({ status: 'verified', archive: archivePath, bytes: archive.size, sha256: archive.sha256,
    fileCount: entries.length, site, proof: proofPath, checks: record.checks, packagedSiteBrowserAcceptance: record.packagedSiteBrowserAcceptance }, null, 2) + '\n');
}
if (require.main === module) {
  try {
    const args = options(process.argv.slice(2));
    if (!args) process.stdout.write('Usage: imon-node scripts/build-client-package.cjs --qa-report /absolute/report.json --code-proof /absolute/proof.json\n');
    else main(args).catch(error => { process.stderr.write('ACE_CLIENT_PACKAGE_FAILED: ' + error.message + '\nNew staging is preserved; no prior archive is replaced.\n'); process.exitCode = 1; });
  } catch (error) { process.stderr.write('ACE_CLIENT_PACKAGE_FAILED: ' + error.message + '\n'); process.exitCode = 1; }
}
module.exports = { RUNTIME_FILES, OMITTED_UNUSED, LICENSES, inspectReferences, inspectBytes, relativeOK };
