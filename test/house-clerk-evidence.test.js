import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createHouseClerkEvidenceService,
  parseHouseRollCallXml,
} from '../src/services/house-clerk-evidence.js';

const FIXED_RETRIEVED_AT = '2026-08-30T12:00:00.000Z';
const MATCHING_BIOGUIDE_ID = 'G000599';
const PROCEDURAL_QUESTION = 'On the Motion to Recommit';

const MEASURES = Object.freeze([
  Object.freeze({
    key: 'fixture-house-roll',
    provider: 'house_clerk',
    congress: 118,
    session: 2,
    year: 2024,
    rollNumber: 172,
    topics: Object.freeze(['ihra']),
    inclusionRationale: 'Fixture coverage declaration.',
  }),
]);

const ROLL_CALL_XML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE rollcall-vote PUBLIC "-//US Congress//DTDs/vote v1.0 20031119 //EN" "../vote.dtd">
<rollcall-vote xmlns="https://clerk.house.gov/evs">
  <vote-metadata source="House Clerk">
    <congress>118</congress>
    <session>2nd</session>
    <rollcall-num>172</rollcall-num>
    <legis-num>H R 6090</legis-num>
    <vote-desc>Fixture &amp; encoded legislation description</vote-desc>
    <vote-question>${PROCEDURAL_QUESTION}</vote-question>
    <vote-result>Passed</vote-result>
    <action-date>1-May-2024</action-date>
  </vote-metadata>
  <vote-data>
    <recorded-vote>
      <legislator name-id="G000599" party="D" state="NY">Fixture Official</legislator>
      <vote>Yea</vote>
    </recorded-vote>
    <recorded-vote>
      <legislator name-id="O000000" party="R" state="NY">Another Official</legislator>
      <vote>Nay</vote>
    </recorded-vote>
  </vote-data>
