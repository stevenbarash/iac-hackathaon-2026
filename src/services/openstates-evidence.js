import { STATE_MEASURES } from '../data/issue-legislation.js';

const OPEN_STATES_URL = 'https://v3.openstates.org';
const DEFAULT_TIMEOUT_MS = 10_000;

function safeCollection(value) {
  return Array.isArray(value) ? value : [];
}

function dateOnly(value) {
  if (typeof value !== 'string') return '';
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : '';
}

function measureDate(bill) {
  return dateOnly(bill?.latest_action_date)
    || safeCollection(bill?.actions).map((action) => dateOnly(action?.date)).find(Boolean)
    || '';
}

function sourcesFrom(bill) {
  return safeCollection(bill?.sources)
    .filter((source) => source && typeof source.url === 'string' && source.url.trim() !== '')
    .map((source) => ({
      publisher: typeof source.note === 'string' && source.note.trim() ? source.note.trim() : 'Open States',
      url: source.url.trim(),
    }));
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

function recordsForSponsorship({ bill, measure, sponsorship, retrievedAt }) {
  const action = sponsorshipAction(sponsorship);
  const liveMeasure = billMeasure(bill);
  const recordSources = sourcesFrom(bill);
  const finding = `${action.label} of ${liveMeasure.identifier}: ${liveMeasure.title}.`;

  return safeCollection(measure?.topics).map((topic) => ({
    topic,
    position: 'related_action',
    actionType: action.actionType,
    finding,
    date: measureDate(bill),
    measure: liveMeasure,
    action: { classification: action.classification },
    sources: recordSources,
    verification: verification(retrievedAt),
  }));
}

function recordsForVote({ bill, measure, vote, individualVote, retrievedAt }) {
  const liveMeasure = billMeasure(bill);
  const option = typeof individualVote?.option === 'string' ? individualVote.option : '';
  const motion = typeof vote?.motion_text === 'string' ? vote.motion_text : '';
  const result = typeof vote?.result === 'string' ? vote.result : '';
  const finding = `Voted ${option} on ${motion}.`;

  return safeCollection(measure?.topics).map((topic) => ({
    topic,
    position: 'related_action',
    actionType: 'roll_call_vote',
    finding,
    date: dateOnly(vote?.start_date) || measureDate(bill),
    measure: liveMeasure,
    action: { option, motion, result },
    sources: sourcesFrom(bill),
    verification: verification(retrievedAt),
  }));
}

function normalizeRecords({ bill, measure, officialId, retrievedAt }) {
  const records = [];
  for (const sponsorship of safeCollection(bill?.sponsorships)) {
    if (sponsorship?.person?.id === officialId) {
      records.push(...recordsForSponsorship({ bill, measure, sponsorship, retrievedAt }));
    }
  }
  for (const vote of safeCollection(bill?.votes)) {
    for (const individualVote of safeCollection(vote?.votes)) {
      if (individualVote?.voter?.id === officialId) {
        records.push(...recordsForVote({ bill, measure, vote, individualVote, retrievedAt }));
      }
    }
  }
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

  async function fetchBill(measure) {
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
          headers: { 'X-API-KEY': apiKey },
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
      return await response.json();
    }
    throw new Error('Open States bill request failed.');
  }

  async function getEvidenceForOfficial({ id } = {}) {
    const results = await Promise.all(safeCollection(measures).map(async (measure) => {
      try {
        const bill = await fetchBill(measure);
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
