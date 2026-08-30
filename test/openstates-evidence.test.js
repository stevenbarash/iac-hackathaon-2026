import assert from 'node:assert/strict';
import test from 'node:test';

import { createOpenStatesEvidenceService } from '../src/services/openstates-evidence.js';

const OFFICIAL_ID = 'ocd-person/official-1';
const FIXED_RETRIEVED_AT = '2026-08-30T12:00:00.000Z';

const MEASURES = Object.freeze([
  Object.freeze({
    key: 'ny-live',
    provider: 'openstates',
    jurisdiction: 'New York',
    session: '2025-2026',
    lookupId: 'J2143',
    topics: Object.freeze(['jewish_community']),
    inclusionRationale: 'Fixture coverage declaration.',
  }),
  Object.freeze({
    key: 'ny-failed',
    provider: 'openstates',
    jurisdiction: 'New York',
    session: '2025-2026',
    lookupId: 'S7034',
    topics: Object.freeze(['ihra']),
    inclusionRationale: 'Fixture coverage declaration.',
  }),
]);

const ONE_MEASURE = Object.freeze([MEASURES[0]]);

const LIVE_BILL = Object.freeze({
  id: 'ocd-bill/4f19afc8-c6e1-4f7e-9df6-a88bd5616757',
  identifier: 'J 2143',
  title: 'Live upstream title',
  session: '2025-2026',
  jurisdiction: {
    id: 'ocd-jurisdiction/country:us/state:ny/government',
    name: 'New York',
    classification: 'state',
  },
  from_organization: {
    id: 'ocd-organization/0d1dd38d-a517-49eb-b546-d89925e8f901',
    name: 'New York Senate',
    classification: 'upper',
  },
  classification: ['resolution'],
  subject: ['Jewish community'],
  abstract: 'A complete upstream-shaped fixture.',
  created_at: '2026-01-12T16:00:00+00:00',
  updated_at: '2026-04-20T18:30:00+00:00',
  latest_action_date: '2026-04-18',
  latest_action_description: 'Referred to Rules',
  actions: [{
    description: 'Referred to Rules',
    date: '2026-04-18',
    organization: {
      id: 'ocd-organization/0d1dd38d-a517-49eb-b546-d89925e8f901',
      name: 'New York Senate',
      classification: 'upper',
    },
    classification: ['referral'],
    order: 1,
    related_entities: [],
  }],
  sponsorships: [{
    name: 'Unrelated Sponsor',
    classification: 'primary',
    primary: true,
    person: { id: 'ocd-person/official-2', name: 'Unrelated Sponsor' },
    organization: {
      id: 'ocd-organization/0d1dd38d-a517-49eb-b546-d89925e8f901',
      name: 'New York Senate',
      classification: 'upper',
    },
  }, {
    name: 'Fixture Official',
    classification: 'cosponsor',
    primary: false,
    person: { id: OFFICIAL_ID, name: 'Fixture Official' },
    organization: {
      id: 'ocd-organization/0d1dd38d-a517-49eb-b546-d89925e8f901',
      name: 'New York Senate',
      classification: 'upper',
    },
  }],
  votes: [{
    id: 'ocd-vote/4fe77b87-50f8-429d-a73d-df9f04b6a134',
    identifier: 'Vote 41',
    start_date: '2026-04-20T14:00:00+00:00',
    motion_text: 'On adoption of the resolution',
    motion_classification: ['passage'],
    result: 'Adopted',
    classification: 'passage',
    organization: {
      id: 'ocd-organization/0d1dd38d-a517-49eb-b546-d89925e8f901',
      name: 'New York Senate',
      classification: 'upper',
    },
    counts: [{ option: 'yes', value: 42 }, { option: 'no', value: 20 }],
    votes: [{
      option: 'yes',
      voter: { id: OFFICIAL_ID, name: 'Fixture Official' },
    }, {
      option: 'no',
      voter: { id: 'ocd-person/official-2', name: 'Unrelated Sponsor' },
    }],
  }],
  sources: [{
    url: 'https://legislation.example/bill',
    note: 'New York Legislature',
  }],
  openstates_url: 'https://openstates.org/ny/bills/2025-2026/J2143/',
});