</rollcall-vote>`;

function xmlResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/xml' },
  });
}

function createFetch(response) {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: new URL(url), options });
    if (response instanceof Error) throw response;
    return response;
  };
  return { fetchImpl, requests };
}

test('parses Clerk metadata and exact Bioguide vote values from XML', () => {
  const roll = parseHouseRollCallXml(ROLL_CALL_XML);

  assert.equal(roll.rollNumber, 172);
  assert.equal(roll.session, 2);
  assert.equal(roll.legislationIdentifier, 'H R 6090');
  assert.equal(roll.question, PROCEDURAL_QUESTION);
  assert.equal(roll.description, 'Fixture & encoded legislation description');
  assert.equal(roll.actionDate, '1-May-2024');
  assert.equal(roll.votes.get('G000599'), 'Yea');
  assert.equal(roll.votes.get('O000000'), 'Nay');
});

test('emits a literal Clerk roll-call record for an exact Bioguide match', async () => {
  const { fetchImpl, requests } = createFetch(xmlResponse(ROLL_CALL_XML));
  const service = createHouseClerkEvidenceService({
    fetchImpl,
    measures: MEASURES,
    now: () => FIXED_RETRIEVED_AT,
  });

  const result = await service.getEvidenceForOfficial({ bioguideId: MATCHING_BIOGUIDE_ID });

  assert.equal(result.records.length, 1);
  assert.deepEqual(result.records[0], {
    topic: 'ihra',
    position: 'related_action',
    actionType: 'roll_call_vote',
    finding: `Voted Yea on ${PROCEDURAL_QUESTION}.`,
    date: '2024-05-01',
    measure: {
      jurisdiction: 'United States',
      session: '118',
      identifier: 'H R 6090',
      title: 'Fixture & encoded legislation description',
    },
    action: {
      option: 'Yea',
      motion: PROCEDURAL_QUESTION,
      result: 'Passed',
    },
    sources: [{
      publisher: 'Office of the Clerk, U.S. House of Representatives',
      url: 'https://clerk.house.gov/evs/2024/roll172.xml',
    }],
    verification: {
      status: 'live_official_source',
      matchMethod: 'bioguide_id',
      retrievedAt: FIXED_RETRIEVED_AT,
    },
  });
  assert.deepEqual({
    reviewedMeasureCount: result.reviewedMeasureCount,
    successfulMeasureCount: result.successfulMeasureCount,
    failedMeasureCount: result.failedMeasureCount,
  }, {
    reviewedMeasureCount: 1,
    successfulMeasureCount: 1,
    failedMeasureCount: 0,
  });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.href, 'https://clerk.house.gov/evs/2024/roll172.xml');
  assert.ok(requests[0].options.signal, 'a bounded request signal is supplied');
});

test('does not use an official display name when the Bioguide ID differs', async () => {
  const { fetchImpl } = createFetch(xmlResponse(ROLL_CALL_XML));
  const service = createHouseClerkEvidenceService({
    fetchImpl,
    measures: MEASURES,
    now: () => FIXED_RETRIEVED_AT,
  });

  const result = await service.getEvidenceForOfficial({ bioguideId: 'D000000' });

  assert.deepEqual(result, {
    records: [],
    reviewedMeasureCount: 1,
    successfulMeasureCount: 1,
    failedMeasureCount: 0,
  });
});

test('does not normalize a Bioguide ID before matching it to Clerk XML', async () => {
  const { fetchImpl } = createFetch(xmlResponse(ROLL_CALL_XML));
  const service = createHouseClerkEvidenceService({
    fetchImpl,
    measures: MEASURES,
    now: () => FIXED_RETRIEVED_AT,
  });

  const result = await service.getEvidenceForOfficial({ bioguideId: ` ${MATCHING_BIOGUIDE_ID} ` });

  assert.deepEqual(result, {
    records: [],
    reviewedMeasureCount: 1,
    successfulMeasureCount: 1,
    failedMeasureCount: 0,
  });
});

test('does not trim Clerk name-id attributes before exact Bioguide matching', async () => {
  const whitespacePaddedIdXml = ROLL_CALL_XML.replace(
    `name-id="${MATCHING_BIOGUIDE_ID}"`,
    `name-id=" ${MATCHING_BIOGUIDE_ID} "`,
  );
  const { fetchImpl } = createFetch(xmlResponse(whitespacePaddedIdXml));
  const service = createHouseClerkEvidenceService({ fetchImpl, measures: MEASURES });

  const result = await service.getEvidenceForOfficial({ bioguideId: MATCHING_BIOGUIDE_ID });

  assert.deepEqual(result, {
    records: [],
    reviewedMeasureCount: 1,
    successfulMeasureCount: 1,
    failedMeasureCount: 0,
  });
});

test('does not fetch when the Bioguide ID is missing or blank', async () => {
  const { fetchImpl, requests } = createFetch(xmlResponse(ROLL_CALL_XML));
  const service = createHouseClerkEvidenceService({ fetchImpl, measures: MEASURES });

  const missing = await service.getEvidenceForOfficial();
  const blank = await service.getEvidenceForOfficial({ bioguideId: '   ' });

  assert.deepEqual(missing, {
    records: [],
    reviewedMeasureCount: 0,
    successfulMeasureCount: 0,
    failedMeasureCount: 0,
  });
  assert.deepEqual(blank, missing);
  assert.equal(requests.length, 0);
});

test('treats malformed and mismatched Clerk roll documents as failed coverage', async () => {
  const mismatchedXml = ROLL_CALL_XML.replace('<rollcall-num>172</rollcall-num>', '<rollcall-num>173</rollcall-num>');
  const { fetchImpl } = createFetch(xmlResponse(mismatchedXml));
  const service = createHouseClerkEvidenceService({ fetchImpl, measures: MEASURES });

  assert.throws(() => parseHouseRollCallXml('<rollcall-vote><vote-metadata>'), /Malformed House Clerk XML/);
  const result = await service.getEvidenceForOfficial({ bioguideId: MATCHING_BIOGUIDE_ID });

  assert.deepEqual(result, {
    records: [],
    reviewedMeasureCount: 1,
    successfulMeasureCount: 0,
    failedMeasureCount: 1,
  });
});

test('rejects undeclared entities in ignored legislator display text', async () => {
  const undeclaredEntityXml = ROLL_CALL_XML.replace('Fixture Official', 'Fixture &untrusted; Official');
  const { fetchImpl } = createFetch(xmlResponse(undeclaredEntityXml));
  const service = createHouseClerkEvidenceService({ fetchImpl, measures: MEASURES });

  assert.throws(() => parseHouseRollCallXml(undeclaredEntityXml), /Malformed House Clerk XML/);
  const result = await service.getEvidenceForOfficial({ bioguideId: MATCHING_BIOGUIDE_ID });

  assert.deepEqual(result, {
    records: [],
    reviewedMeasureCount: 1,
    successfulMeasureCount: 0,
    failedMeasureCount: 1,
  });
});
