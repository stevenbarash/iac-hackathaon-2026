import { CATALOG_VERSION, HOUSE_MEASURES } from '../data/issue-legislation.js';

const MAX_CACHE_TTL_MS = 600_000;

const NOT_RESEARCHED_STATUS = Object.freeze({
  status: 'not_researched',
  message: 'Israel and Jewish-community issue evidence has not been researched for this live official yet.',
});

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function timeValue(now) {
  const value = now();
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function boundedCacheTtl(cacheTtlMs) {
  if (!Number.isFinite(cacheTtlMs) || cacheTtlMs < 0) return MAX_CACHE_TTL_MS;
  return Math.min(cacheTtlMs, MAX_CACHE_TTL_MS);
}

function sourceFailure() {
  return {
    records: [],
    reviewedMeasureCount: 1,
    successfulMeasureCount: 0,
    failedMeasureCount: 1,
  };
}

function normalizeSourceResult(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.records)) return sourceFailure();
  const successfulMeasureCount = safeCount(value.successfulMeasureCount);
  const failedMeasureCount = safeCount(value.failedMeasureCount);
  const reviewedMeasureCount = safeCount(value.reviewedMeasureCount);
  if (reviewedMeasureCount !== successfulMeasureCount + failedMeasureCount) return sourceFailure();
  return {
    records: value.records,
    reviewedMeasureCount,
    successfulMeasureCount,
    failedMeasureCount,
  };
}

function coverageStatus(result) {
  const {
    reviewedMeasureCount,
    successfulMeasureCount,
    failedMeasureCount,
  } = result;
  let status;
  let message;
  if (successfulMeasureCount === 0 && failedMeasureCount > 0) {
    status = 'temporarily_unavailable';
    message = 'The applicable official-source evidence could not be retrieved. No issue position has been inferred.';
  } else if (failedMeasureCount > 0) {
    status = 'partially_available';
    message = 'Some applicable catalog measures were researched, but other official-source records are temporarily unavailable.';
  } else {
    status = 'researched';
    message = result.records.length === 0
      ? 'Every applicable catalog measure was researched, with no matching actions found. This does not imply opposition or neutrality.'
      : 'Every applicable catalog measure was researched; returned actions are literal official-source records.';
  }
  return {
    status,
    catalogVersion: CATALOG_VERSION,
    reviewedMeasureCount,
    successfulMeasureCount,
    failedMeasureCount,
    message,
  };
}

function isNewYorkStateJurisdiction(jurisdictionId) {
  return typeof jurisdictionId === 'string'
    && jurisdictionId.toLowerCase() === 'ocd-jurisdiction/country:us/state:ny/government';
}

function isFederalHouseRole(jurisdictionId, roleClassification) {
  return typeof jurisdictionId === 'string'
    && jurisdictionId.toLowerCase() === 'ocd-jurisdiction/country:us/government'
    && typeof roleClassification === 'string'
    && roleClassification.toLowerCase() === 'lower';
}

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== 'object') return value;
  const normalized = {};
  for (const key of Object.keys(value).sort()) normalized[key] = canonicalValue(value[key]);
  return normalized;
}

function recordTieKey(record) {
  return JSON.stringify(canonicalValue(record));
}

function sortedRecordCopy(records) {
  return [...records].sort((left, right) => {
    const leftDate = typeof left?.date === 'string' ? left.date : '';
    const rightDate = typeof right?.date === 'string' ? right.date : '';
    return rightDate.localeCompare(leftDate) || recordTieKey(left).localeCompare(recordTieKey(right));
  });
}

function missingHouseIdentityCoverage() {
  const reviewedMeasureCount = HOUSE_MEASURES.length;
  return {
    issueRecords: [],
    evidenceStatus: {
      status: 'temporarily_unavailable',
      catalogVersion: CATALOG_VERSION,
      reviewedMeasureCount,
      successfulMeasureCount: 0,
      failedMeasureCount: reviewedMeasureCount,
      message: 'The House catalog could not be matched because this profile has no exact Bioguide identity. No name-based match or issue position has been inferred.',
    },
  };
}

export function createOfficialEvidenceService({
  openStatesEvidence,
  houseClerkEvidence,
  cacheTtlMs = MAX_CACHE_TTL_MS,
  now = Date.now,
} = {}) {
  const ttlMs = boundedCacheTtl(cacheTtlMs);
  const cache = new Map();

  async function getEvidenceForOfficial({
    id,
    jurisdictionId,
    roleClassification,
    otherIdentifiers = {},
  } = {}) {
    let source;
    let sourceInput;
    let cacheKey;
    if (isNewYorkStateJurisdiction(jurisdictionId) && typeof id === 'string' && id !== '') {
      source = openStatesEvidence;
      sourceInput = { id };
      cacheKey = `openstates:${id}`;
    } else if (isFederalHouseRole(jurisdictionId, roleClassification)) {
      if (typeof otherIdentifiers?.bioguide !== 'string' || otherIdentifiers.bioguide.trim() === '') {
        return missingHouseIdentityCoverage();
      }
      source = houseClerkEvidence;
      sourceInput = { bioguideId: otherIdentifiers.bioguide };
      cacheKey = `house:${otherIdentifiers.bioguide}`;
    } else {
      return { issueRecords: [], evidenceStatus: { ...NOT_RESEARCHED_STATUS } };
    }

    const requestedAt = timeValue(now);
    const cached = cache.get(cacheKey);
    if (cached && requestedAt - cached.storedAt < ttlMs) return cached.value;
    if (cached) cache.delete(cacheKey);

    let result;
    try {
      result = normalizeSourceResult(await source?.getEvidenceForOfficial(sourceInput));
    } catch {
      result = sourceFailure();
    }
    const value = {
      issueRecords: sortedRecordCopy(result.records),
      evidenceStatus: coverageStatus(result),
    };
    const completeSuccess = result.reviewedMeasureCount > 0
      && result.failedMeasureCount === 0
      && result.successfulMeasureCount === result.reviewedMeasureCount;
    if (ttlMs > 0 && completeSuccess) cache.set(cacheKey, { storedAt: requestedAt, value });
    return value;
  }

  return { getEvidenceForOfficial };
}