function liveBillFor(identifier, overrides = {}) {
  return {
    ...structuredClone(LIVE_BILL),
    identifier,
    ...overrides,
  };
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createFetch(responses) {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    const parsed = new URL(url);
    const lookupId = decodeURIComponent(parsed.pathname).split('/').at(-1);
    requests.push({ url: parsed, options, lookupId });
    const response = responses[lookupId];
    if (response instanceof Error) throw response;
    if (Array.isArray(response)) return response.shift();
    return response;
  };
  return { fetchImpl, requests };
}

test('normalizes an exact OCD cosponsorship from live bill fields', async () => {
  const { fetchImpl, requests } = createFetch({
    J2143: jsonResponse(LIVE_BILL),
    S7034: jsonResponse({}, 404),
  });
  const service = createOpenStatesEvidenceService({
    fetchImpl,
    apiKey: 'test-key',
    measures: MEASURES,
    now: () => FIXED_RETRIEVED_AT,
  });

  const result = await service.getEvidenceForOfficial({ id: OFFICIAL_ID });
  const cosponsorship = result.records.find((record) => record.actionType === 'cosponsorship');

  assert.equal(cosponsorship.position, 'related_action');
  assert.equal(cosponsorship.finding, 'Cosponsor of J 2143: Live upstream title.');
  assert.equal(Object.hasOwn(cosponsorship, 'date'), false);
  assert.deepEqual(cosponsorship.measure, {
    jurisdiction: 'New York',
    session: '2025-2026',
    identifier: 'J 2143',
    title: 'Live upstream title',
  });
  assert.deepEqual(cosponsorship.sources, [{
    publisher: 'New York Legislature',
    url: 'https://legislation.example/bill',
  }]);
  assert.deepEqual(cosponsorship.verification, {
    status: 'live_official_source',
    matchMethod: 'ocd_person_id',
    retrievedAt: FIXED_RETRIEVED_AT,
  });

  assert.equal(requests.length, 2);
  for (const request of requests) {
    assert.equal(request.url.origin, 'https://v3.openstates.org');
    assert.equal(request.url.pathname, `/bills/New%20York/2025-2026/${request.lookupId}`);
    assert.deepEqual(request.url.searchParams.getAll('include'), ['sponsorships', 'votes', 'actions', 'sources']);
    assert.equal(request.options.headers['X-API-KEY'], 'test-key');
    assert.ok(request.options.signal, 'a bounded request signal is supplied');
  }
});

test('evidence requests prefer a request key over the configured default', async () => {
  const { fetchImpl, requests } = createFetch({ J2143: jsonResponse(LIVE_BILL) });
  const service = createOpenStatesEvidenceService({
    fetchImpl,
    apiKey: 'configured-default-key',
    measures: ONE_MEASURE,
    now: () => FIXED_RETRIEVED_AT,
  });

  await service.getEvidenceForOfficial(
    { id: OFFICIAL_ID },
    { openStatesApiKey: 'session-user-key' },
  );

  assert.equal(requests[0].options.headers['X-API-KEY'], 'session-user-key');
});

test('does not treat a raw sponsor name as an identity match', async () => {
  const rawNameOnlyBill = structuredClone(LIVE_BILL);
  rawNameOnlyBill.sponsorships = [{
    ...LIVE_BILL.sponsorships[1],
    person: undefined,
    name: 'Fixture Official',
  }];
  rawNameOnlyBill.votes = [];
  const { fetchImpl } = createFetch({
    J2143: jsonResponse(rawNameOnlyBill),
    S7034: jsonResponse(liveBillFor('S 7034', {
      sponsorships: rawNameOnlyBill.sponsorships,
      votes: [],
    })),
  });
  const service = createOpenStatesEvidenceService({
    fetchImpl,
    apiKey: 'test-key',
    measures: MEASURES,
    now: () => FIXED_RETRIEVED_AT,
  });

  const result = await service.getEvidenceForOfficial({ id: OFFICIAL_ID });

  assert.deepEqual(result.records, []);
  assert.deepEqual(result, {
    records: [],
    reviewedMeasureCount: 2,
    successfulMeasureCount: 2,
    failedMeasureCount: 0,
  });
});

