import { randomUUID } from 'node:crypto';

import { DomainError } from '../domain/officials.js';
import { createHouseClerkEvidenceService } from './house-clerk-evidence.js';
import { createOfficialEvidenceService } from './official-evidence.js';
import { createOpenStatesEvidenceService } from './openstates-evidence.js';

const CENSUS_URL = 'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress';
const PHOTON_URL = 'https://photon.komoot.io/api/';
const OPEN_STATES_URL = 'https://v3.openstates.org';
const UPSTREAM_TIMEOUT_MS = 5000;

const EVIDENCE_STATUS = Object.freeze({
  status: 'not_researched',
  message: 'Israel and Jewish-community issue evidence has not been researched for this live official yet.',
});

const EVIDENCE_UNAVAILABLE_STATUS = Object.freeze({
  status: 'temporarily_unavailable',
  catalogVersion: 'ny-federal-pilot-v1',
  reviewedMeasureCount: 0,
  successfulMeasureCount: 0,
  failedMeasureCount: 0,
  message: 'Official identity and contact data is available, but issue evidence is temporarily unavailable.',
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

function normalizeOtherIdentifiers(otherIdentifiers) {
  if (!Array.isArray(otherIdentifiers)) return {};
  const entries = otherIdentifiers
    .filter((entry) => entry && typeof entry.scheme === 'string' && typeof entry.identifier === 'string')
    .map((entry) => [entry.scheme.trim().toLowerCase(), entry.identifier.trim()])
    .filter(([scheme, identifier]) => scheme !== '' && identifier !== '')
    .sort(([leftScheme, leftIdentifier], [rightScheme, rightIdentifier]) => (
      leftScheme.localeCompare(rightScheme) || leftIdentifier.localeCompare(rightIdentifier)
    ));
  const normalized = {};
  for (const [scheme, identifier] of entries) {
    if (!Object.hasOwn(normalized, scheme)) normalized[scheme] = identifier;
  }
  return normalized;
}

function photonAddressMatch(payload, address) {
  const zip = address.match(/\b\d{5}(?:-\d{4})?\b/)?.[0]?.slice(0, 5) || '';
  const state = address.match(/\b([A-Za-z]{2})\s+\d{5}(?:-\d{4})?\b/)?.[1]
    || payload?.features?.[0]?.properties?.state
    || '';
  const feature = (Array.isArray(payload?.features) ? payload.features : []).find((candidate) => {
    const properties = candidate?.properties || {};
    const coordinates = candidate?.geometry?.coordinates;
    return String(properties.countrycode || '').toUpperCase() === 'US'
      && String(properties.postcode || '').slice(0, 5) === zip
      && Array.isArray(coordinates)
      && coordinates.length >= 2
      && coordinates.every(Number.isFinite);
  });
  if (!feature) return null;
  return {
    coordinates: { x: feature.geometry.coordinates[0], y: feature.geometry.coordinates[1] },
    addressComponents: {
      city: feature.properties.city || feature.properties.locality || '',
      state,
      zip,
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
  evidenceService,
} = {}) {
  const officialEvidence = evidenceService || createOfficialEvidenceService({
    openStatesEvidence: createOpenStatesEvidenceService({ fetchImpl, apiKey, timeoutMs }),
    houseClerkEvidence: createHouseClerkEvidenceService({ fetchImpl, timeoutMs }),
  });

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

  function keyForRequest({ openStatesApiKey = '' } = {}) {
    return String(openStatesApiKey).trim() || apiKey;
  }

  async function lookup({ address } = {}, context = {}) {
    const requestApiKey = keyForRequest(context);
    if (!requestApiKey) throw configurationError();
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
    let matches;
    try {
      const censusBody = await readJson(await request(censusUrl));
      matches = censusBody?.result?.addressMatches;
    } catch (error) {
      if (!(error instanceof DomainError) || error.code !== 'UPSTREAM_SERVICE_UNAVAILABLE') throw error;
      const photonUrl = new URL(PHOTON_URL);
      photonUrl.searchParams.set('q', address.trim());
      photonUrl.searchParams.set('countrycode', 'us');
      photonUrl.searchParams.set('layer', 'house');
      photonUrl.searchParams.set('limit', '3');
      photonUrl.searchParams.set('lang', 'en');
      const photonBody = await readJson(await request(photonUrl, {
        headers: { accept: 'application/geo+json, application/json' },
      }));
      const fallbackMatch = photonAddressMatch(photonBody, address);
      if (!fallbackMatch) throw error;
      matches = [fallbackMatch];
    }
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
      headers: { 'X-API-KEY': requestApiKey },
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

  async function getOfficial(id, context = {}) {
    const requestApiKey = keyForRequest(context);
    if (!requestApiKey) throw configurationError();
    if (typeof id !== 'string' || !id.startsWith('ocd-person/')) {
      throw new DomainError('OFFICIAL_NOT_FOUND', 'No live official matches that identifier.', 404);
    }

    const openStatesUrl = new URL('/people', OPEN_STATES_URL);
    openStatesUrl.searchParams.set('id', id);
    openStatesUrl.searchParams.append('include', 'links');
    openStatesUrl.searchParams.append('include', 'offices');
    openStatesUrl.searchParams.append('include', 'other_identifiers');
    const peopleBody = await readJson(await request(openStatesUrl, {
      headers: { 'X-API-KEY': requestApiKey },
    }));
    const person = peopleBody?.results?.[0];
    if (!person) throw new DomainError('OFFICIAL_NOT_FOUND', 'No live official matches that identifier.', 404);
    const profile = completePerson(person);
    try {
      const evidence = await officialEvidence.getEvidenceForOfficial({
        id: person.id,
        jurisdictionId: person.jurisdiction?.id || '',
        roleClassification: person.current_role?.org_classification || '',
        otherIdentifiers: normalizeOtherIdentifiers(person.other_identifiers),
      }, { openStatesApiKey: requestApiKey });
      return { ...profile, ...evidence };
    } catch {
      return {
        ...profile,
        issueRecords: [],
        evidenceStatus: { ...EVIDENCE_UNAVAILABLE_STATUS },
      };
    }
  }

  return { lookup, getOfficial };
}
