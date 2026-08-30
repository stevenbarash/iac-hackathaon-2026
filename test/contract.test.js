import assert from 'node:assert/strict';
import test from 'node:test';

import openApiDocument from '../openapi.json' with { type: 'json' };
import { createAppServer } from '../server.js';

const TOPICS = ['ihra', 'bds_policy', 'israel_legislation', 'antisemitism', 'jewish_community'];
const POSITIONS = ['supports', 'opposes', 'mixed', 'related_action', 'no_documented_position'];
const SHARED_ERROR_ENVELOPE = { $ref: '#/components/schemas/ErrorEnvelope' };

let server;
let baseUrl;

test.before(async () => {
  server = createAppServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

function schema(name) {
  return openApiDocument.components.schemas[name];
}

function dereference(value) {
  assert.deepEqual(value, SHARED_ERROR_ENVELOPE);
}

test('OpenAPI contains the required routes with only their supported methods', () => {
  const requiredOperations = {
    '/api/health': 'get',
    '/api/openapi.json': 'get',
    '/api/v1/officials/{officialId}': 'get',
    '/api/v1/officials/lookup': 'post',
  };

  for (const [path, method] of Object.entries(requiredOperations)) {
    assert.ok(Object.hasOwn(openApiDocument.paths, path), `OpenAPI contains ${path}`);
    assert.deepEqual(Object.keys(openApiDocument.paths[path]).sort(), [method]);
  }
});

test('OpenAPI topic and position enums match the runtime contract exactly', () => {
  assert.deepEqual(schema('Topic').enum, TOPICS);
  assert.deepEqual(schema('Position').enum, POSITIONS);
});

test('lookup request requires address, defaults to live, and supports explicit demo mode', () => {
  const lookupRequest = schema('LookupRequest');

  assert.deepEqual(lookupRequest.required, ['address']);
  assert.deepEqual(Object.keys(lookupRequest.properties).sort(), ['address', 'locale', 'mode', 'topics']);
  assert.deepEqual(lookupRequest.properties.mode.enum, ['live', 'demo']);
  assert.equal(lookupRequest.properties.mode.default, 'live');
  assert.deepEqual(lookupRequest.properties.topics.items, { $ref: '#/components/schemas/Topic' });
});

test('official detail documents identity mode, evidence status, attribution, and issue records', () => {
  const profileExtension = schema('OfficialProfile').allOf[1];
  const issueRecord = schema('IssueRecord');

  assert.deepEqual(profileExtension.required, ['responsibilities', 'contact', 'issueRecords', 'dataMode', 'evidenceStatus']);
  assert.equal(profileExtension.properties.contact.$ref, '#/components/schemas/Contact');
  assert.equal(profileExtension.properties.issueRecords.items.$ref, '#/components/schemas/IssueRecord');
  assert.equal(profileExtension.properties.sourceAttribution.$ref, '#/components/schemas/SourceAttribution');
  assert.deepEqual(schema('DataMode').enum, ['live_identity', 'illustrative_demo']);
  assert.deepEqual(schema('EvidenceStatus').properties.status.enum, ['not_researched', 'illustrative_demo']);
  assert.deepEqual(issueRecord.required, [
    'topic', 'position', 'finding', 'date', 'evidenceType', 'source', 'verification',
  ]);
  assert.equal(issueRecord.properties.source.$ref, '#/components/schemas/EvidenceSource');
  assert.equal(issueRecord.properties.verification.$ref, '#/components/schemas/Verification');
});

test('documented error responses use the shared error envelope', () => {
  for (const response of Object.values(openApiDocument.components.responses)) {
    dereference(response.content['application/json'].schema);
  }
});

test('error enum includes live configuration, geocoding, coverage, and upstream failures', () => {
  const codes = schema('ErrorEnvelope').properties.error.properties.code.enum;
  for (const code of [
    'CONFIGURATION_REQUIRED',
    'ADDRESS_NOT_FOUND',
    'ADDRESS_AMBIGUOUS',
    'OFFICIALS_NOT_FOUND',
    'UPSTREAM_SERVICE_UNAVAILABLE',
  ]) {
    assert.ok(codes.includes(code), `documents ${code}`);
  }
});

test('demo lookup and profile responses conform to major documented fields and enum values', async () => {
  const lookupResponse = await fetch(`${baseUrl}/api/v1/officials/lookup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ address: 'Brooklyn, NY 11201', topics: ['ihra'], locale: 'en-US', mode: 'demo' }),
  });

  assert.equal(lookupResponse.status, 200);
  const lookup = await lookupResponse.json();
  for (const field of schema('LookupResponse').required) {
    assert.ok(Object.hasOwn(lookup, field), `lookup includes ${field}`);
  }
  assert.equal(lookup.coverage.status, 'illustrative_pilot');
  assert.ok(lookup.officials.length > 0);
  assert.ok(lookup.officials.every((official) => schema('OfficialCard').required.every((field) => Object.hasOwn(official, field))));

  const profileResponse = await fetch(`${baseUrl}/api/v1/officials/${encodeURIComponent(lookup.officials[0].id)}`);
  assert.equal(profileResponse.status, 200);
  const profile = await profileResponse.json();
  for (const field of schema('OfficialProfile').allOf[0].required) {
    assert.ok(Object.hasOwn(profile, field), `profile includes ${field}`);
  }
  for (const field of schema('OfficialProfile').allOf[1].required) {
    assert.ok(Object.hasOwn(profile, field), `profile includes ${field}`);
  }
  assert.ok(profile.issueRecords.length > 0);
  assert.ok(Array.isArray(profile.responsibilities));
  assert.ok(profile.responsibilities.every((responsibility) => typeof responsibility === 'string'));
  for (const field of schema('Contact').required) {
    assert.ok(Object.hasOwn(profile.contact, field), `contact includes ${field}`);
    assert.equal(typeof profile.contact[field], 'string');
  }
  for (const issue of profile.issueRecords) {
    assert.ok(TOPICS.includes(issue.topic), `topic is documented: ${issue.topic}`);
    assert.ok(POSITIONS.includes(issue.position), `position is documented: ${issue.position}`);
    for (const field of schema('EvidenceSource').required) {
      assert.ok(Object.hasOwn(issue.source, field), `source includes ${field}`);
      assert.equal(typeof issue.source[field], 'string');
    }
    for (const field of schema('Verification').required) {
      assert.ok(Object.hasOwn(issue.verification, field), `verification includes ${field}`);
      assert.equal(typeof issue.verification[field], 'string');
    }
    assert.equal(issue.verification.status, schema('Verification').properties.status.const);
  }
});
