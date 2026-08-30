import assert from 'node:assert/strict';
import test from 'node:test';

import { createAppServer } from '../server.js';
import { getOfficialById, lookupOfficials } from '../src/domain/officials.js';

const STREET_ADDRESS = '123 API Test Street, Brooklyn, NY 11201';
const KNOWN_OFFICIAL_ID = 'ny-pilot-rivera-001';

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

async function assertApiHeaders(response) {
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('cache-control'), 'no-store');
}

test('health returns v1 service status', async () => {
  const response = await request('/api/health');

  assert.equal(response.status, 200);
  await assertApiHeaders(response);
  assert.deepEqual(await response.json(), { status: 'ok', apiVersion: 'v1' });
});

test('address suggestion endpoint returns provider results without caching the query', async () => {
  const app = createAppServer({
    async suggestAddresses(query) {
      assert.equal(query, '350 Fifth Ave');
      return { suggestions: [{ id: 'empire-state', label: '350 5th Avenue, New York, NY 10118' }] };
    },
  });
  await new Promise((resolve, reject) => {
    app.once('error', reject);
    app.listen(0, '127.0.0.1', resolve);
  });

  try {
    const { port } = app.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/addresses/suggest?q=350%20Fifth%20Ave`);
    assert.equal(response.status, 200);
    await assertApiHeaders(response);
    assert.deepEqual(await response.json(), {
      suggestions: [{ id: 'empire-state', label: '350 5th Avenue, New York, NY 10118' }],
    });
  } finally {
    await new Promise((resolve, reject) => app.close((error) => error ? reject(error) : resolve()));
  }
});

test('Brooklyn lookup returns the domain response without the submitted street', async () => {
  const response = await request('/api/v1/officials/lookup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: STREET_ADDRESS, topics: ['ihra'], mode: 'demo' }),
  });

  assert.equal(response.status, 200);
  await assertApiHeaders(response);
  const body = await response.json();
  assert.equal(typeof body.requestId, 'string');
  assert.equal(body.coverage.status, 'illustrative_pilot');
  assert.deepEqual(body.location.city, 'Brooklyn');
  assert.equal(body.officials.length, 3);
  assert.equal(body.officials.every((official) => official.documentedRecordCount === 1), true);
  assert.equal(JSON.stringify(body).includes(STREET_ADDRESS), false);

  const domainResult = lookupOfficials({ address: STREET_ADDRESS, topics: ['ihra'] });
  assert.deepEqual({ ...body, requestId: domainResult.requestId }, domainResult);
});

test('lookup rejects Brooklyn street-name and out-of-state false positives', async () => {
  for (const address of ['1 Brooklyn Avenue, Albany, NY 12207', 'Brooklyn, Ohio']) {
    const response = await request('/api/v1/officials/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address, mode: 'demo' }),
    });

    assert.equal(response.status, 422);
    await assertApiHeaders(response);
    const body = await response.json();
    assert.equal(body.error.code, 'OUTSIDE_PILOT_COVERAGE');
    assert.deepEqual(body.error.suggestions, ['Brooklyn, NY 11201']);
    assert.equal(JSON.stringify(body).includes(address), false);
  }
});

test('known profile returns a complete cloned record', async () => {
  const response = await request(`/api/v1/officials/${KNOWN_OFFICIAL_ID}`);

  assert.equal(response.status, 200);
  await assertApiHeaders(response);
  const body = await response.json();
  assert.equal(body.id, KNOWN_OFFICIAL_ID);
  assert.ok(Array.isArray(body.responsibilities));
  assert.ok(Array.isArray(body.issueRecords));
  assert.ok(body.issueRecords.length > 0);
  assert.ok(body.issueRecords.every((record) => record.source && record.verification));
  assert.deepEqual(body, {
    ...getOfficialById(KNOWN_OFFICIAL_ID),
    dataMode: 'illustrative_demo',
    evidenceStatus: {
      status: 'illustrative_demo',
      message: 'Every identity and issue record in this profile is fictional illustrative demo data.',
    },
  });
});

test('server awaits live lookup and encoded Open States profile IDs', async () => {
  const liveId = 'ocd-person/11111111-2222-3333-4444-555555555555';
  const received = { lookup: null, profileId: null };
  const liveLookup = {
    requestId: 'live-request',
    coverage: { status: 'live_identity', message: 'Live identity.' },
    location: { city: 'Brooklyn', state: 'NY', districts: ['Assembly Member District 52'] },
    officials: [{
      id: liveId,
      name: 'Taylor Example',
      office: 'Assembly Member',
      district: 'Assembly Member District 52',
      documentedRecordCount: 0,
      dataMode: 'live_identity',
      evidenceStatus: 'not_researched',
    }],
  };
  const liveProfile = {
    id: liveId,
    name: 'Taylor Example',
    office: 'Assembly Member',
    district: 'Assembly Member District 52',
    responsibilities: ['Represents constituents.'],
    contact: { website: '', email: '', phone: '', officeAddress: '' },
    issueRecords: [],
    dataMode: 'live_identity',
    evidenceStatus: { status: 'not_researched', message: 'Not researched.' },
  };
  const app = createAppServer({
    async lookup(input) {
      received.lookup = input;
      await Promise.resolve();
      return liveLookup;
    },
    async getOfficial(id) {
      received.profileId = id;
      await Promise.resolve();
      return liveProfile;
    },
  });
  await new Promise((resolve, reject) => {
    app.once('error', reject);
    app.listen(0, '127.0.0.1', resolve);
  });

  try {
    const { port } = app.address();
    const liveBase = `http://127.0.0.1:${port}`;
    const lookupResponse = await fetch(`${liveBase}/api/v1/officials/lookup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: STREET_ADDRESS }),
    });
    assert.equal(lookupResponse.status, 200);
    assert.deepEqual(await lookupResponse.json(), liveLookup);
    assert.deepEqual(received.lookup, { address: STREET_ADDRESS });

    const profileResponse = await fetch(`${liveBase}/api/v1/officials/${encodeURIComponent(liveId)}`);
    assert.equal(profileResponse.status, 200);
    assert.deepEqual(await profileResponse.json(), liveProfile);
    assert.equal(received.profileId, liveId);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => error ? reject(error) : resolve()));
  }
});

test('OpenAPI endpoint returns an OpenAPI 3.1 document', async () => {
  const response = await request('/api/openapi.json');

  assert.equal(response.status, 200);
  await assertApiHeaders(response);
  const body = await response.json();
  assert.equal(typeof body, 'object');
  assert.match(body.openapi, /^3\.1/);
});

test('malformed JSON returns INVALID_JSON', async () => {
  const response = await request('/api/v1/officials/lookup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{',
  });

  assert.equal(response.status, 400);
  await assertApiHeaders(response);
  assert.equal((await response.json()).error.code, 'INVALID_JSON');
});

test('non-object JSON request bodies return INVALID_REQUEST_BODY', async () => {
  for (const body of ['null', '[]']) {
    const response = await request('/api/v1/officials/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
    });

    assert.equal(response.status, 400);
    await assertApiHeaders(response);
    assert.equal((await response.json()).error.code, 'INVALID_REQUEST_BODY');
  }
});

test('unsupported methods return METHOD_NOT_ALLOWED and an Allow header', async () => {
  const response = await request('/api/health', { method: 'POST' });

  assert.equal(response.status, 405);
  await assertApiHeaders(response);
  assert.equal(response.headers.get('allow'), 'GET');
  assert.equal((await response.json()).error.code, 'METHOD_NOT_ALLOWED');
});

test('unknown officials return OFFICIAL_NOT_FOUND', async () => {
  const response = await request('/api/v1/officials/not-a-real-official');

  assert.equal(response.status, 404);
  await assertApiHeaders(response);
  assert.equal((await response.json()).error.code, 'OFFICIAL_NOT_FOUND');
});

test('oversized JSON request bodies return PAYLOAD_TOO_LARGE', async () => {
  const response = await request('/api/v1/officials/lookup', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: `Brooklyn ${'x'.repeat(33 * 1024)}` }),
  });

  assert.equal(response.status, 413);
  await assertApiHeaders(response);
  assert.equal((await response.json()).error.code, 'PAYLOAD_TOO_LARGE');
});

test('unexpected lookup errors are contained without internal details', async () => {
  const internalMessage = 'private implementation detail';
  const app = createAppServer({
    lookup() {
      const error = new Error(internalMessage);
      error.status = 418;
      error.code = 'ARBITRARY_ERROR';
      throw error;
    },
  });
  await new Promise((resolve, reject) => {
    app.once('error', reject);
    app.listen(0, '127.0.0.1', resolve);
  });

  try {
    const { port } = app.address();
    const response = await fetch(`http://127.0.0.1:${port}/api/v1/officials/lookup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: STREET_ADDRESS }),
    });

    assert.equal(response.status, 500);
    await assertApiHeaders(response);
    const body = await response.json();
    assert.deepEqual(body, {
      error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' },
    });
    assert.equal(JSON.stringify(body).includes(internalMessage), false);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => error ? reject(error) : resolve()));
  }
});
