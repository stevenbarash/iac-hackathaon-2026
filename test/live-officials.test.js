import assert from 'node:assert/strict';
import test from 'node:test';

import { DomainError } from '../src/domain/officials.js';
import { createLiveOfficialService } from '../src/services/live-officials.js';

const CENSUS_MATCH = {
  result: {
    addressMatches: [{
      coordinates: { x: -73.9912, y: 40.6921 },
      addressComponents: { city: 'BROOKLYN', state: 'NY', zip: '11201' },
      matchedAddress: '123 TEST ST, BROOKLYN, NY, 11201',
    }],
  },
};

const OPEN_STATES_PERSON = {
  id: 'ocd-person/11111111-2222-3333-4444-555555555555',
  name: 'Taylor Example',
  party: 'Independent',
  current_role: {
    title: 'Assembly Member',
    org_classification: 'lower',
    district: '52',
    division_id: 'ocd-division/country:us/state:ny/sldl:52',
  },
  jurisdiction: {
    id: 'ocd-jurisdiction/country:us/state:ny/government',
    name: 'New York',
    classification: 'state',
  },
  given_name: 'Taylor',
  family_name: 'Example',
  image: 'https://example.net/taylor.jpg',
  email: 'taylor@example.net',
  gender: '',
  birth_date: '',
  death_date: '',
  extras: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  openstates_url: 'https://openstates.org/person/taylor-example/',
  links: [{ url: 'https://assembly.example.gov/taylor', note: 'homepage' }],
  sources: [{ url: 'https://assembly.example.gov/taylor', note: '' }],
  offices: [{
    name: 'District Office',
    fax: '',
    voice: '718-555-0199',
    address: '1 District Plaza; Brooklyn NY; 11201',
    classification: 'district',
  }],
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createFetch({ census = CENSUS_MATCH, people = [OPEN_STATES_PERSON], openStatesStatus = 200 } = {}) {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url: String(url), options });
    if (String(url).startsWith('https://geocoding.geo.census.gov/')) {
      return jsonResponse(census);
    }
    if (String(url).startsWith('https://v3.openstates.org/')) {
      return jsonResponse({ results: people, pagination: { per_page: 10, page: 1, max_page: 1, total_items: people.length } }, openStatesStatus);
    }
    throw new Error(`Unexpected URL: ${url}`);
  };
  return { fetchImpl, requests };
}

test('live lookup geocodes once, authenticates Open States by header, and returns no issue claims', async () => {
  const { fetchImpl, requests } = createFetch();
  const service = createLiveOfficialService({ fetchImpl, apiKey: 'test-key' });

  const result = await service.lookup({ address: '123 Test Street, Brooklyn, NY 11201' });

  assert.equal(requests.length, 2);
  const censusUrl = new URL(requests[0].url);
  assert.equal(censusUrl.pathname, '/geocoder/locations/onelineaddress');
  assert.equal(censusUrl.searchParams.get('address'), '123 Test Street, Brooklyn, NY 11201');
  assert.equal(censusUrl.searchParams.get('benchmark'), 'Public_AR_Current');
  assert.equal(censusUrl.searchParams.get('format'), 'json');

  const openStatesUrl = new URL(requests[1].url);
  assert.equal(openStatesUrl.pathname, '/people.geo');
  assert.equal(openStatesUrl.searchParams.get('lat'), '40.6921');
  assert.equal(openStatesUrl.searchParams.get('lng'), '-73.9912');
  assert.equal(requests[1].options.headers['X-API-KEY'], 'test-key');
  assert.equal(openStatesUrl.searchParams.has('apikey'), false);

  assert.equal(result.coverage.status, 'live_identity');
  assert.deepEqual(result.location, { city: 'Brooklyn', state: 'NY', districts: ['Assembly Member District 52'] });
  assert.deepEqual(result.officials, [{
    id: OPEN_STATES_PERSON.id,
    name: 'Taylor Example',
    office: 'Assembly Member',
    district: 'Assembly Member District 52',
    party: 'Independent',
    imageUrl: 'https://example.net/taylor.jpg',
    documentedRecordCount: 0,
    dataMode: 'live_identity',
    evidenceStatus: 'not_researched',
  }]);
  assert.equal(JSON.stringify(result).includes('123 Test Street'), false);
});

