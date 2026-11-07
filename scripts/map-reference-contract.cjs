#!/usr/bin/env node
'use strict';

/**
 * Pure, independent map geometry contract. No browser, CSS parsing, network or
 * writes. Expected bounds come only from the measured client screenshot.
 *
 * node scripts/map-reference-contract.cjs --self-test
 * node scripts/map-reference-contract.cjs --check-report /path/report.json
 * node scripts/map-reference-contract.cjs --expect-rejected-report /path/old-report.json
 *
 * The last command is a red-before-green control on previously captured DOM
 * geometry. A successful exit means the OLD report was rejected, not that a
 * current live site passed. Source-image bytes are checked by verify-handoff.
 */

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const REFERENCE_PATH = 'docs/map-reference-20261107.json';
const REQUIRED_LOGOS = ['spimex', 'butb', 'ets', 'asia', 'uzex', 'irenex', 'ime', 'emx'];
const BOX_FIELDS = ['x', 'y', 'width', 'height'];

function readMapReference(root = path.resolve(__dirname, '..')) {
  const bytes = fs.readFileSync(path.join(root, REFERENCE_PATH));
  const fixture = JSON.parse(bytes.toString('utf8'));
  assert.equal(fixture.formatVersion, 1, 'Unknown map-reference fixture format');
  for (const role of ['reference', 'source']) {
    assert.ok(fixture[role].width > 0 && fixture[role].height > 0, `Invalid ${role} dimensions`);
    assert.match(fixture[role].sha256, /^[a-f0-9]{64}$/, `Invalid ${role} SHA-256`);
  }
  const fit = fixture.registration.measured;
  assert.ok(fit.scale > 0 && Number.isFinite(fit.translateX) && Number.isFinite(fit.translateY), 'Invalid measured registration');
  assert.deepEqual(fixture.logos.map(({ key }) => key).sort(), [...REQUIRED_LOGOS].sort(), 'Expected exactly the eight measured exchange boxes');
  for (const logo of fixture.logos) {
    assert.ok(BOX_FIELDS.every((field) => Number.isFinite(logo.box[field])) && logo.box.width > 0 && logo.box.height > 0, `Invalid reference box: ${logo.key}`);
  }
  assert.ok(fixture.landmarks.length >= 3 && fixture.landmarks.every((item) =>
    ['sourceCenter', 'referenceCenter'].every((role) => ['x', 'y'].every((field) => Number.isFinite(item[role][field])))), 'Independent coastline landmarks are missing');
  assert.ok(fixture.contract.referenceTolerancePx > 0 && fixture.contract.referenceTolerancePx <= 2 &&
    fixture.contract.layoutRoundingPx >= 0 && fixture.contract.layoutRoundingPx <= 0.1, 'Map tolerance must remain bounded');
  return { fixture, proof: { path: REFERENCE_PATH, sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    referenceSha256: fixture.reference.sha256, sourceSha256: fixture.source.sha256 } };
}

