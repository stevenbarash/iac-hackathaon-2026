import { STATE_MEASURES } from '../data/issue-legislation.js';

const OPEN_STATES_URL = 'https://v3.openstates.org';
const DEFAULT_TIMEOUT_MS = 10_000;

function safeCollection(value) {
  return Array.isArray(value) ? value : [];
}

function isOcdPersonId(value) {
  return typeof value === 'string' && /^ocd-person\/\S+$/.test(value);
}

function isExactOcdPersonMatch(candidateId, officialId) {
  return typeof candidateId === 'string' && candidateId === officialId;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function canonicalIdentifier(value) {
  if (!isNonEmptyString(value)) return '';
  return value.normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizedName(value) {
  return isNonEmptyString(value) ? value.trim().toLowerCase().replace(/\s+/g, ' ') : '';
}

function validatesBillIdentityAndShape(bill, measure) {
  if (!bill || typeof bill !== 'object' || Array.isArray(bill)) return false;
  if (!/^ocd-bill\/\S+$/.test(bill.id || '')
    || !isNonEmptyString(bill.title)
    || !isNonEmptyString(bill.session)
    || !isNonEmptyString(bill?.jurisdiction?.id)
    || !isNonEmptyString(bill?.jurisdiction?.name)) {
    return false;
  }
  if (bill.session.trim() !== String(measure?.session || '').trim()) return false;
  const billIdentifier = canonicalIdentifier(bill.identifier);
  const lookupIdentifier = canonicalIdentifier(measure?.lookupId);
  if (!billIdentifier || !lookupIdentifier || billIdentifier !== lookupIdentifier) return false;
  if (normalizedName(bill.jurisdiction.name) !== normalizedName(measure?.jurisdiction)) return false;
  if (normalizedName(measure?.jurisdiction) === 'new york'
    && bill.jurisdiction.id.toLowerCase() !== 'ocd-jurisdiction/country:us/state:ny/government') {
    return false;
  }
  return ['sponsorships', 'votes', 'actions', 'sources'].every((field) => Array.isArray(bill[field]));
}

function dateOnly(value) {
  if (typeof value !== 'string') return '';
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : '';
}

function officialSource(source) {
  if (!source || !isNonEmptyString(source.url)) return null;
  let url;
  try {
    url = new URL(source.url.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  return {
    publisher: isNonEmptyString(source.note) ? source.note.trim() : 'Open States',
    url: url.href,
  };
}

function sourcesFrom(value) {
  return safeCollection(value?.sources).map(officialSource).filter(Boolean);
}

function sourcesForVote(bill, vote) {
  const voteSources = sourcesFrom(vote);
  return voteSources.length > 0 ? voteSources : sourcesFrom(bill);
}

function billMeasure(bill) {
  return {
    jurisdiction: typeof bill?.jurisdiction?.name === 'string' ? bill.jurisdiction.name : '',
    session: typeof bill?.session === 'string' ? bill.session : '',
    identifier: typeof bill?.identifier === 'string' ? bill.identifier : '',
    title: typeof bill?.title === 'string' ? bill.title : '',
  };
}

function verification(retrievedAt) {
  return {
    status: 'live_official_source',
    matchMethod: 'ocd_person_id',
    retrievedAt,
  };
}

function sponsorshipAction(sponsorship) {
  const classification = typeof sponsorship?.classification === 'string'
    ? sponsorship.classification.trim()
    : '';
  if (classification.toLowerCase() === 'cosponsor') {
    return { actionType: 'cosponsorship', label: 'Cosponsor', classification };
  }
  if (sponsorship?.primary) {
    return { actionType: 'sponsorship', label: 'Primary sponsor', classification };
  }
  return { actionType: 'sponsorship', label: classification || 'Sponsor', classification };
}

function recordsForSponsorship({ bill, measure, sponsorship, retrievedAt, recordSources }) {
  const action = sponsorshipAction(sponsorship);
  const liveMeasure = billMeasure(bill);
  const finding = `${action.label} of ${liveMeasure.identifier}: ${liveMeasure.title}.`;

  return safeCollection(measure?.topics).map((topic) => ({
    topic,
    position: 'related_action',
    actionType: action.actionType,
    finding,
    measure: liveMeasure,
    action: { classification: action.classification },
    sources: recordSources,
    verification: verification(retrievedAt),
  }));
}

function recordsForVote({ bill, measure, vote, individualVote, retrievedAt, recordSources }) {
  const liveMeasure = billMeasure(bill);
  const option = typeof individualVote?.option === 'string' ? individualVote.option : '';
  const motion = typeof vote?.motion_text === 'string' ? vote.motion_text : '';
  const result = typeof vote?.result === 'string' ? vote.result : '';
  const finding = `Voted ${option} on ${motion}.`;
  const date = dateOnly(vote?.start_date);

  return safeCollection(measure?.topics).map((topic) => ({
    topic,
    position: 'related_action',
    actionType: 'roll_call_vote',
    finding,
    ...(date ? { date } : {}),
    measure: liveMeasure,
    action: { option, motion, result },
    sources: recordSources,
    verification: verification(retrievedAt),
  }));
}

function normalizeRecords({ bill, measure, officialId, retrievedAt }) {
  const records = [];
  let hasUncitedMatchedAction = false;
  for (const sponsorship of safeCollection(bill?.sponsorships)) {
    if (isExactOcdPersonMatch(sponsorship?.person?.id, officialId)) {
      const recordSources = sourcesFrom(bill);
      if (recordSources.length === 0) {
        hasUncitedMatchedAction = true;
        continue;
      }
      records.push(...recordsForSponsorship({ bill, measure, sponsorship, retrievedAt, recordSources }));
    }
  }
  for (const vote of safeCollection(bill?.votes)) {
    for (const individualVote of safeCollection(vote?.votes)) {
      if (isExactOcdPersonMatch(individualVote?.voter?.id, officialId)) {
        const recordSources = sourcesForVote(bill, vote);
        if (recordSources.length === 0) {
          hasUncitedMatchedAction = true;
          continue;
        }
        records.push(...recordsForVote({
          bill,
          measure,
          vote,
          individualVote,
          retrievedAt,
          recordSources,
        }));
      }
    }
  }
  if (hasUncitedMatchedAction) throw new Error('Matched Open States action has no usable official source.');
  return records;
}

function isTransientStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function boundedTimeout(timeoutMs) {
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
}

export function createOpenStatesEvidenceService({
  fetchImpl = fetch,
  apiKey = process.env.OPENSTATES_API_KEY || '',
  measures = STATE_MEASURES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = () => new Date().toISOString(),
} = {}) {
  const requestTimeoutMs = boundedTimeout(timeoutMs);

  async function fetchBill(measure, requestApiKey) {
    const url = new URL(
      `/bills/${encodeURIComponent(measure.jurisdiction)}/${encodeURIComponent(measure.session)}/${encodeURIComponent(measure.lookupId)}`,
      OPEN_STATES_URL,
    );
    for (const include of ['sponsorships', 'votes', 'actions', 'sources']) {
      url.searchParams.append('include', include);
    }

    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response;
      try {
        response = await fetchImpl(url, {
          headers: { 'X-API-KEY': requestApiKey },
          signal: AbortSignal.timeout(requestTimeoutMs),
        });
      } catch (error) {
        if (attempt === 0) continue;
        throw error;
      }
      if (!response?.ok) {
        if (attempt === 0 && isTransientStatus(response?.status)) continue;
        throw new Error('Open States bill request failed.');
      }
      const bill = await response.json();
      if (!validatesBillIdentityAndShape(bill, measure)) {
        throw new Error('Open States bill response did not match its locator.');
      }
      return bill;
    }
    throw new Error('Open States bill request failed.');
  }

  async function getEvidenceForOfficial({ id } = {}, { openStatesApiKey = '' } = {}) {
    if (!isOcdPersonId(id)) {
      return {
        records: [],
        reviewedMeasureCount: 0,
        successfulMeasureCount: 0,
        failedMeasureCount: 0,
      };
    }
    const requestApiKey = String(openStatesApiKey).trim() || apiKey;
    const results = await Promise.all(safeCollection(measures).map(async (measure) => {
      try {
        const bill = await fetchBill(measure, requestApiKey);
        return {
          success: true,
          records: normalizeRecords({ bill, measure, officialId: id, retrievedAt: now() }),
        };
      } catch {
        return { success: false, records: [] };
      }
    }));

    return {
      records: results.flatMap((result) => result.records),
      reviewedMeasureCount: results.length,
      successfulMeasureCount: results.filter((result) => result.success).length,
      failedMeasureCount: results.filter((result) => !result.success).length,
    };
  }

  return { getEvidenceForOfficial };
}