test('live profile normalizes Open States contact data and explicitly marks evidence unresearched', async () => {
  const { fetchImpl, requests } = createFetch();
  const service = createLiveOfficialService({ fetchImpl, apiKey: 'test-key' });

  const profile = await service.getOfficial(OPEN_STATES_PERSON.id);

  const requestUrl = new URL(requests[0].url);
  assert.equal(requestUrl.pathname, '/people');
  assert.equal(requestUrl.searchParams.get('id'), OPEN_STATES_PERSON.id);
  assert.deepEqual(requestUrl.searchParams.getAll('include'), ['links', 'offices']);
  assert.equal(profile.id, OPEN_STATES_PERSON.id);
  assert.equal(profile.contact.website, 'https://assembly.example.gov/taylor');
  assert.equal(profile.contact.email, 'taylor@example.net');
  assert.equal(profile.contact.phone, '718-555-0199');
  assert.equal(profile.contact.officeAddress, '1 District Plaza; Brooklyn NY; 11201');
  assert.deepEqual(profile.issueRecords, []);
  assert.deepEqual(profile.evidenceStatus, {
    status: 'not_researched',
    message: 'Israel and Jewish-community issue evidence has not been researched for this live official yet.',
  });
  assert.equal(profile.dataMode, 'live_identity');
  assert.equal(profile.sourceAttribution.url, 'https://openstates.org/person/taylor-example/');
});

test('missing key fails before transmitting an address', async () => {
  const { fetchImpl, requests } = createFetch();
  const service = createLiveOfficialService({ fetchImpl, apiKey: '' });

  await assert.rejects(
    service.lookup({ address: '123 Test Street, Brooklyn, NY 11201' }),
    (error) => error instanceof DomainError
      && error.code === 'CONFIGURATION_REQUIRED'
      && error.status === 503,
  );
  assert.equal(requests.length, 0);
});

test('live lookup rejects a street address without a ZIP before calling a slow geocoder', async () => {
  const { fetchImpl, requests } = createFetch();
  const service = createLiveOfficialService({ fetchImpl, apiKey: 'test-key' });

  await assert.rejects(
    service.lookup({ address: '240 40th st new york' }),
    (error) => error instanceof DomainError
      && error.code === 'ADDRESS_AMBIGUOUS'
      && error.status === 422
      && /5-digit ZIP/i.test(error.message),
  );
  assert.equal(requests.length, 0);
});

test('live lookup retries one transient geocoder transport failure', async () => {
  let censusAttempts = 0;
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push(String(url));
    if (String(url).startsWith('https://geocoding.geo.census.gov/')) {
      censusAttempts += 1;
      if (censusAttempts === 1) throw new Error('temporary timeout');
      return jsonResponse(CENSUS_MATCH);
    }
    return jsonResponse({
      results: [OPEN_STATES_PERSON],
      pagination: { per_page: 10, page: 1, max_page: 1, total_items: 1 },
    });
  };
  const service = createLiveOfficialService({ fetchImpl, apiKey: 'test-key' });

  const result = await service.lookup({ address: '240 40th St, Brooklyn, NY 11232' });

  assert.equal(censusAttempts, 2);
  assert.equal(requests.length, 3);
  assert.equal(result.location.city, 'Brooklyn');
});

test('zero Census matches returns ADDRESS_NOT_FOUND without calling Open States', async () => {
  const { fetchImpl, requests } = createFetch({ census: { result: { addressMatches: [] } } });
  const service = createLiveOfficialService({ fetchImpl, apiKey: 'test-key' });

  await assert.rejects(
    service.lookup({ address: '999 Missing Street, Brooklyn, NY 11232' }),
    (error) => error instanceof DomainError
      && error.code === 'ADDRESS_NOT_FOUND'
      && error.status === 404,
  );
  assert.equal(requests.length, 1);
});

test('multiple Census matches returns ADDRESS_AMBIGUOUS without echoing matched streets', async () => {
  const census = {
    result: {
      addressMatches: [
        CENSUS_MATCH.result.addressMatches[0],
        { ...CENSUS_MATCH.result.addressMatches[0], matchedAddress: '125 TEST ST, BROOKLYN, NY, 11201' },
      ],
    },
  };
  const { fetchImpl } = createFetch({ census });
  const service = createLiveOfficialService({ fetchImpl, apiKey: 'test-key' });

  await assert.rejects(
    service.lookup({ address: 'Test Street, Brooklyn, NY' }),
    (error) => error instanceof DomainError
      && error.code === 'ADDRESS_AMBIGUOUS'
      && error.status === 422
      && error.suggestions.length === 0,
  );
});

test('Open States failures become a contained upstream error', async () => {
  const { fetchImpl } = createFetch({ openStatesStatus: 503 });
  const service = createLiveOfficialService({ fetchImpl, apiKey: 'test-key' });

  await assert.rejects(
    service.lookup({ address: '123 Test Street, Brooklyn, NY 11201' }),
    (error) => error instanceof DomainError
      && error.code === 'UPSTREAM_SERVICE_UNAVAILABLE'
      && error.status === 503
      && !error.message.includes('test-key'),
  );
});