test('does not fetch or emit evidence when the requested OCD person ID is absent', async () => {
  const { fetchImpl, requests } = createFetch({});
  const service = createOpenStatesEvidenceService({
    fetchImpl,
    apiKey: 'test-key',
    measures: MEASURES,
    now: () => FIXED_RETRIEVED_AT,
  });

  const result = await service.getEvidenceForOfficial();

  assert.deepEqual(result, {
    records: [],
    reviewedMeasureCount: 0,
    successfulMeasureCount: 0,
    failedMeasureCount: 0,
  });
  assert.equal(requests.length, 0);
});

test('does not emit evidence when nested sponsor and voter OCD IDs are absent', async () => {
  const missingIdsBill = structuredClone(LIVE_BILL);
  missingIdsBill.sponsorships = [{
    ...LIVE_BILL.sponsorships[1],
    person: { name: 'Fixture Official' },
  }];
  missingIdsBill.votes = [{
    ...LIVE_BILL.votes[0],
    votes: [{ option: 'yes', voter: { name: 'Fixture Official' } }],
  }];
  const { fetchImpl } = createFetch({
    J2143: jsonResponse(missingIdsBill),
    S7034: jsonResponse(liveBillFor('S 7034', {
      sponsorships: missingIdsBill.sponsorships,
      votes: missingIdsBill.votes,
    })),
  });
  const service = createOpenStatesEvidenceService({
    fetchImpl,
    apiKey: 'test-key',
    measures: MEASURES,
    now: () => FIXED_RETRIEVED_AT,
  });

  const result = await service.getEvidenceForOfficial({ id: OFFICIAL_ID });

  assert.deepEqual(result.records, []);
  assert.deepEqual(result, {
    records: [],
    reviewedMeasureCount: 2,
    successfulMeasureCount: 2,
    failedMeasureCount: 0,
  });
});

test('preserves literal vote option, motion, and result for an exact nested voter ID', async () => {
  const { fetchImpl } = createFetch({
    J2143: jsonResponse(LIVE_BILL),
    S7034: jsonResponse({}, 404),
  });
  const service = createOpenStatesEvidenceService({
    fetchImpl,
    apiKey: 'test-key',
    measures: MEASURES,
    now: () => FIXED_RETRIEVED_AT,
  });

  const result = await service.getEvidenceForOfficial({ id: OFFICIAL_ID });
  const vote = result.records.find((record) => record.actionType === 'roll_call_vote');

  assert.equal(vote.finding, 'Voted yes on On adoption of the resolution.');
  assert.equal(vote.date, '2026-04-20');
  assert.deepEqual(vote.action, {
    option: 'yes',
    motion: 'On adoption of the resolution',
    result: 'Adopted',
  });
  assert.equal(vote.verification.matchMethod, 'ocd_person_id');
});

test('treats empty and mismatched 2xx bill payloads as failed measure coverage', async () => {
  const cases = [
    ['empty object', {}],
    ['missing bill ID', liveBillFor('J 2143', { id: '' })],
    ['missing live title', liveBillFor('J 2143', { title: '' })],
    ['different identifier', liveBillFor('J 21430')],
    ['different session', liveBillFor('J 2143', { session: '2023-2024' })],
    ['different jurisdiction', liveBillFor('J 2143', {
      jurisdiction: {
        id: 'ocd-jurisdiction/country:us/state:ca/government',
        name: 'California',
        classification: 'state',
      },
    })],
  ];

  for (const [label, body] of cases) {
    const { fetchImpl } = createFetch({ J2143: jsonResponse(body) });
    const service = createOpenStatesEvidenceService({
      fetchImpl,
      apiKey: 'test-key',
      measures: ONE_MEASURE,
      now: () => FIXED_RETRIEVED_AT,
    });

    const result = await service.getEvidenceForOfficial({ id: OFFICIAL_ID });

    assert.deepEqual(result, {
      records: [],
      reviewedMeasureCount: 1,
      successfulMeasureCount: 0,
      failedMeasureCount: 1,
    }, label);
  }
});

test('accepts only safely canonical-equivalent bill identifier punctuation', async () => {
  const { fetchImpl } = createFetch({
    J2143: jsonResponse(liveBillFor('J. 2,143')),
  });
  const service = createOpenStatesEvidenceService({
    fetchImpl,
    apiKey: 'test-key',
    measures: ONE_MEASURE,
    now: () => FIXED_RETRIEVED_AT,
  });

  const result = await service.getEvidenceForOfficial({ id: OFFICIAL_ID });

  assert.equal(result.successfulMeasureCount, 1);
  assert.ok(result.records.length > 0);
  assert.ok(result.records.every((record) => record.measure.identifier === 'J. 2,143'));
});

