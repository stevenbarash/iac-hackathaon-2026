import assert from 'node:assert/strict';
import test from 'node:test';

import { createOfficialEvidenceService } from '../src/services/official-evidence.js';

const NY_JURISDICTION = 'ocd-jurisdiction/country:us/state:ny/government';
const FEDERAL_JURISDICTION = 'ocd-jurisdiction/country:us/government';
const OFFICIAL_ID = 'ocd-person/official-1';
const RECORD = Object.freeze({
  topic: 'ihra',
  position: 'related_action',
  actionType: 'roll_call_vote',
  finding: 'Voted Yea on passage.',
  date: '2024-05-01',
  measure: { jurisdiction: 'United States', session: '118', identifier: 'H R 6090', title: 'Fixture' },
  action: { option: 'Yea', motion: 'On Passage', result: 'Passed' },
  sources: [{ publisher: 'Official source', url: 'https://example.gov/record' }],
  verification: { status: 'live_official_source', matchMethod: 'bioguide_id', retrievedAt: '2026-08-30T12:00:00.000Z' },
});

function sourceResult({ records = [], successful = 1, failed = 0 } = {}) {
  return {
    records,
    reviewedMeasureCount: successful + failed,
    successfulMeasureCount: successful,
    failedMeasureCount: failed,
  };
}

test('routes a New York state role only to Open States', async () => {
  const calls = [];
  const service = createOfficialEvidenceService({
    openStatesEvidence: {
      async getEvidenceForOfficial(input) {
        calls.push({ source: 'openstates', input });
        return sourceResult({ records: [RECORD] });
      },
    },
    houseClerkEvidence: {
      async getEvidenceForOfficial(input) {
        calls.push({ source: 'house', input });
        return sourceResult();
      },
    },
  });

  const result = await service.getEvidenceForOfficial({
    id: OFFICIAL_ID,
    jurisdictionId: NY_JURISDICTION,
    roleClassification: 'upper',
    otherIdentifiers: { bioguide: 'G000599' },
  });

  assert.deepEqual(calls, [{ source: 'openstates', input: { id: OFFICIAL_ID } }]);
  assert.deepEqual(result.issueRecords, [RECORD]);
  assert.equal(result.evidenceStatus.status, 'researched');
});

test('forwards request context to New York Open States evidence', async () => {
  let received;
  const service = createOfficialEvidenceService({
    openStatesEvidence: {
      async getEvidenceForOfficial(input, context) {
        received = { input, context };
        return sourceResult();
      },
    },
    houseClerkEvidence: { async getEvidenceForOfficial() { return sourceResult(); } },
  });
  const context = { openStatesApiKey: 'session-user-key' };

  await service.getEvidenceForOfficial({
    id: OFFICIAL_ID,
    jurisdictionId: NY_JURISDICTION,
    roleClassification: 'upper',
  }, context);

  assert.deepEqual(received, { input: { id: OFFICIAL_ID }, context });
});

test('routes a federal lower role with a Bioguide ID only to the House Clerk', async () => {
  const calls = [];
  const service = createOfficialEvidenceService({
    openStatesEvidence: {
      async getEvidenceForOfficial(input) {
        calls.push({ source: 'openstates', input });
        return sourceResult();
      },
    },
    houseClerkEvidence: {
      async getEvidenceForOfficial(input) {
        calls.push({ source: 'house', input });
        return sourceResult({ records: [RECORD] });
      },
    },
  });

  const result = await service.getEvidenceForOfficial({
    id: OFFICIAL_ID,
    jurisdictionId: FEDERAL_JURISDICTION,
    roleClassification: 'lower',
    otherIdentifiers: { bioguide: 'G000599' },
  });

  assert.deepEqual(calls, [{ source: 'house', input: { bioguideId: 'G000599' } }]);
  assert.deepEqual(result.issueRecords, [RECORD]);
});

test('reports House catalog coverage as unavailable when a federal lower profile lacks a usable Bioguide ID', async () => {
  let houseCalls = 0;
  const service = createOfficialEvidenceService({
    openStatesEvidence: { async getEvidenceForOfficial() { throw new Error('must not be called'); } },
    houseClerkEvidence: {
      async getEvidenceForOfficial() {
        houseCalls += 1;
        throw new Error('must not be called without an exact Bioguide ID');
      },
    },
  });

  for (const otherIdentifiers of [{}, { bioguide: '   ' }]) {
    const result = await service.getEvidenceForOfficial({
      id: OFFICIAL_ID,
      jurisdictionId: FEDERAL_JURISDICTION,
      roleClassification: 'lower',
      otherIdentifiers,
    });

    assert.deepEqual(result.issueRecords, []);
    assert.deepEqual({
      status: result.evidenceStatus.status,
      catalogVersion: result.evidenceStatus.catalogVersion,
      reviewedMeasureCount: result.evidenceStatus.reviewedMeasureCount,
      successfulMeasureCount: result.evidenceStatus.successfulMeasureCount,
      failedMeasureCount: result.evidenceStatus.failedMeasureCount,
    }, {
      status: 'temporarily_unavailable',
      catalogVersion: 'ny-federal-pilot-v1',
      reviewedMeasureCount: 1,
      successfulMeasureCount: 0,
      failedMeasureCount: 1,
    });
    assert.match(result.evidenceStatus.message, /exact Bioguide identity/i);
  }
  assert.equal(houseCalls, 0);
});

