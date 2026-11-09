#!/usr/bin/env node
'use strict';

/**
 * Publish the accepted ACE static preview only. Default mode is read-only.
 * No Git writes, network calls, Nginx/DNS/CMS changes or old-release deletion.
 *
 * imon-node deploy/publish-preview.cjs --commit <40hex> --qa-report /abs/report.json
 *   --code-proof /abs/proof.json
 *   --expected-current /srv/ace-preview/releases/20261107-36c9049 [--apply]
 *
 * Run --apply only after personally reviewing the accepted PNGs. The script
 * verifies machine-readable evidence; it cannot establish a visual review.
 */
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = '/home/sergey/Projects/ACE-CLIENT-DEPLOY';
const BASE = '/srv/ace-preview';
const RELEASES = BASE + '/releases';
const CURRENT = BASE + '/current';
const OLD_RELEASE = RELEASES + '/20261107-36c9049';
const BRANCH = 'feature/news-popup-map-20261106';
const PUBLIC_ROOTS = ['index.html', 'news-preview.html', 'assets', 'bids-offers', '.nojekyll'];
const BROWSERS = ['chromium', 'firefox', 'webkit'];
const CASES = ['source-fallbacks', 'popup-1440', 'popup-1280', 'popup-390', 'popup-320',
  'map-320', 'map-390', 'map-599', 'map-600', 'map-900', 'map-901', 'map-1024', 'map-1180', 'map-1181',
  'map-1440', 'map-1920', 'map-2048', 'map-2560', 'map-resize-continuity', 'map-normal-motion', 'map-touch',
  'approved-preview', 'component-resources-and-errors'];
const PROOF_FILES = [
  'assets/css/fonts.css', 'assets/css/motion.css', 'assets/css/news-dialog.css',
  'assets/css/news-preview.css', 'assets/css/styles.css', 'assets/images/countries/map.png',
  'assets/js/contact-form.js', 'assets/js/countries-map.js', 'assets/js/dot-field.js',
  'assets/js/globe-land-data.js', 'assets/js/globe-model.js', 'assets/js/globe.js',
  'assets/js/motion.js', 'assets/js/navigation.js', 'assets/js/news-dialog.js', 'assets/js/news-preview.js',
  'assets/js/preloader.js', 'assets/js/responsive-slider.js', 'assets/js/smooth-scroll.js', 'assets/js/typograph.js',
  'bids-offers/index.html', 'bids-offers/script.js', 'bids-offers/styles.css',
  'docs/map-reference-20261107.json', 'docs/news-source.json', 'index.html', 'news-preview.html',
  'scripts/build-handoff.cjs', 'scripts/map-reference-contract.cjs', 'scripts/verify-handoff.cjs',
];
const NEWS_HASHES = {
  'assets/css/news-dialog.css': '1c90c374ea221098be60be40b99d83be669dd3ec79876582d25c17697427a7da',
  'assets/js/news-dialog.js': 'ede595fc209d8638bea67e5696728430bd58afe762bbd9dce2338f575d4551ff',
  'assets/images/news/article/spief-2025-documents.jpg': '163f24c878e5277f70d199bed96fead3ca66c984ca4156def6f97880b37ea8d1',
  'assets/images/news/article/spief-2025-signing.jpg': 'c603b30abc2e39f4d0aa63610070cb20ef180ec993b49851b9e9dcc2d3271818',
};
const MAX_FILE = 64 * 1024 * 1024;
const MAX_PUBLIC = 128 * 1024 * 1024;
let receiptFd;
let receiptPath;
let switched = false;
let plannedRelease;
let pendingSymlink;