function assessMapReferenceGeometry(geometry, fixture) {
  const checks = [];
  const failures = [];
  function compare(label, actual, expected, tolerance) {
    const delta = Number.isFinite(actual) && Number.isFinite(expected) ? actual - expected : null;
    const check = { label, actual: Number.isFinite(actual) ? actual : null, expected,
      delta, tolerance, passed: delta !== null && Math.abs(delta) <= tolerance };
    checks.push(check);
    if (!check.passed) failures.push(check);
  }
  function condition(label, passed, details) {
    const check = { label, passed: Boolean(passed), ...details };
    checks.push(check);
    if (!check.passed) failures.push(check);
  }
  const section = geometry?.section;
  if (!section || !BOX_FIELDS.every((field) => Number.isFinite(section[field])) || !(section.width > 0)) {
    condition('valid section geometry', false, {});
    return { passed: false, failures, checks };
  }
  const scale = section.width / fixture.reference.width;
  const tolerance = fixture.contract.referenceTolerancePx * scale + fixture.contract.layoutRoundingPx;
  const fit = fixture.registration.measured;
  const expectedScene = {
    x: section.x + fit.translateX * scale,
    y: section.y + fit.translateY * scale,
    width: fixture.source.width * fit.scale * scale,
    height: fixture.source.height * fit.scale * scale
  };
  if (fixture.contract.fullWidthCanvas) {
    compare('full-width section', section.width, geometry.viewport?.width, tolerance);
    compare('section horizontal origin', section.x, 0, tolerance);
  }
  for (const field of BOX_FIELDS) {
    compare(`scene absolute ${field}`, geometry.scene?.[field], expectedScene[field], tolerance);
    compare(`native map absolute ${field}`, geometry.map?.[field], expectedScene[field], tolerance);
  }
  const minHeight = fixture.contract.minimumSectionHeightPx;
  if (section.width >= fixture.contract.exactSectionHeightFromWidthPx) {
    compare('complete design section height', section.height, Math.max(minHeight, fixture.reference.height * scale), tolerance);
  } else {
    condition('narrow desktop minimum section height', section.height >= minHeight - tolerance, { actual: section.height, minimum: minHeight, tolerance });
  }
  const logos = Array.isArray(geometry.logos) ? geometry.logos : [];
  const keys = logos.map(({ key }) => key);
  condition('exactly eight unique exchange identities', keys.length === REQUIRED_LOGOS.length && new Set(keys).size === keys.length &&
    REQUIRED_LOGOS.every((key) => keys.includes(key)), { actual: keys });
  for (const target of fixture.logos) {
    const actual = logos.find(({ key }) => key === target.key);
    const expected = { x: section.x + target.box.x * scale, y: section.y + target.box.y * scale,
      width: target.box.width * scale, height: target.box.height * scale };
    for (const field of BOX_FIELDS) compare(`${target.key} section-relative ${field}`, actual?.[field], expected[field], tolerance);
  }
  const landmarks = fixture.landmarks.map((landmark) => {
    // Derive a source-image landmark's actual screen point from the measured
    // DOM image rectangle, independently of the logo layer or CSS anchors.
    const actual = { x: geometry.map?.x + landmark.sourceCenter.x / fixture.source.width * geometry.map?.width,
      y: geometry.map?.y + landmark.sourceCenter.y / fixture.source.height * geometry.map?.height };
    const expected = { x: section.x + landmark.referenceCenter.x * scale, y: section.y + landmark.referenceCenter.y * scale };
    for (const field of ['x', 'y']) compare(`${landmark.name} coastline ${field}`, actual[field], expected[field], tolerance);
    return { name: landmark.name, actual, expected };
  });
  const deltas = checks.filter((check) => Number.isFinite(check.delta)).map((check) => Math.abs(check.delta));
  return { passed: failures.length === 0, referenceScale: scale, tolerancePx: tolerance,
    maxDeviationPx: Math.max(0, ...deltas), expectedScene, landmarks, failures, checks };
}

function assertMapReferenceGeometry(geometry, fixture) {
  const assessment = assessMapReferenceGeometry(geometry, fixture);
  if (!assessment.passed) {
    const error = new Error(`Map differs from the independently measured complete client reference: ${assessment.failures.map(({ label }) => label).join(', ')}`);
    error.details = assessment;
    throw error;
  }
  return assessment;
}

function box(x, y, width, height) { return { x, y, width, height, right: x + width, bottom: y + height }; }

function syntheticReferenceGeometry(width, fixture) {
  const scale = width / fixture.reference.width;
  const fit = fixture.registration.measured;
  // Nonzero vertical origin proves the assertion is relative to the section,
  // not accidentally to the current page scroll position or viewport top.
  const section = box(0, 43, width, Math.max(fixture.contract.minimumSectionHeightPx, fixture.reference.height * scale));
  const scene = box(fit.translateX * scale, section.y + fit.translateY * scale,
    fixture.source.width * fit.scale * scale, fixture.source.height * fit.scale * scale);
  return { viewport: { width, height: section.height + 100 }, section, scene, map: { ...scene },
    logos: fixture.logos.map(({ key, box: target }) => ({ key, ...box(target.x * scale, section.y + target.y * scale, target.width * scale, target.height * scale) })) };
}

function legacySurfaceGeometry(width, fixture) {
  const geometry = syntheticReferenceGeometry(width, fixture);
  const fit = fixture.registration.measured;
  // The known rejected implementation kept correct normalized pin anchors,
  // but transformed the whole source image with left:10%, width:90%, top:55px.
  const legacy = box(width * 0.1, geometry.section.y + 55, width * 0.9, width * 0.9 * fixture.source.height / fixture.source.width);
  geometry.scene = legacy;
  geometry.map = { ...legacy };
  geometry.logos = fixture.logos.map(({ key, box: target }) => {
    const native = { x: (target.x - fit.translateX) / fit.scale, y: (target.y - fit.translateY) / fit.scale,
      width: target.width / fit.scale, height: target.height / fit.scale };
    return { key, ...box(legacy.x + native.x / fixture.source.width * legacy.width,
      legacy.y + native.y / fixture.source.height * legacy.height,
      native.width / fixture.source.width * legacy.width, native.height / fixture.source.height * legacy.height) };
  });
  return geometry;
}

