#!/usr/bin/env node
'use strict';

/**
 * Package the reviewed static ACE site, never deploy it.
 * Run on the server only after visual review and a passed three-browser report:
 *   imon-node scripts/build-handoff.cjs --qa-report /absolute/path/report.json
 * Optional code guard: --code-proof /absolute/path/code-proof.json
 * Code proof format: { "files": [{ "path": "index.html", "sha256": "..." }] }
 *
 * Output is fixed: artifacts/handoff/ACE-Верстка.zip. Existing output is never
 * replaced. The script preserves failed staging directories for inspection.
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = fs.realpathSync(path.resolve(__dirname, '..'));
const OUTPUT_DIRECTORY = path.join(ROOT, 'artifacts', 'handoff');
const ARCHIVE_NAME = 'ACE-Верстка.zip';
const OUTPUT = path.join(OUTPUT_DIRECTORY, ARCHIVE_NAME);
const REQUIRED_FILES = ['index.html', 'news-preview.html', '.nojekyll', 'README.md'];
const REQUIRED_DIRECTORIES = ['assets', 'bids-offers', 'docs', 'scripts'];
const BROWSERS = ['chromium', 'firefox', 'webkit'];
const REQUIRED_CASES = ['source-fallbacks', 'popup-1440', 'popup-1280', 'popup-390', 'popup-320', 'map-901', 'map-1024', 'map-1440', 'map-1920', 'approved-preview', 'component-resources-and-errors'];
const SELECTED_SCREENSHOTS = [
  'chromium-approved-preview-1440-top.png',
  'chromium-approved-preview-1440-full.png',
  'chromium-map-1440.png',
  'webkit-popup-390-top.png'
];
const PHOTO_HASHES = new Map([
  ['assets/images/news/article/spief-2025-documents.jpg', '163f24c878e5277f70d199bed96fead3ca66c984ca4156def6f97880b37ea8d1'],
  ['assets/images/news/article/spief-2025-signing.jpg', 'c603b30abc2e39f4d0aa63610070cb20ef180ec993b49851b9e9dcc2d3271818']
]);
const OMIT_SEGMENTS = new Set(['.git', '.hg', '.svn', 'node_modules', 'artifacts', '.DS_Store', 'Thumbs.db', '__pycache__', '.pytest_cache', 'playwright-report', 'test-results', 'coverage']);
const MAX_FILE_BYTES = 64 * 1024 * 1024;
const MAX_PAYLOAD_BYTES = 128 * 1024 * 1024;
const MAX_FILES = 3000;
let staging;
let published = false;

function optionsFrom(argv) {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--help' || argv[i] === '-h') {
      process.stdout.write('Usage: imon-node scripts/build-handoff.cjs --qa-report /absolute/path/report.json [--code-proof /absolute/path/code-proof.json]\nOutput: artifacts/handoff/ACE-Верстка.zip (must not already exist)\n');
      return null;
    }
    const key = argv[i] === '--qa-report' ? 'qaReport' : argv[i] === '--code-proof' ? 'codeProof' : null;
    if (!key || !argv[i + 1] || argv[i + 1].startsWith('--') || options[key]) throw new Error(`Invalid or repeated argument: ${argv[i]}`);
    options[key] = argv[++i];
    if (!path.isAbsolute(options[key])) throw new Error(`${key} must be an absolute path`);
  }
  if (!options.qaReport) throw new Error('A completed passed --qa-report is required; untested archives are not produced.');
  return options;
}

function invariant(condition, message) { if (!condition) throw new Error(message); }
function sha256(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function sorted(values) { return [...values].sort((a, b) => a < b ? -1 : a > b ? 1 : 0); }
function portable(relative) { return relative.split(path.sep).join('/'); }

function validateRelative(relative) {
  invariant(typeof relative === 'string' && relative && !path.isAbsolute(relative), 'Expected a relative package path');
  invariant(!/[\\\u0000-\u001f\u007f]/.test(relative), `Unsafe characters in package path: ${JSON.stringify(relative)}`);
  const parts = relative.split('/');
  invariant(parts.every((part) => part && part !== '.' && part !== '..'), `Unsafe package path: ${relative}`);
  invariant(!relative.startsWith('-'), `Unsafe package path: ${relative}`);
  return relative;
}

function isWhitelisted(relative) {
  return REQUIRED_FILES.includes(relative) || REQUIRED_DIRECTORIES.some((directory) => relative.startsWith(`${directory}/`));
}

function isSensitiveName(relative) {
  return relative.split('/').some((part) =>
    /^\.env(?:\.|$)/i.test(part) ||
    /^(?:credentials?|secrets?|passwords?|keychain|cookies?|auth|tokens?)(?:[._-]|$)/i.test(part) ||
    /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)/i.test(part) ||
    /\.(?:pem|key|p12|pfx|keystore|kdbx|sqlite3?|db|bak|backup)$/i.test(part));
}

function checkTextForSecrets(relative, bytes) {
  if (!/\.(?:html?|css|[cm]?js|json|md|txt|ya?ml|xml|svg)$/i.test(relative)) return;
  const text = bytes.toString('utf8');
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/,
    /\bgh[pousr]_[A-Za-z0-9]{30,255}\b/,
    /\bgithub_pat_[A-Za-z0-9_]{50,255}\b/,
    /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,255}\b/,
    /\bAKIA[0-9A-Z]{16}\b/
  ];
  invariant(!patterns.some((pattern) => pattern.test(text)), `Potential credential material detected in ${relative}; archive refused without printing its contents.`);
}

async function lstatOrNull(file) {
  try { return await fsp.lstat(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function ensureNoSymlinkParents(base, relative) {
  let current = base;
  for (const segment of validateRelative(relative).split('/')) {
    current = path.join(current, segment);
    const stat = await fsp.lstat(current);
    invariant(!stat.isSymbolicLink(), `Symlink not accepted: ${portable(path.relative(base, current))}`);
  }
  const resolved = await fsp.realpath(current);
  invariant(resolved.startsWith(`${base}${path.sep}`), `Path escaped its approved root: ${relative}`);
  return current;
}

async function readStable(file, maxBytes = MAX_FILE_BYTES) {
  const before = await fsp.lstat(file);
  invariant(before.isFile() && !before.isSymbolicLink(), `Expected a regular non-symlink file: ${path.basename(file)}`);
  invariant(before.size <= maxBytes, `File exceeds the bounded package size: ${path.basename(file)}`);
  const handle = await fsp.open(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    const opened = await handle.stat();
    invariant(opened.ino === before.ino && opened.dev === before.dev, `File changed while opening: ${path.basename(file)}`);
    const bytes = await handle.readFile();
    const after = await handle.stat();
    const current = await fsp.lstat(file);
    invariant(after.ino === before.ino && after.dev === before.dev && current.ino === before.ino && current.dev === before.dev &&
      before.size === bytes.length && after.size === before.size && current.size === before.size &&
      after.mtimeMs === before.mtimeMs && current.mtimeMs === before.mtimeMs && !current.isSymbolicLink(),
    `File changed during capture: ${path.basename(file)}`);
    return { bytes, sha256: sha256(bytes), size: bytes.length };
  } finally { await handle.close(); }
}

async function inventory() {
  const files = [];
  const omitted = [];
  async function walk(relative) {
    validateRelative(relative);
    const parts = relative.split('/');
    if (parts.some((part) => OMIT_SEGMENTS.has(part)) ||
      (relative !== '.nojekyll' && parts.some((part) => part.startsWith('.')))) {
      omitted.push(relative); return;
    }
    invariant(!isSensitiveName(relative), `Sensitive-looking path in the whitelist: ${relative}; review it before packaging.`);
    const absolute = await ensureNoSymlinkParents(ROOT, relative);
    const stat = await fsp.lstat(absolute);
    if (stat.isDirectory()) {
      for (const name of sorted(await fsp.readdir(absolute))) await walk(`${relative}/${name}`);
    } else {
      invariant(stat.isFile(), `Special filesystem object refused: ${relative}`);
      files.push(relative);
      invariant(files.length <= MAX_FILES, 'Too many files for this handoff; no archive was published.');
    }
  }
  for (const relative of REQUIRED_FILES) {
    const absolute = await ensureNoSymlinkParents(ROOT, relative);
    invariant((await fsp.lstat(absolute)).isFile(), `Required handoff file missing: ${relative}`);
    await walk(relative);
  }
  for (const relative of REQUIRED_DIRECTORIES) {
    const absolute = await ensureNoSymlinkParents(ROOT, relative);
    invariant((await fsp.lstat(absolute)).isDirectory(), `Required handoff directory missing: ${relative}`);
    await walk(relative);
  }
  return { files: sorted(files), omitted: sorted(omitted) };
}

function validateQA(report) {
  invariant(report && report.status === 'passed' && report.project === 'ACE-CLIENT-DEPLOY', 'QA report is not a passed ACE-CLIENT-DEPLOY run.');
  invariant(typeof report.root === 'string' && fs.realpathSync(report.root) === ROOT, 'QA report belongs to a different checkout.');
  invariant(Number.isFinite(Date.parse(report.startedAt)) && Number.isFinite(Date.parse(report.finishedAt)) && Date.parse(report.finishedAt) >= Date.parse(report.startedAt), 'QA report has no valid completion time.');
  invariant(Array.isArray(report.browsers) && Array.isArray(report.cases), 'QA report is incomplete.');
  invariant(report.browsers.every((browser) => browser.status === 'passed') && report.cases.every((entry) => entry.status === 'passed'), 'QA contains failed, pending or interrupted work.');
  for (const browser of BROWSERS) {
    invariant(report.browsers.filter((entry) => entry.name === browser && entry.status === 'passed').length === 1, `Passed ${browser} result is required.`);
    for (const name of REQUIRED_CASES) invariant(report.cases.filter((entry) => entry.browser === browser && entry.name === name && entry.status === 'passed').length === 1, `Missing completed QA case: ${browser} ${name}`);
  }
  invariant(report.checks?.failed === 0 && report.checks?.passed === report.cases.length, 'QA totals are inconsistent.');
  invariant(report.canonicalSource?.path === 'docs/news-source.json' && /^[a-f0-9]{64}$/.test(report.canonicalSource?.sha256 || ''), 'Canonical article proof is missing from QA.');
}

function screenshotNames(report) {
  const names = new Set();
  for (const entry of report.cases) {
    const references = [...(entry.evidence?.screenshots || []), entry.evidence?.screenshot].filter(Boolean);
    for (const reference of references) {
      invariant(typeof reference === 'string' && /^[a-z0-9-]+\.png$/.test(reference), 'QA contains an unsafe screenshot reference.');
      names.add(reference);
    }
  }
  return names;
}

function sanitizeQA(report, qaDirectory) {
  const selected = new Set(SELECTED_SCREENSHOTS);
  const localPrefix = new RegExp(`https?:\\/\\/127\\.0\\.0\\.1:\\d+${(report.basePath || '/').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'g');
  function clean(value, key) {
    if (key === 'screenshots' && Array.isArray(value)) return value.filter((name) => selected.has(name));
    if (key === 'screenshot') return selected.has(value) ? value : null;
    if (typeof value === 'string') {
      return value.split(`${ROOT}${path.sep}`).join('./').split(`${qaDirectory}${path.sep}`).join('qa/')
        .replace(localPrefix, './').replace(/(?:file:\/\/)?\/(?:home|Users|workspace)\/[^\s"<>]+/g, '[local path]');
    }
    if (Array.isArray(value)) return value.map((entry) => clean(entry));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([name, entry]) => [name, clean(entry, name)]));
    return value;
  }
  const copy = clean(report);
  copy.root = '.';
  copy.output = 'qa';
  copy.handoff = { screenshotSelection: SELECTED_SCREENSHOTS, localPathsRemoved: true, note: 'Only the listed selected screenshots are attached; omitted screenshot references were removed.' };
  return copy;
}

async function makeSafeOutputDirectory() {
  let current = ROOT;
  for (const name of ['artifacts', 'handoff']) {
    current = path.join(current, name);
    const stat = await lstatOrNull(current);
    if (!stat) await fsp.mkdir(current);
    const checked = await fsp.lstat(current);
    invariant(checked.isDirectory() && !checked.isSymbolicLink(), `Output directory must not be a symlink: ${current}`);
  }
  invariant(!(await lstatOrNull(OUTPUT)), 'ACE-Верстка.zip already exists. Nothing was overwritten; inspect or archive the existing result explicitly.');
}

async function writePayload(payload, relative, bytes, records) {
  validateRelative(relative);
  const destination = path.join(payload, relative);
  invariant(destination.startsWith(`${payload}${path.sep}`), 'Payload destination escaped staging.');
  await fsp.mkdir(path.dirname(destination), { recursive: true });
  await fsp.writeFile(destination, bytes, { flag: 'wx', mode: 0o644 });
  records.push({ path: relative, bytes: bytes.length, sha256: sha256(bytes) });
}

function run(command, args, settings = {}) {
  const result = spawnSync(command, args, { timeout: 120000, maxBuffer: 4 * 1024 * 1024, ...settings });
  if (result.error || result.status !== 0) throw new Error(`${command} failed: ${result.error?.message || result.stderr?.toString('utf8').trim().slice(0, 1200) || `exit ${result.status}, signal ${result.signal || 'none'}`}`);
  return result.stdout;
}

function aggregateHash(records) {
  return sha256(Buffer.from(records.map((record) => `${record.sha256}  ${record.path}\n`).join(''), 'utf8'));
}

async function main(options) {
  const reportCapture = await readStable(options.qaReport, 8 * 1024 * 1024);
  const qa = JSON.parse(reportCapture.bytes.toString('utf8'));
  validateQA(qa);
  const qaDirectory = await fsp.realpath(path.dirname(options.qaReport));
  const references = screenshotNames(qa);
  for (const filename of SELECTED_SCREENSHOTS) invariant(references.has(filename), `Required screenshot is not referenced by the passed QA report: ${filename}`);
  const sourceInventory = await inventory();
  await makeSafeOutputDirectory();
  staging = await fsp.mkdtemp(path.join(OUTPUT_DIRECTORY, 'stage-'));
  const payload = path.join(staging, 'payload');
  await fsp.mkdir(payload);
  const records = [];
  const sourceRecords = [];
  let totalBytes = 0;
  for (const relative of sourceInventory.files) {
    invariant(isWhitelisted(relative), `File outside handoff whitelist: ${relative}`);
    const absolute = await ensureNoSymlinkParents(ROOT, relative);
    const capture = await readStable(absolute);
    checkTextForSecrets(relative, capture.bytes);
    totalBytes += capture.size;
    invariant(totalBytes <= MAX_PAYLOAD_BYTES, 'Handoff payload exceeds 128 MiB; no archive was published.');
    await writePayload(payload, relative, capture.bytes, records);
    sourceRecords.push(records.at(-1));
  }
  const sourceByPath = new Map(sourceRecords.map((record) => [record.path, record]));
  assert.equal(sourceByPath.get('docs/news-source.json')?.sha256, qa.canonicalSource.sha256, 'Canonical article changed since the passed QA run');
  for (const [relative, expected] of PHOTO_HASHES) assert.equal(sourceByPath.get(relative)?.sha256, expected, `Approved photograph changed: ${relative}`);
  for (const entry of qa.cases.filter((entry) => /^popup-\d+$/.test(entry.name))) {
    invariant(entry.evidence?.photoProofs?.length === 2, `Photo proof missing in ${entry.browser} ${entry.name}`);
    for (const proof of entry.evidence.photoProofs) {
      invariant(PHOTO_HASHES.get(proof.path) === proof.sha256, `QA photo identity does not match the approved source: ${entry.browser} ${entry.name}`);
      assert.equal(sourceByPath.get(proof.path)?.sha256, proof.sha256, 'A photo no longer matches the tested bytes');
    }
  }

  let codeProof = null;
  if (options.codeProof) {
    const proofCapture = await readStable(options.codeProof, 2 * 1024 * 1024);
    const proof = JSON.parse(proofCapture.bytes.toString('utf8'));
    invariant(Array.isArray(proof.files) && proof.files.length > 0, 'Code proof must contain a nonempty files array.');
    const seen = new Set();
    const files = proof.files.map((entry) => {
      validateRelative(entry.path);
      invariant(isWhitelisted(entry.path) && !seen.has(entry.path) && /^[a-f0-9]{64}$/.test(entry.sha256 || ''), `Invalid code proof entry: ${entry.path}`);
      seen.add(entry.path);
      assert.equal(sourceByPath.get(entry.path)?.sha256, entry.sha256, `Code proof mismatch: ${entry.path}`);
      return { path: entry.path, sha256: entry.sha256 };
    });
    codeProof = { supplied: true, originalSha256: proofCapture.sha256, verifiedFiles: files.length, embedded: 'qa/code-proof.json' };
    await writePayload(payload, codeProof.embedded, Buffer.from(`${JSON.stringify({ files }, null, 2)}\n`), records);
  }

  for (const filename of SELECTED_SCREENSHOTS) {
    const absolute = await ensureNoSymlinkParents(qaDirectory, filename);
    const capture = await readStable(absolute);
    invariant(capture.bytes.length >= 24 && capture.bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && capture.bytes.toString('ascii', 12, 16) === 'IHDR', `Screenshot is not a PNG: ${filename}`);
    const width = capture.bytes.readUInt32BE(16);
    const height = capture.bytes.readUInt32BE(20);
    invariant(width === (filename.startsWith('webkit-popup-390') ? 390 : 1440) && height > 0 && height <= 12000, `Unexpected screenshot geometry: ${filename}`);
    await writePayload(payload, `qa/${filename}`, capture.bytes, records);
    totalBytes += capture.size;
  }
  const embeddedReport = Buffer.from(`${JSON.stringify(sanitizeQA(qa, qaDirectory), null, 2)}\n`, 'utf8');
  checkTextForSecrets('qa/report.json', embeddedReport);
  await writePayload(payload, 'qa/report.json', embeddedReport, records);
  totalBytes += embeddedReport.length;
  invariant(totalBytes <= MAX_PAYLOAD_BYTES, 'Handoff including evidence exceeds 128 MiB; no archive was published.');

  // Refuse concurrent edits or newly added whitelist files instead of silently
  // shipping a mixture of source states. No source file is changed here.
  const currentInventory = await inventory();
  assert.deepEqual(currentInventory.files, sourceInventory.files, 'Whitelisted source files changed during packaging');
  for (const record of sourceRecords) {
    const capture = await readStable(await ensureNoSymlinkParents(ROOT, record.path));
    assert.equal(capture.sha256, record.sha256, `Source changed during packaging: ${record.path}`);
  }
  assert.equal((await readStable(options.qaReport, 8 * 1024 * 1024)).sha256, reportCapture.sha256, 'QA report changed during packaging');

  records.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const runtimeCode = sourceRecords.filter((record) => /\.(?:html?|css|[cm]?js)$/i.test(record.path) && !record.path.startsWith('docs/') && !record.path.startsWith('scripts/'));
  const manifest = {
    formatVersion: 1, project: 'ACE-CLIENT-DEPLOY', purpose: 'Static markup handoff; not a production deployment',
    createdAt: new Date().toISOString(),
    source: { root: '.', files: sourceRecords.length, bytes: sourceRecords.reduce((sum, record) => sum + record.bytes, 0),
      fingerprintSha256: aggregateHash(sourceRecords), runtimeCodeFingerprintSha256: aggregateHash(runtimeCode), omitted: sourceInventory.omitted },
    verification: { status: 'passed', browsers: BROWSERS, cases: qa.cases.length, completedAt: qa.finishedAt,
      originalReportSha256: reportCapture.sha256, report: 'qa/report.json', screenshots: SELECTED_SCREENSHOTS.map((name) => `qa/${name}`),
      codeProof: codeProof || { supplied: false, note: 'Archive code hashes are recorded. Automatic QA-to-code equality is limited to the canonical article/photo proofs; the packager does not infer a historical code fingerprint.' },
      visualReview: 'Performed separately by the person or agent invoking this packager; not inferred from automated tests.' },
    archive: { fileCount: records.length + 1, payloadBytes: records.reduce((sum, record) => sum + record.bytes, 0),
      manifest: 'manifest.json', note: 'files and payloadBytes exclude this self-describing manifest; fileCount includes it. Final ZIP size and SHA-256 are printed after verification.' },
    files: records
  };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  invariant(manifest.archive.payloadBytes + manifestBytes.length <= MAX_PAYLOAD_BYTES, 'Payload plus manifest exceeds 128 MiB; no archive was published.');
  await fsp.writeFile(path.join(payload, 'manifest.json'), manifestBytes, { flag: 'wx', mode: 0o644 });
  const archiveEntries = sorted([...records.map((record) => record.path), 'manifest.json']);
  const stagedArchive = path.join(staging, ARCHIVE_NAME);
  run('zip', ['-q', '-X', '-@', stagedArchive], { cwd: payload, input: `${archiveEntries.join('\n')}\n` });
  run('unzip', ['-tqq', stagedArchive]);
  const actualEntries = run('unzip', ['-Z1', stagedArchive], { encoding: 'utf8' }).trimEnd().split('\n');
  actualEntries.forEach(validateRelative);
  assert.deepEqual(sorted(actualEntries), archiveEntries, 'ZIP entry list does not match the exact manifest inventory');

  // Round-trip every byte, not only ZIP CRC. The verified exact entry list has
  // no traversal, links or special files; extraction stays in this new stage.
  const restored = path.join(staging, 'roundtrip');
  await fsp.mkdir(restored);
  run('unzip', ['-qq', stagedArchive, '-d', restored]);
  for (const record of [...records, { path: 'manifest.json', sha256: sha256(manifestBytes), bytes: manifestBytes.length }]) {
    const capture = await readStable(await ensureNoSymlinkParents(restored, record.path));
    assert.equal(capture.size, record.bytes, `Restored file size mismatch: ${record.path}`);
    assert.equal(capture.sha256, record.sha256, `Restored file hash mismatch: ${record.path}`);
  }
  const archive = await readStable(stagedArchive, MAX_PAYLOAD_BYTES);
  invariant(archive.size > 0, 'ZIP output is empty');
  // Hard-link publication is atomic and fails with EEXIST rather than replacing
  // an existing user result. Stage and destination are on the same filesystem.
  await ensureNoSymlinkParents(ROOT, 'artifacts/handoff');
  invariant(await fsp.realpath(staging) === staging, 'Staging path changed before publication.');
  await fsp.link(stagedArchive, OUTPUT);
  published = true;
  const finalCapture = await readStable(OUTPUT, MAX_PAYLOAD_BYTES);
  assert.equal(finalCapture.sha256, archive.sha256, 'Published ZIP does not match the verified staging ZIP');
  invariant(path.dirname(staging) === OUTPUT_DIRECTORY && /^stage-[A-Za-z0-9]+$/.test(path.basename(staging)) && !(await fsp.lstat(staging)).isSymbolicLink(), 'Refusing unsafe temporary cleanup');
  await fsp.rm(staging, { recursive: true, force: false });
  staging = null;
  process.stdout.write(`${JSON.stringify({ status: 'verified', archive: portable(path.relative(ROOT, OUTPUT)), bytes: archive.size, sha256: archive.sha256,
    sourceFiles: sourceRecords.length, archiveFiles: archiveEntries.length, manifestSha256: sha256(manifestBytes),
    runtimeCodeFingerprintSha256: manifest.source.runtimeCodeFingerprintSha256, qaCases: qa.cases.length, browsers: BROWSERS,
    checks: ['zip exit 0', 'unzip -tqq', 'exact entry inventory', 'all restored sizes and SHA-256', 'exclusive publication', 'final archive SHA-256'],
    productionPublished: false }, null, 2)}\n`);
}

const options = optionsFrom(process.argv.slice(2));
if (options) main(options).catch((error) => {
  process.stderr.write(`ACE_HANDOFF_FAILED: ${error.message}\n`);
  if (staging) process.stderr.write(`Staging preserved for inspection: ${staging}\n`);
  if (published) process.stderr.write(`A newly created archive remains at ${OUTPUT}; inspect it before any new packaging attempt.\n`);
  process.exitCode = 1;
});
