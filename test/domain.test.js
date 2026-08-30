import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DomainError,
  getOfficialById,
  lookupOfficials,
  POSITIONS,
  TOPICS,
} from '../src/domain/officials.js';
import { OFFICIALS } from '../src/data/officials.js';

const DEMO_ADDRESS = 'Brooklyn, NY 11201';
const STREET_ADDRESS = '123 Demo Street, Brooklyn, NY 11201';

test('a Brooklyn demo address returns exactly three compact officials', () => {
  const result = lookupOfficials({ address: DEMO_ADDRESS });

  assert.equal(result.officials.length, 3);
  for (const official of result.officials) {
    assert.deepEqual(Object.keys(official).sort(), [
      'district',
      'documentedRecordCount',
      'id',
      'name',
      'office',
    ]);
  }
});

test('lookup location includes city, state, and district labels but never street text', () => {
  const result = lookupOfficials({ address: STREET_ADDRESS });
  const serialized = JSON.stringify(result.location);

  assert.deepEqual(Object.keys(result.location).sort(), ['city', 'districts', 'state']);
  assert.equal(result.location.city, 'Brooklyn');
  assert.equal(result.location.state, 'NY');
  assert.equal(serialized.includes('123 Demo Street'), false);
  assert.equal(JSON.stringify(result).includes('123 Demo Street'), false);
});

test('an ihra topic filter limits each compact card record count to ihra records', () => {
  const result = lookupOfficials({ address: DEMO_ADDRESS, topics: ['ihra'] });

  assert.equal(result.officials.length, 3);
  for (const official of result.officials) {
    assert.equal(official.documentedRecordCount, 1);
  }
});

test('an empty address raises ADDRESS_REQUIRED', () => {
  assert.throws(
    () => lookupOfficials({ address: '   ' }),
    (error) => error instanceof DomainError && error.code === 'ADDRESS_REQUIRED' && error.status === 400,
  );
});

test('an unsupported address raises OUTSIDE_PILOT_COVERAGE with a usable demo suggestion', () => {
  let error;
  try {
    lookupOfficials({ address: '1 Main Street, Albany, NY 12207' });
  } catch (caught) {
    error = caught;
  }

  assert.ok(error instanceof DomainError);
  assert.equal(error.code, 'OUTSIDE_PILOT_COVERAGE');
  assert.equal(error.status, 422);
  assert.deepEqual(error.suggestions, [DEMO_ADDRESS]);
  assert.equal(JSON.stringify(error).includes('Main Street'), false);
  assert.equal(JSON.stringify(error.suggestions).includes('Street'), false);
});

test('pilot matching accepts the standalone ZIP or Brooklyn paired with a New York marker', () => {
  for (const address of [
    '1 Main Street, Albany, NY 11201',
    '123 Demo Street, Brooklyn, NY 10001',
    'Brooklyn New York',
  ]) {
    assert.equal(lookupOfficials({ address }).location.city, 'Brooklyn');
  }
});

test('pilot matching rejects Brooklyn used only as a street name or paired with another state', () => {
  for (const address of [
    '1 Brooklyn Avenue, Albany, NY 12207',
    'Brooklyn, Ohio',
  ]) {
    assert.throws(
      () => lookupOfficials({ address }),
      (error) => error instanceof DomainError
        && error.code === 'OUTSIDE_PILOT_COVERAGE'
        && error.status === 422,
    );
  }
});

test('all illustrative officials and issue records satisfy the data invariants', () => {
  const officialIds = new Set();
  const evidenceUrls = new Set();
  const isoDate = /^\d{4}-\d{2}-\d{2}$/;
  const assertValidDate = (value) => {
    assert.match(value, isoDate);
    assert.equal(new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10), value);
  };

  for (const official of OFFICIALS) {
    assert.match(official.id, /^[a-z0-9]+(?:-[a-z0-9]+)+$/);
    assert.equal(officialIds.has(official.id), false, `official ID is unique: ${official.id}`);
    officialIds.add(official.id);
    assert.match(official.contact.website, /^https:\/\/example\.org\//);
    assert.match(official.contact.email, /@example\.org$/);

    for (const record of official.issueRecords) {
      assert.ok(TOPICS.includes(record.topic), `allowed topic: ${record.topic}`);
      assert.ok(POSITIONS.includes(record.position), `allowed position: ${record.position}`);
      assert.equal(typeof record.finding, 'string');
      assert.ok(record.finding.length > 0);
      assert.equal(typeof record.evidenceType, 'string');
      assert.ok(record.evidenceType.length > 0);
      assertValidDate(record.date);
      assert.equal(typeof record.source.title, 'string');
      assert.ok(record.source.title.length > 0);
      assert.match(record.source.url, /^https:\/\/example\.org\//);
      assert.equal(evidenceUrls.has(record.source.url), false, `evidence URL is unique: ${record.source.url}`);
      evidenceUrls.add(record.source.url);
      assertValidDate(record.source.publishedAt);
      assert.equal(record.verification.status, 'demo_only');
      assertValidDate(record.verification.verifiedAt);
      assert.equal(typeof record.verification.note, 'string');
      assert.ok(record.verification.note.length > 0);
    }
  }

  assert.equal(officialIds.size, OFFICIALS.length);
});

test('an unknown official ID raises OFFICIAL_NOT_FOUND', () => {
  assert.throws(
    () => getOfficialById('missing-official'),
    (error) => error instanceof DomainError && error.code === 'OFFICIAL_NOT_FOUND' && error.status === 404,
  );
});

test('lookup and profile results are defensive clones', () => {
  const lookup = lookupOfficials({ address: DEMO_ADDRESS });
  const originalLookupName = lookup.officials[0].name;
  lookup.officials[0].name = 'Changed name';
  assert.equal(lookupOfficials({ address: DEMO_ADDRESS }).officials[0].name, originalLookupName);

  const profile = getOfficialById(lookup.officials[0].id);
  const originalFinding = profile.issueRecords[0].finding;
  profile.issueRecords[0].finding = 'Changed finding';
  assert.equal(getOfficialById(profile.id).issueRecords[0].finding, originalFinding);
});