function selfTest(fixture) {
  const cases = [];
  for (const width of fixture.contract.desktopWidths) {
    const correct = assessMapReferenceGeometry(syntheticReferenceGeometry(width, fixture), fixture);
    assert.ok(correct.passed, `Independent positive control failed at ${width}`);
    const legacy = assessMapReferenceGeometry(legacySurfaceGeometry(width, fixture), fixture);
    assert.ok(!legacy.passed && legacy.failures.some(({ label }) => label.startsWith('scene absolute')) &&
      legacy.failures.some(({ label }) => label.includes('section-relative')), `Legacy transform unexpectedly accepted at ${width}`);
    cases.push({ width, referenceAccepted: true, legacySurfaceRejected: true, legacyFailures: legacy.failures.length,
      legacyMaxDeviationPx: legacy.maxDeviationPx });
  }
  for (const mutation of ['shift-one-logo', 'shift-native-map-only', 'cap-complete-canvas', 'duplicate-logo']) {
    const geometry = syntheticReferenceGeometry(2048, fixture);
    if (mutation === 'shift-one-logo') geometry.logos[0].x += 8;
    if (mutation === 'shift-native-map-only') geometry.map.y += 8;
    if (mutation === 'cap-complete-canvas') geometry.viewport.width = 2560;
    if (mutation === 'duplicate-logo') geometry.logos[0].key = geometry.logos[1].key;
    assert.ok(!assessMapReferenceGeometry(geometry, fixture).passed, `Mutation unexpectedly accepted: ${mutation}`);
  }
  return { status: 'passed', mode: 'pure-contract-self-test', cases,
    additionalRejectedMutations: ['shift-one-logo', 'shift-native-map-only', 'cap-complete-canvas', 'duplicate-logo'],
    browserRun: false, productionModified: false, expectedValuesReadFromCSS: false };
}

function assessCapturedReport(report, fixture) {
  const maps = report?.cases?.filter((entry) => /^map-\d+$/.test(entry.name) && entry.evidence?.geometry) || [];
  assert.ok(maps.length, 'Report has no captured map case geometry; cannot establish a red or green control');
  return maps.map((entry) => {
    const assessment = assessMapReferenceGeometry(entry.evidence.geometry, fixture);
    return { browser: entry.browser, name: entry.name, capturedCaseStatus: entry.status,
      accepted: assessment.passed, maxDeviationPx: assessment.maxDeviationPx, failures: assessment.failures };
  });
}

function main(argv) {
  const { fixture, proof } = readMapReference();
  if (argv.length === 1 && argv[0] === '--self-test') {
    process.stdout.write(`${JSON.stringify({ ...selfTest(fixture), reference: proof }, null, 2)}\n`);
    return;
  }
  assert.ok(argv.length === 2 && ['--check-report', '--expect-rejected-report'].includes(argv[0]),
    'Usage: map-reference-contract.cjs --self-test | --check-report REPORT | --expect-rejected-report OLD_REPORT');
  const reportBytes = fs.readFileSync(path.resolve(argv[1]));
  const cases = assessCapturedReport(JSON.parse(reportBytes.toString('utf8')), fixture);
  const expectRejected = argv[0] === '--expect-rejected-report';
  const success = cases.every(({ accepted }) => expectRejected ? !accepted : accepted);
  process.stdout.write(`${JSON.stringify({ status: success ? (expectRejected ? 'rejected-as-expected' : 'accepted') : 'failed',
    mode: expectRejected ? 'red-before-green-captured-report' : 'captured-report-geometry-only',
    capturedReportSha256: crypto.createHash('sha256').update(reportBytes).digest('hex'), reference: proof,
    cases, browserRun: false, productionModified: false, sourceImageBytesChecked: false }, null, 2)}\n`);
  process.exitCode = success ? 0 : 1;
}

module.exports = { readMapReference, assessMapReferenceGeometry, assertMapReferenceGeometry, assessCapturedReport, selfTest };
if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (error) { process.stderr.write(`ACE_MAP_CONTRACT_FAILED: ${error.message}\n`); process.exitCode = 1; }
}
