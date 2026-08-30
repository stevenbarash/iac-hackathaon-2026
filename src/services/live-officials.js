import { randomUUID } from 'node:crypto';

import { DomainError } from '../domain/officials.js';

const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const OPEN_STATES_URL = 'https://v3.openstates.org';
const UPSTREAM_TIMEOUT_MS = 5000;

const EVIDENCE_STATUS = Object.freeze({
  status: 'not_researched',
  message: 'Israel and Jewish-community issue evidence has not been researched for this live official yet.',
});

function configurationError() {
  return new DomainError(
    'CONFIGURATION_REQUIRED',
    'Live official lookup is not configured. Set OPENSTATES_API_KEY on the server.',
    503,
  );
}

function upstreamError() {
  return new DomainError(
    'UPSTREAM_SERVICE_UNAVAILABLE',
    'Live official data is temporarily unavailable. Try the illustrative demo or try again shortly.',
    503,
  );
}

function titleCase(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function districtLabel(person) {
  const title = person.current_role?.title || 'Elected official';
  const district = person.current_role?.district;
  return district === undefined || district === '' ? title : `${title} District ${district}`;
}

function compactPerson(person) {
  return {
    id: person.id,
    name: person.name,
    office: person.current_role?.title || 'Elected official',
    district: districtLabel(person),
    party: person.party || '',
    imageUrl: person.image || '',
    documentedRecordCount: 0,
    dataMode: 'live_identity',
    evidenceStatus: 'not_researched',
  };
}

function completePerson(person) {
  const office = person.offices?.find((candidate) => candidate.classification === 'district')
    || person.offices?.[0]
    || {};
  const website = person.links?.find((link) => link.note?.toLowerCase().includes('homepage'))?.url
    || person.links?.[0]?.url
    || person.openstates_url
    || '';
  const district = districtLabel(person);

  return {
    id: person.id,
    name: person.name,
    office: person.current_role?.title || 'Elected official',
    district,
    party: person.party || '',
    imageUrl: person.image || '',
    responsibilities: [
      `Represents constituents as ${district}.`,
      `Serves in ${person.jurisdiction?.name || 'the applicable legislature'}.`,
    ],
    contact: {
      website,
      email: person.email || '',
      phone: office.voice || '',
      officeAddress: office.address || '',
    },
    issueRecords: [],
    dataMode: 'live_identity',
    evidenceStatus: { ...EVIDENCE_STATUS },
    sourceAttribution: {
      name: 'Open States',
      url: person.openstates_url || 'https://openstates.org/',
      updatedAt: person.updated_at || '',
    },
  };
}

async function readJson(response) {
  if (!response.ok) throw upstreamError();
  try {
    return await response.json();
  } catch {
    throw upstreamError();
  }
}

export function createLiveOfficialService({
  fetchImpl = fetch,
  apiKey = process.env.OPENSTATES_API_KEY || '',
  timeoutMs = UPSTREAM_TIMEOUT_MS,
} = {}) {
  async function request(url, options = {}) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetchImpl(url, { ...options, signal: AbortSignal.timeout(timeoutMs) });
        if (response.ok || response.status < 500 || attempt === 1) return response;
      } catch (error) {
        if (error instanceof DomainError) throw error;
        if (attempt === 1) throw upstreamError();
      }
    }
    throw upstreamError();
  }

  async function lookup({ address } = {}) {
    if (!apiKey) throw configurationError();
    if (typeof address !== 'string' || address.trim() === '') {
      throw new DomainError('ADDRESS_REQUIRED', 'Enter a full U.S. address to find live officials.', 400);
    }
    if (!/\b\d{5}(?:-\d{4})?\b/.test(address)) {
      throw new DomainError(
        'ADDRESS_AMBIGUOUS',
        'Add a 5-digit ZIP code so the address can be matched to the correct location.',
        422,
      );
    }

    const censusUrl = new URL(CENSUS_URL);
    censusUrl.searchParams.set('address', address.trim());
    censusUrl.searchParams.set('benchmark', 'Public_AR_Current');
    censusUrl.searchParams.set('format', 'json');
    const censusBody = await readJson(await request(censusUrl));
    const matches = censusBody?.result?.addressMatches;
    if (!Array.isArray(matches) || matches.length === 0) {
      throw new DomainError('ADDRESS_NOT_FOUND', 'The U.S. Census Geocoder could not match that address.', 404);
    }
    if (matches.length > 1) {
      throw new DomainError('ADDRESS_AMBIGUOUS', 'The address matched multiple locations. Add a street number and ZIP code.', 422);
    }

    const match = matches[0];
    const openStatesUrl = new URL('/people.geo', OPEN_STATES_URL);
    openStatesUrl.searchParams.set('lat', String(match.coordinates.y));
    openStatesUrl.searchParams.set('lng', String(match.coordinates.x));
    const peopleBody = await readJson(await request(openStatesUrl, {
      headers: { 'X-API-KEY': apiKey },
    }));
    const people = Array.isArray(peopleBody?.results)
      ? peopleBody.results.filter((person) => person?.id && person?.name && person?.current_role)
      : [];
    if (people.length === 0) {
      throw new DomainError('OFFICIALS_NOT_FOUND', 'Open States did not return current officials for that location.', 404);
    }

    return {
      requestId: randomUUID(),
      coverage: {
        status: 'live_identity',
        message: 'Official identity and district data comes from Open States. Israel and Jewish-community issue evidence has not been researched yet.',
      },
      location: {
        city: titleCase(match.addressComponents?.city),
        state: String(match.addressComponents?.state || '').toUpperCase(),
        districts: [...new Set(people.map(districtLabel))],
      },
      officials: people.map(compactPerson),
    };
  }

  async function getOfficial(id) {
    if (!apiKey) throw configurationError();
    if (typeof id !== 'string' || !id.startsWith('ocd-person/')) {
      throw new DomainError('OFFICIAL_NOT_FOUND', 'No live official matches that identifier.', 404);
    }

    const openStatesUrl = new URL('/people', OPEN_STATES_URL);
    openStatesUrl.searchParams.set('id', id);
    openStatesUrl.searchParams.append('include', 'links');
    openStatesUrl.searchParams.append('include', 'offices');
    const peopleBody = await readJson(await request(openStatesUrl, {
      headers: { 'X-API-KEY': apiKey },
    }));
    const person = peopleBody?.results?.[0];
    if (!person) throw new DomainError('OFFICIAL_NOT_FOUND', 'No live official matches that identifier.', 404);
    return completePerson(person);
  }

  return { lookup, getOfficial };
}