test('requires every requested Open States include expansion to be an array', async () => {
  for (const field of ['sponsorships', 'votes', 'actions', 'sources']) {
    const { fetchImpl } = createFetch({
      J2143: jsonResponse(liveBillFor('J 2143', { [field]: undefined })),
    });
    const service = createOpenStatesEvidenceService({
      fetchImpl,
      apiKey: 'test-key',
      measures: ONE_MEASURE,
      now: () => FIXED_RETRIEVED_AT,
    });

    const result = await service.getEvidenceForOfficial({ id: OFFICIAL_ID });

    assert.equal(result.successfulMeasureCount, 0, field);
    assert.equal(result.failedMeasureCount, 1, field);
    assert.deepEqual(result.records, [], field);
  }
});

test('fails measure coverage instead of emitting a matched action without an official source', async () => {
  const { fetchImpl } = createFetch({
    J2143: jsonResponse(liveBillFor('J 2143', { sources: [] })),
  });
  const service = createOpenStatesEvidenceService({
    fetchImpl,
    apiKey: 'test-key',
    measures: ONE_MEASURE,
    now: () => FIXED_RETRIEVED_AT,
  });

  const result = await service.getEvidenceForOfficial({ id: OFFICIAL_ID });

  assert.deepEqual(result, {
    records: [],
    reviewedMeasureCount: 1,
    successfulMeasureCount: 0,
    failedMeasureCount: 1,
  });
});

test('prefers an official vote source over the bill-level source', async () => {
  const bill = liveBillFor('J 2143');
  bill.votes[0].sources = [{
    url: 'https://legislation.example/votes/41',
    note: 'New York Legislature roll call',
  }];
  const { fetchImpl } = createFetch({ J2143: jsonResponse(bill) });
  const service = createOpenStatesEvidenceService({
    fetchImpl,
    apiKey: 'test-key',
    measures: ONE_MEASURE,
    now: () => FIXED_RETRIEVED_AT,
  });

  const result = await service.getEvidenceForOfficial({ id: OFFICIAL_ID });
  const vote = result.records.find((record) => record.actionType === 'roll_call_vote');

  assert.deepEqual(vote.sources, [{
    publisher: 'New York Legislature roll call',
    url: 'https://legislation.example/votes/41',
  }]);
});

test('omits a state vote date when the vote event has no date', async () => {
  const bill = liveBillFor('J 2143');
  delete bill.votes[0].start_date;
  const { fetchImpl } = createFetch({ J2143: jsonResponse(bill) });
  const service = createOpenStatesEvidenceService({
    fetchImpl,
    apiKey: 'test-key',
    measures: ONE_MEASURE,
    now: () => FIXED_RETRIEVED_AT,
  });

  const result = await service.getEvidenceForOfficial({ id: OFFICIAL_ID });
  const vote = result.records.find((record) => record.actionType === 'roll_call_vote');

  assert.equal(Object.hasOwn(vote, 'date'), false);
});

test('retries one transient measure response and preserves partial coverage counters', async () => {
  const { fetchImpl, requests } = createFetch({
    J2143: [jsonResponse({}, 503), jsonResponse(LIVE_BILL)],
    S7034: jsonResponse({}, 404),
  });
  const service = createOpenStatesEvidenceService({
    fetchImpl,
    apiKey: 'test-key',
    measures: MEASURES,
    now: () => FIXED_RETRIEVED_AT,
  });

  const result = await service.getEvidenceForOfficial({ id: OFFICIAL_ID });

  assert.equal(requests.filter((request) => request.lookupId === 'J2143').length, 2);
  assert.equal(result.records.length, 2);
  assert.deepEqual({
    reviewedMeasureCount: result.reviewedMeasureCount,
    successfulMeasureCount: result.successfulMeasureCount,
    failedMeasureCount: result.failedMeasureCount,
  }, {
    reviewedMeasureCount: 2,
    successfulMeasureCount: 1,
    failedMeasureCount: 1,
  });
});