function invariant(value, message) { assert.ok(value, message); }
function digest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function sorted(values) { return [...values].sort(); }
function exists(file) { try { return fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; } }
function optionsFrom(argv) {
  const options = { apply: false };
  const flags = { '--commit': 'commit', '--qa-report': 'qaReport', '--code-proof': 'codeProof', '--expected-current': 'expectedCurrent' };
  if (argv.length === 1 && ['--help', '-h'].includes(argv[0])) return null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--apply') { invariant(!options.apply, 'Duplicate --apply'); options.apply = true; continue; }
    const key = flags[argv[i]];
    invariant(key && !options[key] && argv[i + 1] && !argv[i + 1].startsWith('--'), 'Unknown, missing or repeated argument');
    options[key] = argv[++i];
  }
  invariant(/^[a-f0-9]{40}$/.test(options.commit || ''), '--commit must be an exact lowercase 40-hex commit');
  for (const key of ['qaReport', 'codeProof', 'expectedCurrent']) invariant(path.isAbsolute(options[key] || ''), key + ' must be absolute');
  assert.equal(options.expectedCurrent, OLD_RELEASE, 'This release procedure only accepts the reviewed previous ACE release');
  return options;
}
function run(command, args, settings = {}) {
  const result = spawnSync(command, args, { cwd: ROOT, timeout: 120000, maxBuffer: MAX_PUBLIC + 1024 * 1024,
    env: { ...process.env, GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' }, ...settings });
  if (result.error || result.status !== 0) throw new Error(command + ' failed: ' +
    (result.error?.message || result.stderr?.toString('utf8').trim().slice(0, 1200) || 'exit ' + result.status));
  return result.stdout;
}
function git(args) { return run('git', args); }
function sudo(args, settings) { return run('sudo', ['-n', ...args], settings); }
function noSymlink(file) {
  const absolute = path.resolve(file);
  let current = path.parse(absolute).root;
  for (const segment of absolute.slice(current.length).split('/').filter(Boolean)) {
    current = path.join(current, segment);
    invariant(!fs.lstatSync(current).isSymbolicLink(), 'Unexpected symlink: ' + current);
  }
  return absolute;
}
function readStable(file, limit = MAX_FILE) {
  noSymlink(file);
  const fd = fs.openSync(file, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    const before = fs.fstatSync(fd);
    invariant(before.isFile() && before.size <= limit, 'Not a bounded regular file: ' + file);
    const bytes = fs.readFileSync(fd);
    const after = fs.fstatSync(fd);
    const current = fs.lstatSync(file);
    invariant(!current.isSymbolicLink() && before.ino === after.ino && before.ino === current.ino &&
      before.dev === current.dev && before.size === bytes.length && before.size === after.size &&
      before.mtimeMs === after.mtimeMs && before.mtimeMs === current.mtimeMs, 'File changed while reading: ' + file);
    return { bytes, sha256: digest(bytes), size: bytes.length };
  } finally { fs.closeSync(fd); }
}
function safeRelative(relative) {
  invariant(typeof relative === 'string' && relative && !path.isAbsolute(relative) &&
    !/[\\\u0000-\u001f\u007f]/.test(relative) && !relative.startsWith('-') &&
    relative.split('/').every(segment => segment && segment !== '.' && segment !== '..'),
  'Unsafe tree path: ' + JSON.stringify(relative));
  return relative;
}
function publicPath(relative) {
  return PUBLIC_ROOTS.includes(relative) || ['assets/', 'bids-offers/'].some(prefix => relative.startsWith(prefix));
}
function rejectSensitiveName(relative) {
  const bad = relative.split('/').some(segment =>
    (segment.startsWith('.') && relative !== '.nojekyll') ||
    /^(?:credentials?|secrets?|passwords?|keychain|cookies?|auth|tokens?|api[-_]?keys?|private[-_]?keys?|access[-_]?tokens?)(?:[._-]|$)/i.test(segment) ||
    /^id_(?:rsa|dsa|ecdsa|ed25519)(?:\.|$)/i.test(segment) ||
    /\.(?:pem|key|p12|pfx|keystore|kdbx|sqlite3?|db|bak|backup)$/i.test(segment));
  invariant(!bad, 'Sensitive-looking name refused from public tree: ' + relative);
}
function rejectSecrets(relative, bytes) {
  if (!/\.(?:html?|css|[cm]?js|json|svg|txt|xml)$/i.test(relative)) return;
  const text = bytes.toString('utf8');
  invariant(![
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----/,
    /\bgh[pousr]_[A-Za-z0-9]{30,255}\b/, /\bgithub_pat_[A-Za-z0-9_]{50,255}\b/,
    /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{40,255}\b/, /\bAKIA[0-9A-Z]{16}\b/,
  ].some(pattern => pattern.test(text)), 'Potential credential content refused in ' + relative);
}
function tree(commit) {
  const raw = git(['ls-tree', '-r', '-z', '--full-tree', commit, '--', ...PUBLIC_ROOTS]);
  invariant(Buffer.from(raw.toString('utf8'), 'utf8').equals(raw), 'Non-UTF8 Git path refused');
  const entries = raw.toString('utf8').split('\0').filter(Boolean).map(record => {
    const match = record.match(/^(\d+) (\w+) ([a-f0-9]{40})\t(.+)$/);
    invariant(match && match[1] === '100644' && match[2] === 'blob', 'Public Git tree contains a symlink, executable or non-regular entry');
    const relative = safeRelative(match[4]);
    invariant(publicPath(relative), 'Unexpected public tree member');
    rejectSensitiveName(relative);
    return { path: relative, oid: match[3] };
  });
  invariant(entries.length > 10 && entries.length < 3000 && new Set(entries.map(entry => entry.path)).size === entries.length, 'Invalid public tree inventory');
  for (const root of PUBLIC_ROOTS) invariant(entries.some(entry => entry.path === root || entry.path.startsWith(root + '/')), 'Missing public root: ' + root);
  return entries;
}
function validateQA(qa, proof) {
  assert.equal(qa.project, 'ACE-CLIENT-DEPLOY');
  assert.equal(qa.status, 'passed', 'Completed passed QA required');
  assert.equal(fs.realpathSync(qa.root), ROOT, 'QA belongs to a different checkout');
  invariant(Number.isFinite(Date.parse(qa.startedAt)) && Number.isFinite(Date.parse(qa.finishedAt)) &&
    Date.parse(qa.finishedAt) >= Date.parse(qa.startedAt) &&
    Date.parse(qa.finishedAt) <= Date.now() + 60000 &&
    Date.parse(proof.capturedAt) <= Date.parse(qa.startedAt), 'Proof must precede a completed QA run');
  assert.equal(qa.browsers?.length, 3, 'All three browser engines are required');
  assert.equal(qa.cases?.length, 69, 'Exactly the 69-case acceptance suite is required');
  assert.equal(qa.checks?.passed, 69);
  assert.equal(qa.checks?.failed, 0);
  for (const browser of BROWSERS) {
    assert.equal(qa.browsers.filter(item => item.name === browser && item.status === 'passed').length, 1, 'Missing passed browser ' + browser);
    for (const name of CASES) assert.equal(qa.cases.filter(item => item.browser === browser && item.name === name && item.status === 'passed').length, 1,
      'Missing unique passed case ' + browser + '/' + name);
  }
  const byPath = new Map(proof.files.map(entry => [entry.path, entry.sha256]));
  assert.equal(qa.canonicalSource?.path, 'docs/news-source.json');
  assert.equal(qa.canonicalSource?.sha256, byPath.get('docs/news-source.json'), 'QA article source no longer matches proof');
  assert.equal(qa.mapReference?.sha256, byPath.get('docs/map-reference-20261107.json'), 'QA reference contract no longer matches proof');
  assert.equal(qa.mapReference?.referenceSha256, proof.referenceSha256, 'QA references a different client screenshot');
  assert.equal(proof.referenceSha256, 'b07a311f575390ee0d2041f38f3e2822d1d30c28fe2a40ef4ddcb23f05b20776',
    'Only the supplied complete client screenshot is the accepted map reference');
  for (const entry of qa.cases.filter(item => /^map-\d+$/.test(item.name)))
    assert.equal(entry.evidence?.referenceGeometry?.passed, true, 'Independent map geometry did not pass');
  for (const entry of qa.cases.filter(item => item.name === 'map-normal-motion'))
    assert.equal(entry.evidence?.maxEndpointTolerancePx, 1, 'Connector tolerance must remain one CSS pixel');
}
function currentTarget(expected) {
  const stat = fs.lstatSync(CURRENT);
  invariant(stat.isSymbolicLink() && stat.uid === 0, 'Current must be the existing root-owned ACE symlink');
  const actual = fs.realpathSync(CURRENT);
  assert.equal(actual, expected, 'ACE current changed; stop rather than replacing a different release');
  invariant(fs.statSync(actual).isDirectory(), 'Current release is not a directory');
  return actual;
}
function verifyInputs(options, releasePath) {
  assert.equal(fs.realpathSync(process.cwd()), ROOT, 'Run from the verified ACE checkout');
  assert.equal(fs.realpathSync(path.resolve(__dirname, '..')), ROOT, 'Deployment script belongs to a different checkout');
  assert.equal(git(['rev-parse', '--show-toplevel']).toString().trim(), ROOT);
  assert.equal(git(['symbolic-ref', '--short', 'HEAD']).toString().trim(), BRANCH, 'Only the approved feature branch may publish this preview');
  assert.equal(git(['rev-parse', 'HEAD']).toString().trim(), options.commit, 'Requested commit must be current HEAD');
  assert.equal(git(['cat-file', '-t', options.commit]).toString().trim(), 'commit');
  noSymlink(BASE); noSymlink(RELEASES); noSymlink(OLD_RELEASE);
  for (const directory of [BASE, RELEASES, OLD_RELEASE]) {
    const stat = fs.statSync(directory);
    invariant(stat.isDirectory() && stat.uid === 0 && !(stat.mode & 0o022), 'Release hierarchy must be root-owned and not group/world writable');
  }
  currentTarget(options.expectedCurrent);
  invariant(!exists(releasePath), 'New immutable release already exists; inspect it, do not overwrite');
  for (const input of [options.qaReport, options.codeProof]) {
    invariant(input.startsWith(ROOT + '/artifacts/') || input.startsWith('/home/sergey/Work/Reports/'), 'Evidence must be in ACE artifacts or the server Reports area');
  }
  const qaCapture = readStable(options.qaReport, 16 * 1024 * 1024);
  const proofCapture = readStable(options.codeProof, 1024 * 1024);
  const qa = JSON.parse(qaCapture.bytes);
  const proof = JSON.parse(proofCapture.bytes);
  assert.deepEqual(sorted(proof.files?.map(entry => entry.path) || []), sorted(PROOF_FILES), 'Exact thirty-file tested code proof is required');
  for (const entry of proof.files) {
    safeRelative(entry.path);
    invariant(/^[a-f0-9]{64}$/.test(entry.sha256), 'Invalid proof SHA-256');
    assert.equal(readStable(path.join(ROOT, entry.path)).sha256, entry.sha256, 'Working file differs from tested proof: ' + entry.path);
    assert.equal(digest(git(['show', options.commit + ':' + entry.path])), entry.sha256, 'Git commit differs from tested proof: ' + entry.path);
  }
  validateQA(qa, proof);
  const entries = tree(options.commit);
  let bytes = 0;
  for (const entry of entries) {
    const blob = git(['cat-file', 'blob', entry.oid]);
    invariant(blob.length <= MAX_FILE, 'Public file exceeds bounded size');
    bytes += blob.length;
    invariant(bytes <= MAX_PUBLIC, 'Public release exceeds 128 MiB');
    rejectSecrets(entry.path, blob);
    entry.sha256 = digest(blob);
    entry.bytes = blob.length;
    assert.equal(readStable(path.join(ROOT, entry.path)).sha256, entry.sha256, 'Public working file differs from the exact release commit: ' + entry.path);
  }
  for (const [relative, hash] of Object.entries(NEWS_HASHES))
    assert.equal(entries.find(entry => entry.path === relative)?.sha256, hash, 'Approved news asset changed: ' + relative);
  return { qaSha256: qaCapture.sha256, proofSha256: proofCapture.sha256, cases: 69, browsers: BROWSERS,
    proofFiles: proof.files.length, sourceFingerprint: digest(Buffer.from(entries.map(entry => entry.sha256 + '  ' + entry.path + '\n').join(''))),
    publicBytes: bytes, entries, testedFiles: proof.files };
}
function emitReceipt(event, details) {
  const record = { time: new Date().toISOString(), event, ...details };
  if (receiptFd !== undefined) { fs.writeSync(receiptFd, JSON.stringify(record) + '\n'); fs.fsyncSync(receiptFd); }
  process.stdout.write(JSON.stringify(record) + '\n');
}
function verifyRelease(releasePath, expected) {
  const actual = [];
  function walk(directory, relative = '') {
    for (const name of fs.readdirSync(directory)) {
      const next = relative ? relative + '/' + name : name;
      const file = path.join(directory, name);
      const stat = fs.lstatSync(file);
      invariant(!stat.isSymbolicLink(), 'Release contains an unexpected symlink');
      if (stat.isDirectory()) { invariant(stat.uid === 0 && (stat.mode & 0o777) === 0o755, 'Unexpected release directory owner/mode'); walk(file, next); }
      else { invariant(stat.isFile() && stat.uid === 0 && (stat.mode & 0o777) === 0o644, 'Unexpected release file owner/mode'); actual.push(next); }
    }
  }
  walk(releasePath);
  assert.deepEqual(sorted(actual), sorted(expected.map(entry => entry.path)), 'Extracted release inventory differs from exact Git tree');
  for (const entry of expected) {
    const capture = readStable(path.join(releasePath, entry.path));
    assert.equal(capture.size, entry.bytes, 'Extracted size mismatch: ' + entry.path);
    assert.equal(capture.sha256, entry.sha256, 'Extracted hash mismatch: ' + entry.path);
  }
}
function main(options) {
  const releaseName = '20261109-' + options.commit.slice(0, 12);
  const releasePath = path.join(RELEASES, releaseName);
  plannedRelease = releasePath;
  const evidence = verifyInputs(options, releasePath);
  const summary = { mode: options.apply ? 'apply' : 'dry-run', commit: options.commit, branch: BRANCH,
    release: releasePath, expectedCurrent: options.expectedCurrent, rollbackTarget: options.expectedCurrent,
    qaReport: options.qaReport, qaSha256: evidence.qaSha256, codeProof: options.codeProof,
    proofSha256: evidence.proofSha256, proofFiles: evidence.proofFiles, cases: evidence.cases,
    browsers: evidence.browsers, publicFiles: evidence.entries.length, publicBytes: evidence.publicBytes,
    sourceFingerprint: evidence.sourceFingerprint, scriptSha256: readStable(__filename).sha256,
    visualReview: 'Required separately before --apply; not inferred from this script',
    publicVerificationRequired: ['deploy/verify-public.cjs with the same code proof', 'deploy/smoke-published.cjs'] };
  if (!options.apply) { emitReceipt('validated-dry-run-no-writes', summary); return; }

  // No writes or sudo calls occur above this explicit --apply boundary.
  sudo(['true']);
  const output = path.join(ROOT, 'artifacts', 'deploy');
  noSymlink(output);
  invariant(fs.statSync(output).isDirectory(), 'Existing artifacts/deploy directory required');
  const id = releaseName + '-' + crypto.randomUUID();
  receiptPath = path.join(output, id + '.receipt.jsonl');
  receiptFd = fs.openSync(receiptPath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  emitReceipt('validated-apply-start', { ...summary, receipt: receiptPath });
  const archivePath = path.join(output, id + '.tar');
  const archiveBytes = git(['archive', '--format=tar', options.commit, '--', ...PUBLIC_ROOTS]);
  invariant(archiveBytes.length <= MAX_PUBLIC + 1024 * 1024, 'Public Git archive exceeds bounded size');
  const archiveFd = fs.openSync(archivePath, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
  try {
    fs.writeFileSync(archiveFd, archiveBytes);
    fs.fsyncSync(archiveFd);
  } finally { fs.closeSync(archiveFd); }
  const archive = readStable(archivePath, MAX_PUBLIC + 1024 * 1024);
  assert.equal(archive.sha256, digest(archiveBytes), 'Saved audit archive differs from Git output');
  emitReceipt('archive-created', { path: archivePath, sha256: archive.sha256, bytes: archive.size });

  // All creation is exclusive. A partial failed release is retained for review.
  sudo(['mkdir', '--mode=0755', '--', releasePath]);
  // Extract the exact in-memory Git archive, never reopen a user-writable tar
  // path as root. Git tree entry modes/paths were validated before creation.
  sudo(['tar', '--extract', '--file', '-', '--directory', releasePath, '--no-same-owner', '--no-same-permissions'], { input: archiveBytes });
  sudo(['chown', '-R', 'root:root', '--', releasePath]);
  sudo(['find', releasePath, '-type', 'd', '-exec', 'chmod', '0755', '{}', '+']);
  sudo(['find', releasePath, '-type', 'f', '-exec', 'chmod', '0644', '{}', '+']);
  verifyRelease(releasePath, evidence.entries);
  assert.equal(readStable(options.qaReport, 16 * 1024 * 1024).sha256, evidence.qaSha256, 'QA report changed before activation');
  assert.equal(readStable(options.codeProof, 1024 * 1024).sha256, evidence.proofSha256, 'Code proof changed before activation');
  assert.equal(git(['symbolic-ref', '--short', 'HEAD']).toString().trim(), BRANCH, 'Feature branch changed before activation');
  assert.equal(git(['rev-parse', 'HEAD']).toString().trim(), options.commit, 'HEAD changed before activation');
  for (const entry of evidence.testedFiles)
    assert.equal(readStable(path.join(ROOT, entry.path)).sha256, entry.sha256, 'Tested source changed before activation: ' + entry.path);
  currentTarget(options.expectedCurrent);
  emitReceipt('immutable-release-verified', { release: releasePath, files: evidence.entries.length, sourceFingerprint: evidence.sourceFingerprint });

  const pending = path.join(BASE, '.current-' + crypto.randomUUID());
  invariant(!exists(pending), 'Unexpected pending symlink collision');
  pendingSymlink = pending;
  emitReceipt('prepared-atomic-switch', { pendingSymlink: pending, expectedCurrent: options.expectedCurrent, newRelease: releasePath });
  sudo(['ln', '-s', '--', 'releases/' + releaseName, pending]);
  // Fixed shell source, all paths passed as positional arguments. Under the
  // ACE-only advisory lock, recheck current immediately before atomic rename.
  const switchCode = 'set -euo pipefail\n' +
    'test -L "$1"\n' +
    'test "$(readlink -f -- "$1")" = "$2"\n' +
    'test -L "$3"\n' +
    'test "$(readlink -f -- "$3")" = "$4"\n' +
    'mv -T -- "$3" "$1"\n';
  sudo(['flock', '-n', BASE + '/.publish.lock', '/bin/bash', '-c', switchCode,
    'ace-preview-atomic-switch', CURRENT, options.expectedCurrent, pending, releasePath]);
  switched = true;
  assert.equal(fs.realpathSync(CURRENT), releasePath, 'Current symlink does not point to verified new release');
  invariant(fs.statSync(options.expectedCurrent).isDirectory(), 'Previous release must remain available for rollback');
  emitReceipt('activated-awaiting-public-verification', { ...summary, receipt: receiptPath,
    current: fs.realpathSync(CURRENT), rollbackTarget: options.expectedCurrent, previousReleasePreserved: true,
    nginxDnsCmsRegistryChanged: false, archiveRetained: archivePath });
}

try {
  const options = optionsFrom(process.argv.slice(2));
  if (!options) process.stdout.write('Usage: imon-node deploy/publish-preview.cjs --commit <40hex> --qa-report ABS --code-proof ABS --expected-current ' + OLD_RELEASE + ' [--apply]\nDefault: read-only dry-run. --apply requires a separate completed visual review.\n');
  else main(options);
} catch (error) {
  let observedCurrent = null;
  try { observedCurrent = fs.realpathSync(CURRENT); } catch { /* Preserve the original failure. */ }
  emitReceipt('failed-stop-no-automatic-retry', { message: error.message,
    switched: switched || Boolean(plannedRelease && observedCurrent === plannedRelease), observedCurrent, receipt: receiptPath || null,
    rollbackTarget: OLD_RELEASE, plannedRelease: plannedRelease || null, pendingSymlink: pendingSymlink || null,
    note: 'No old release is deleted. Inspect any partial new release/pending symlink; do not retry blindly.' });
  process.exitCode = 1;
} finally {
  if (receiptFd !== undefined) fs.closeSync(receiptFd);
}