test('reports partial coverage when an applicable adapter has failed manifest measures', async () => {
  const service = createOfficialEvidenceService({
    openStatesEvidence: {
      async getEvidenceForOfficial() {
        return sourceResult({ records: [RECORD], successful: 1, failed: 1 });
      },
    },
    houseClerkEvidence: { async getEvidenceForOfficial() { return sourceResult(); } },
  });

  const result = await service.getEvidenceForOfficial({
    id: OFFICIAL_ID,
    jurisdictionId: NY_JURISDICTION,
    roleClassification: 'lower',
    otherIdentifiers: {},
  });

  assert.deepEqual(result.issueRecords, [RECORD]);
  assert.deepEqual({
    status: result.evidenceStatus.status,
    catalogVersion: result.evidenceStatus.catalogVersion,
    reviewedMeasureCount: result.evidenceStatus.reviewedMeasureCount,
    successfulMeasureCount: result.evidenceStatus.successfulMeasureCount,
    failedMeasureCount: result.evidenceStatus.failedMeasureCount,
  }, {
    status: 'partially_available',
    catalogVersion: 'ny-federal-pilot-v1',
    reviewedMeasureCount: 2,
    successfulMeasureCount: 1,
    failedMeasureCount: 1,
  });
});

test('reports researched coverage when every applicable measure succeeds with zero matching actions', async () => {
  const service = createOfficialEvidenceService({
    openStatesEvidence: { async getEvidenceForOfficial() { return sourceResult({ successful: 2 }); } },
    houseClerkEvidence: { async getEvidenceForOfficial() { return sourceResult(); } },
  });

  const result = await service.getEvidenceForOfficial({
    id: OFFICIAL_ID,
    jurisdictionId: NY_JURISDICTION,
    roleClassification: 'upper',
    otherIdentifiers: {},
  });

  assert.deepEqual(result.issueRecords, []);
  assert.equal(result.evidenceStatus.status, 'researched');
  assert.equal(result.evidenceStatus.successfulMeasureCount, 2);
  assert.match(result.evidenceStatus.message, /does not imply opposition or neutrality/i);
});

test('reports temporary unavailability on total applicable failure and does not cache it', async () => {
  let calls = 0;
  const service = createOfficialEvidenceService({
    openStatesEvidence: {
      async getEvidenceForOfficial() {
        calls += 1;
        return sourceResult({ successful: 0, failed: 2 });
      },
    },
    houseClerkEvidence: { async getEvidenceForOfficial() { return sourceResult(); } },
  });
  const input = {
    id: OFFICIAL_ID,
    jurisdictionId: NY_JURISDICTION,
    roleClassification: 'upper',
    otherIdentifiers: {},
  };

  const first = await service.getEvidenceForOfficial(input);
  const second = await service.getEvidenceForOfficial(input);

  assert.equal(first.evidenceStatus.status, 'temporarily_unavailable');
  assert.deepEqual(first.issueRecords, []);
  assert.equal(second.evidenceStatus.status, 'temporarily_unavailable');
  assert.equal(calls, 2);
});

test('treats non-array adapter records as unavailable and never caches the malformed result', async () => {
  let calls = 0;
  const service = createOfficialEvidenceService({
    openStatesEvidence: {
      async getEvidenceForOfficial() {
        calls += 1;
        return {
          records: { topic: 'ihra', finding: 'Malformed collection.' },
          reviewedMeasureCount: 1,
          successfulMeasureCount: 1,
          failedMeasureCount: 0,
        };
      },
    },
    houseClerkEvidence: { async getEvidenceForOfficial() { return sourceResult(); } },
  });
  const input = {
    id: OFFICIAL_ID,
    jurisdictionId: NY_JURISDICTION,
    roleClassification: 'lower',
    otherIdentifiers: {},
  };

  const first = await service.getEvidenceForOfficial(input);
  const second = await service.getEvidenceForOfficial(input);

  assert.deepEqual(first.issueRecords, []);
  assert.equal(first.evidenceStatus.status, 'temporarily_unavailable');
  assert.equal(second.evidenceStatus.status, 'temporarily_unavailable');
  assert.equal(calls, 2);
});

