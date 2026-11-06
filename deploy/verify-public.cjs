'use strict';

// Read-only publication check. Never follows redirects or submits forms.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const ORIGIN = 'https://ace.imon.world';
const output = path.join(ROOT, 'artifacts/deploy/public-check.json');
const report = { origin: ORIGIN, startedAt: new Date().toISOString(), status: 'running', checks: [] };
const httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 1 });
const httpAgent = new http.Agent({ keepAlive: true, maxSockets: 1 });
const deadline = setTimeout(() => { console.error('Publication check exceeded 45 seconds'); process.exit(1); }, 45000);

function get(url) {
  assert.equal(url.hostname, 'ace.imon.world');
  return new Promise((resolve, reject) => {
    const secure = url.protocol === 'https:';
    const request = (secure ? https : http).get(url, {
      agent: secure ? httpsAgent : httpAgent,
      headers: { 'Accept-Encoding': 'identity', 'User-Agent': 'ACE-publication-verification' },
      timeout: 8000,
    }, response => {
      const chunks = [];
      let size = 0;
      response.on('data', data => {
        size += data.length;
        if (size > 16 * 1024 * 1024) request.destroy(new Error('Unexpected response size'));
        else chunks.push(data);
      });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
      response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('Request timeout')));
    request.on('error', reject);
  });
}

(async () => {
  try {
    const proof = JSON.parse(fs.readFileSync(path.join(ROOT, 'artifacts/code-proof-final.json'), 'utf8'));
    const runtime = proof.files.filter(entry => /^(?:assets\/|bids-offers\/|index\.html$|news-preview\.html$)/.test(entry.path));
    assert.equal(runtime.length, 24);
    runtime.push(
      { path: '/', sha256: proof.files.find(entry => entry.path === 'index.html').sha256 },
      { path: 'news-preview.html?article=spief-2025', sha256: proof.files.find(entry => entry.path === 'news-preview.html').sha256 },
      { path: 'assets/images/news/article/spief-2025-documents.jpg', sha256: '163f24c878e5277f70d199bed96fead3ca66c984ca4156def6f97880b37ea8d1' },
      { path: 'assets/images/news/article/spief-2025-signing.jpg', sha256: 'c603b30abc2e39f4d0aa63610070cb20ef180ec993b49851b9e9dcc2d3271818' },
    );
    for (const entry of runtime) {
      const response = await get(new URL(entry.path, ORIGIN + '/'));
      assert.equal(response.status, 200, entry.path);
      assert.equal(crypto.createHash('sha256').update(response.body).digest('hex'), entry.sha256, entry.path);
      assert.equal(response.headers['x-robots-tag'], 'noindex, nofollow, noarchive');
      assert.equal(response.headers['x-content-type-options'], 'nosniff');
      report.checks.push({ path: entry.path, status: response.status, bytes: response.body.length, sha256: entry.sha256 });
    }
    for (const target of ['/.git/HEAD', '/CHECKPOINT.md', '/README.md', '/docs/news-source.json', '/scripts/verify-handoff.cjs', '/deploy/nginx-https.conf', '/ace-missing-file']) {
      const response = await get(new URL(target, ORIGIN));
      assert.equal(response.status, 404, target);
      report.checks.push({ path: target, status: response.status });
    }
    const redirect = await get(new URL('http://ace.imon.world/news-preview.html?article=spief-2025'));
    assert.equal(redirect.status, 308);
    assert.equal(redirect.headers.location, ORIGIN + '/news-preview.html?article=spief-2025');
    report.checks.push({ path: 'http redirect', status: 308, location: redirect.headers.location });
    report.status = 'passed';
  } catch (error) {
    report.status = 'failed';
    report.error = error.stack || String(error);
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
    httpsAgent.destroy();
    httpAgent.destroy();
    report.finishedAt = new Date().toISOString();
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, checks: report.checks.length, output, error: report.error || null }));
  }
})();
