import { randomUUID } from 'node:crypto';

import { OFFICIALS } from '../data/officials.js';

export const TOPICS = Object.freeze([
  'ihra',
  'bds_policy',
  'israel_legislation',
  'antisemitism',
  'jewish_community',
]);

export const POSITIONS = Object.freeze([
  'supports',
  'opposes',
  'mixed',
  'related_action',
  'no_documented_position',
]);

const DEMO_ADDRESS = 'Brooklyn, NY 11201';
const PILOT_LOCATION = Object.freeze({
  city: 'Brooklyn',
  state: 'NY',
  districts: Object.freeze([
    'New York Congressional District 10 (illustrative)',
    'New York State Senate District 26 (illustrative)',
    'New York State Assembly District 52 (illustrative)',
  ]),
});

export class DomainError extends Error {
  constructor(code, message, status, suggestions = []) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.status = status;
    this.suggestions = [...suggestions];
  }
}

function clone(value) {
  return structuredClone(value);
}

function validateAddress(address) {
  if (typeof address !== 'string' || address.trim() === '') {
    throw new DomainError('ADDRESS_REQUIRED', 'Enter an address to find officials in the pilot area.', 400);
  }

  const normalized = address.trim();
  const hasPilotZip = /\b11201\b/.test(normalized);
  const hasBrooklynNewYork = /\bbrooklyn\s*,?\s*(?:ny|new\s+york)\b/i.test(normalized);
  if (!hasPilotZip && !hasBrooklynNewYork) {
    throw new DomainError(
      'OUTSIDE_PILOT_COVERAGE',
      'This illustrative pilot currently supports Brooklyn addresses or ZIP code 11201.',
      422,
      [DEMO_ADDRESS],
    );
  }
}

function validateTopics(topics) {
  if (topics === undefined) {
    return undefined;
  }

  if (!Array.isArray(topics) || topics.some((topic) => typeof topic !== 'string' || !TOPICS.includes(topic))) {
    throw new DomainError(
      'INVALID_TOPIC',
      `Topics must be drawn from: ${TOPICS.join(', ')}.`,
      400,
    );
  }

  return new Set(topics);
}

function compactOfficial(official, requestedTopics) {
  const issueRecords = requestedTopics
    ? official.issueRecords.filter((record) => requestedTopics.has(record.topic))
    : official.issueRecords;

  return {
    id: official.id,
    name: official.name,
    office: official.office,
    district: official.district,
    documentedRecordCount: issueRecords.length,
  };
}

export function lookupOfficials({ address, topics, locale } = {}) {
  validateAddress(address);
  const requestedTopics = validateTopics(topics);
  if (locale !== undefined && typeof locale !== 'string') {
    throw new DomainError('INVALID_LOCALE', 'Locale must be a string when supplied.', 400);
  }

  return {
    requestId: randomUUID(),
    coverage: {
      status: 'illustrative_pilot',
      message: 'Results are illustrative New York pilot data, not political facts about real people.',
    },
    location: clone(PILOT_LOCATION),
    officials: OFFICIALS.map((official) => compactOfficial(official, requestedTopics)),
  };
}

export function getOfficialById(id) {
  const official = OFFICIALS.find((candidate) => candidate.id === id);
  if (!official) {
    throw new DomainError('OFFICIAL_NOT_FOUND', 'No official matches that identifier.', 404);
  }

  return clone(official);
}