test('retains not_researched when no evidence source applies', async () => {
  const service = createOfficialEvidenceService({
    openStatesEvidence: { async getEvidenceForOfficial() { throw new Error('must not be called'); } },
    houseClerkEvidence: { async getEvidenceForOfficial() { throw new Error('must not be called'); } },
  });

  const result = await service.getEvidenceForOfficial({
    id: OFFICIAL_ID,
    jurisdictionId: FEDERAL_JURISDICTION,
    roleClassification: 'upper',
    otherIdentifiers: { lis: 'S000001' },
  });

  assert.deepEqual(result.issueRecords, []);
  assert.equal(result.evidenceStatus.status, 'not_researched');
});

test('sorts a copied record collection by date descending with deterministic ties', async () => {
  const adapterRecords = Object.freeze([
    Object.freeze({ ...RECORD, topic: 'jewish_community', finding: 'Undated record.', date: undefined }),
    Object.freeze({ ...RECORD, topic: 'ihra', finding: 'Older record.', date: '2024-05-01' }),
    Object.freeze({ ...RECORD, topic: 'jewish_community', finding: 'Same-day topic B.', date: '2025-02-14' }),
    Object.freeze({ ...RECORD, topic: 'antisemitism', finding: 'Same-day topic A.', date: '2025-02-14' }),
  ]);
  const originalOrder = adapterRecords.map((record) => record.finding);
  const service = createOfficialEvidenceService({
    openStatesEvidence: {
      async getEvidenceForOfficial() {
        return sourceResult({ records: adapterRecords });
      },
    },
    houseClerkEvidence: { async getEvidenceForOfficial() { return sourceResult(); } },
  });

  const result = await service.getEvidenceForOfficial({
    id: OFFICIAL_ID,
    jurisdictionId: NY_JURISDICTION,
    roleClassification: 'upper',
    otherIdentifiers: {},
  });

  assert.deepEqual(result.issueRecords.map((record) => record.finding), [
    'Same-day topic A.',
    'Same-day topic B.',
    'Older record.',
    'Undated record.',
  ]);
  assert.deepEqual(adapterRecords.map((record) => record.finding), originalOrder);
  assert.notEqual(result.issueRecords, adapterRecords);
});

test('uses the full record as a deterministic final tie-break', async () => {
  const sharedSource = { publisher: 'Official source', url: 'https://example.gov/record' };
  const sourceA = { publisher: 'Supporting source', url: 'https://example.gov/a' };
  const sourceB = { publisher: 'Supporting source', url: 'https://example.gov/b' };
  const adapterRecords = Object.freeze([
    Object.freeze({ ...RECORD, sources: Object.freeze([sharedSource, sourceB]) }),
    Object.freeze({ ...RECORD, sources: Object.freeze([sharedSource, sourceA]) }),
  ]);
  const service = createOfficialEvidenceService({
    openStatesEvidence: {
      async getEvidenceForOfficial() {
        return sourceResult({ records: adapterRecords });
      },
    },
    houseClerkEvidence: { async getEvidenceForOfficial() { return sourceResult(); } },
  });

  const result = await service.getEvidenceForOfficial({
    id: OFFICIAL_ID,
    jurisdictionId: NY_JURISDICTION,
    roleClassification: 'upper',
    otherIdentifiers: {},
  });

  assert.deepEqual(result.issueRecords.map((record) => record.sources[1].url), [
    'https://example.gov/a',
    'https://example.gov/b',
  ]);
  assert.equal(adapterRecords[0].sources[1].url, 'https://example.gov/b');
});

test('caches only complete success within the bounded ten-minute TTL', async () => {
  let currentTime = 1_000;
  let calls = 0;
  const service = createOfficialEvidenceService({
    openStatesEvidence: {
      async getEvidenceForOfficial() {
        calls += 1;
        return sourceResult({ records: [{ ...RECORD, finding: `fetch ${calls}` }] });
      },
    },
    houseClerkEvidence: { async getEvidenceForOfficial() { return sourceResult(); } },
    cacheTtlMs: 900_000,
    now: () => currentTime,
  });
  const input = {
    id: OFFICIAL_ID,
    jurisdictionId: NY_JURISDICTION,
    roleClassification: 'lower',
    otherIdentifiers: {},
  };

  const first = await service.getEvidenceForOfficial(input);
  currentTime += 599_999;
  const cached = await service.getEvidenceForOfficial(input);
  currentTime += 1;
  const refreshed = await service.getEvidenceForOfficial(input);

  assert.equal(first.issueRecords[0].finding, 'fetch 1');
  assert.equal(cached.issueRecords[0].finding, 'fetch 1');
  assert.equal(refreshed.issueRecords[0].finding, 'fetch 2');
  assert.equal(calls, 2);
});
