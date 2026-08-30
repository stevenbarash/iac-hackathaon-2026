import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { request as httpRequest } from 'node:http';
import test from 'node:test';

import { createAppServer } from '../server.js';

let server;
let baseUrl;

test.before(async () => {
  server = createAppServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function request(path, options) {
  return fetch(`${baseUrl}${path}`, options);
}

async function requestRawPath(path) {
  const url = new URL(baseUrl);
  return new Promise((resolve, reject) => {
    const outgoing = httpRequest({
      hostname: url.hostname,
      port: url.port,
      method: 'GET',
      path,
    }, resolve);
    outgoing.once('error', reject);
    outgoing.end();
  });
}

test('the landing page is an accessible address form', async () => {
  const response = await request('/');
  const body = await response.text();

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/html; charset=utf-8$/);
  assert.match(body, /Know Your Officials/);
  assert.match(body, /<form\b[^>]*>/i);
  assert.match(body, /<label[^>]*for="address"[^>]*>[^<]*full address/i);
  assert.match(body, /<input[^>]*id="address"[^>]*>/i);
  assert.match(body, /U\.S\. Census Geocoder/i);
  assert.match(body, /coordinates[^<]*Open States/i);
  assert.doesNotMatch(body, /address stays in this browser/i);
});

test('allow-listed styles are served as CSS', async () => {
  const response = await request('/styles.css');

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^text\/css; charset=utf-8$/);
});

test('allow-listed client code is served as JavaScript', async () => {
  const response = await request('/app.js');

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^(text\/javascript|application\/javascript); charset=utf-8$/);
});

test('non-allow-listed assets return 404', async () => {
  const response = await request('/not-an-asset.txt');

  assert.equal(response.status, 404);
});

test('raw dot-segment aliases cannot resolve to an allow-listed static asset', async () => {
  for (const path of ['/x/../app.js', '/x/%2e%2e/app.js']) {
    const response = await requestRawPath(path);

    assert.equal(response.statusCode, 404);
    response.resume();
  }
});

test('API routes retain precedence after static routing', async () => {
  const response = await request('/api/health');

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok', apiVersion: 'v1' });
});

test('client keeps profile enrichment recoverable', async () => {
  const client = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  const enrichmentIndex = client.indexOf('Promise.allSettled');

  assert.ok(enrichmentIndex >= 0, 'profile enrichment must not fail the lookup as a whole');
});
