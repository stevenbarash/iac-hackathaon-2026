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

function assertRequiredProperties(value, required, label) {
  for (const field of required) {
    assert.ok(Object.hasOwn(value, field), `${label} includes required ${field}`);
  }
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

test('lookup operation documents every runtime response status including not found', () => {
  const responses = openApiDocument.paths['/api/v1/officials/lookup'].post.responses;

  assert.deepEqual(Object.keys(responses).sort(), ['200', '400', '404', '405', '413', '422', '500', '503']);
  assert.deepEqual(responses['404'], { $ref: '#/components/responses/NotFound' });
});

test('contact contract accepts either an empty or formatted website and email', () => {
  const contact = schema('Contact');

  assert.deepEqual(contact.properties.website, {
    anyOf: [{ const: '' }, { type: 'string', format: 'uri' }],
  });
  assert.deepEqual(contact.properties.email, {
    anyOf: [{ const: '' }, { type: 'string', format: 'email' }],
  });
});

test('official detail documents identity mode, evidence status, attribution, and issue records', () => {
  const profileExtension = schema('OfficialProfile').allOf[1];
  const issueRecord = schema('IssueRecord');

  assert.deepEqual(profileExtension.required, ['responsibilities', 'contact', 'issueRecords', 'dataMode', 'evidenceStatus']);
  assert.equal(profileExtension.properties.contact.$ref, '#/components/schemas/Contact');
  assert.equal(profileExtension.properties.issueRecords.items.$ref, '#/components/schemas/IssueRecord');
  assert.equal(profileExtension.properties.sourceAttribution.$ref, '#/components/schemas/SourceAttribution');
  assert.deepEqual(schema('OfficialProfile').allOf[0].properties.party, { type: 'string' });
  assert.deepEqual(schema('OfficialProfile').allOf[0].properties.imageUrl, { type: 'string' });
  assert.equal(schema('OfficialProfile').allOf[0].properties.name.description, 'Current or illustrative official name.');
  assert.deepEqual(schema('DataMode').enum, ['live_identity', 'illustrative_demo']);
  assert.deepEqual(schema('EvidenceStatus').properties.status.enum, [
    'not_researched', 'researched', 'partially_available', 'temporarily_unavailable', 'illustrative_demo',
  ]);
  assert.deepEqual(issueRecord.required, ['topic', 'finding', 'verification']);
  assert.equal(issueRecord.properties.source.$ref, '#/components/schemas/EvidenceSource');
  assert.deepEqual(issueRecord.properties.actionType, { $ref: '#/components/schemas/ActionType' });
  assert.deepEqual(issueRecord.properties.measure, { $ref: '#/components/schemas/Measure' });
  assert.deepEqual(issueRecord.properties.action, { $ref: '#/components/schemas/LegislativeAction' });
  assert.deepEqual(issueRecord.properties.sources.items, { $ref: '#/components/schemas/EvidenceSource' });
  assert.deepEqual(issueRecord.properties.verification.oneOf, [
    { $ref: '#/components/schemas/Verification' },
    { $ref: '#/components/schemas/LiveVerification' },
  ]);
});

test('OpenAPI documents normalized literal live-action records', () => {
  const liveBranch = schema('IssueRecord').oneOf[1];

  assert.deepEqual(schema('ActionType').enum, ['sponsorship', 'cosponsorship', 'roll_call_vote']);
  assert.deepEqual(schema('Measure').required, ['jurisdiction', 'session', 'identifier', 'title']);
  assert.deepEqual(schema('LegislativeAction').properties, {
    classification: { type: 'string' },
    option: { type: 'string' },
    motion: { type: 'string' },
    result: { type: 'string' },
  });
  assert.deepEqual(schema('LiveVerification').required, ['status', 'matchMethod', 'retrievedAt']);
  assert.equal(schema('LiveVerification').properties.status.const, 'live_official_source');
  assert.deepEqual(liveBranch.required, ['position', 'actionType', 'measure', 'action', 'sources']);
  assert.equal(liveBranch.properties.sources.minItems, 1);
  assert.equal(liveBranch.properties.sources.items.$ref, '#/components/schemas/LiveEvidenceSource');
  assert.deepEqual(schema('LiveEvidenceSource').required, ['publisher', 'url']);
  assert.deepEqual(schema('IssueRecord').properties.date, { type: 'string', format: 'date' });
  for (const counter of ['reviewedMeasureCount', 'successfulMeasureCount', 'failedMeasureCount']) {
    assert.deepEqual(schema('EvidenceStatus').properties[counter], { type: 'integer', minimum: 0 });
  }
});

test('representative live HTTP response satisfies documented required shapes with optional action dates', async () => {
  const liveId = 'ocd-person/contract-live-001';
  const liveProfile = {
    id: liveId,
    name: 'Jordan Contract',
    office: 'Assembly Member',
    district: 'Assembly District 1',
    responsibilities: ['Represents constituents.'],
    contact: { website: '', email: '', phone: '', officeAddress: '' },
    issueRecords: [{
      topic: 'antisemitism',
      position: 'related_action',
      actionType: 'cosponsorship',
      finding: 'Cosponsor of J 2143: Fixture resolution.',
      measure: {
        jurisdiction: 'New York',
        session: '2025-2026',
        identifier: 'J 2143',
        title: 'Fixture resolution',
      },
      action: { classification: 'cosponsor' },
      sources: [{ publisher: 'New York Legislature', url: 'https://legislation.example/bill' }],
      verification: {
        status: 'live_official_source',
        matchMethod: 'ocd_person_id',
        retrievedAt: '2026-08-30T12:00:00.000Z',
      },
    }, {
      topic: 'ihra',
      position: 'related_action',
      actionType: 'roll_call_vote',
      finding: 'Voted Yea on On Passage.',
      date: '2024-05-01',
      measure: {
        jurisdiction: 'United States',
        session: '118',
        identifier: 'H R 6090',
        title: 'Fixture act',
      },
      action: { option: 'Yea', motion: 'On Passage', result: 'Passed' },
      sources: [{ publisher: 'Office of the Clerk, U.S. House of Representatives', url: 'https://clerk.house.gov/Votes/2024172' }],
      verification: {
        status: 'live_official_source',
        matchMethod: 'bioguide_id',
        retrievedAt: '2026-08-30T12:00:00.000Z',
      },
    }],
    dataMode: 'live_identity',
    evidenceStatus: {
      status: 'researched',
      catalogVersion: 'ny-federal-pilot-v1',
      reviewedMeasureCount: 1,
      successfulMeasureCount: 1,
      failedMeasureCount: 0,
      message: 'Every applicable catalog measure was researched.',
    },
  };
  const app = createAppServer({ async getOfficial() { return liveProfile; } });
  await new Promise((resolve, reject) => {
    app.once('error', reject);
    app.listen(0, '127.0.0.1', resolve);
  });

  try {
    const response = await fetch(`http://127.0.0.1:${app.address().port}/api/v1/officials/${encodeURIComponent(liveId)}`);
    assert.equal(response.status, 200);
    const profile = await response.json();
    for (const profileSchema of schema('OfficialProfile').allOf) {
      assertRequiredProperties(profile, profileSchema.required || [], 'live profile');
    }
    assertRequiredProperties(profile.evidenceStatus, schema('EvidenceStatus').required, 'evidence status');
    for (const [index, record] of profile.issueRecords.entries()) {
      assertRequiredProperties(record, schema('IssueRecord').required, `live issue record ${index}`);
      assertRequiredProperties(record, schema('IssueRecord').oneOf[1].required, `live issue record ${index}`);
      assertRequiredProperties(record.measure, schema('Measure').required, `live measure ${index}`);
      assertRequiredProperties(record.verification, schema('LiveVerification').required, `live verification ${index}`);
      assert.ok(record.sources.length >= schema('IssueRecord').oneOf[1].properties.sources.minItems);
      for (const source of record.sources) {
        assertRequiredProperties(source, schema('LiveEvidenceSource').required, `live source ${index}`);
        assert.match(source.url, /^https?:\/\//);
      }
    }
    assert.equal(Object.hasOwn(profile.issueRecords[0], 'date'), false);
    assert.match(profile.issueRecords[1].date, /^\d{4}-\d{2}-\d{2}$/);
  } finally {
    await new Promise((resolve, reject) => app.close((error) => error ? reject(error) : resolve()));
  }
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
