import { HOUSE_MEASURES } from '../data/issue-legislation.js';

const CLERK_BASE_URL = 'https://clerk.house.gov';
const DEFAULT_TIMEOUT_MS = 10_000;
const CLERK_PUBLISHER = 'Office of the Clerk, U.S. House of Representatives';
const CLERK_ROLLCALL_DOCTYPE = '<!DOCTYPE rollcall-vote PUBLIC "-//US Congress//DTDs/vote v1.0 20031119 //EN" "../vote.dtd">';

function safeCollection(value) {
  return Array.isArray(value) ? value : [];
}

function boundedTimeout(timeoutMs) {
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS;
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim() !== '';
}

function malformedXml() {
  return new Error('Malformed House Clerk XML.');
}

function localName(name) {
  return name.split(':').at(-1);
}

function decodeXmlEntities(value) {
  if (/&(?!#x[0-9a-fA-F]+;|#\d+;|amp;|lt;|gt;|quot;|apos;)/.test(value)) throw malformedXml();
  const decoded = value.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (_, entity) => {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    if (Object.hasOwn(named, entity)) return named[entity];
    const codePoint = entity.startsWith('#x')
      ? Number.parseInt(entity.slice(2), 16)
      : Number.parseInt(entity.slice(1), 10);
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff
      || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
      throw malformedXml();
    }
    return String.fromCodePoint(codePoint);
  });
  return decoded;
}

function normalizeText(value) {
  return decodeXmlEntities(value).replace(/\s+/g, ' ').trim();
}

function findTagEnd(xml, start) {
  let quote = '';
  for (let index = start; index < xml.length; index += 1) {
    const character = xml[index];
    if (quote) {
      if (character === quote) quote = '';
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return index;
    }
  }
  throw malformedXml();
}

function parseAttributes(rawAttributes) {
  const attributes = new Map();
  let index = 0;
  while (index < rawAttributes.length) {
    while (/\s/.test(rawAttributes[index] || '')) index += 1;
    if (index === rawAttributes.length) break;
    const nameMatch = /^[A-Za-z_][\w:.-]*/.exec(rawAttributes.slice(index));
    if (!nameMatch) throw malformedXml();
    const name = nameMatch[0];
    index += name.length;
    while (/\s/.test(rawAttributes[index] || '')) index += 1;
    if (rawAttributes[index] !== '=') throw malformedXml();
    index += 1;
    while (/\s/.test(rawAttributes[index] || '')) index += 1;
    const quote = rawAttributes[index];
    if (quote !== '"' && quote !== "'") throw malformedXml();
    index += 1;
    const end = rawAttributes.indexOf(quote, index);
    if (end === -1) throw malformedXml();
    if (attributes.has(name)) throw malformedXml();
    attributes.set(name, decodeXmlEntities(rawAttributes.slice(index, end)));
    index = end + 1;
  }
  return attributes;
}

function parseXmlTree(xml) {
  if (!isNonEmptyString(xml) || /<!ENTITY/i.test(xml)) throw malformedXml();

  const roots = [];
  const stack = [];
  let sawDoctype = false;
  let cursor = 0;
  while (cursor < xml.length) {
    const nextTag = xml.indexOf('<', cursor);
    if (nextTag === -1) {
      const text = xml.slice(cursor);
      decodeXmlEntities(text);
      if (stack.length === 0 && text.trim() !== '') throw malformedXml();
      if (stack.length > 0) stack.at(-1).text += text;
      break;
    }
    const text = xml.slice(cursor, nextTag);
    decodeXmlEntities(text);
    if (stack.length === 0 && text.trim() !== '') throw malformedXml();
    if (stack.length > 0) stack.at(-1).text += text;

    if (xml.startsWith('<!--', nextTag)) {
      const end = xml.indexOf('-->', nextTag + 4);
      if (end === -1) throw malformedXml();
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith('<?', nextTag)) {
      const end = xml.indexOf('?>', nextTag + 2);
      if (end === -1) throw malformedXml();
      cursor = end + 2;
      continue;
    }
    if (xml.startsWith('<![CDATA[', nextTag)) {
      const end = xml.indexOf(']]>', nextTag + 9);
      if (end === -1 || stack.length === 0) throw malformedXml();
      stack.at(-1).text += xml.slice(nextTag + 9, end);
      cursor = end + 3;
      continue;
    }
    if (xml.startsWith('<!DOCTYPE', nextTag)) {
      if (stack.length !== 0 || roots.length !== 0 || sawDoctype) throw malformedXml();
      const end = findTagEnd(xml, nextTag + 2);
      const doctype = xml.slice(nextTag, end + 1);
      if (doctype !== CLERK_ROLLCALL_DOCTYPE) {
        throw malformedXml();
      }
      sawDoctype = true;
      cursor = end + 1;
      continue;
    }
    if (xml.startsWith('<!', nextTag)) throw malformedXml();

    const end = findTagEnd(xml, nextTag + 1);
    const tag = xml.slice(nextTag, end + 1);
    if (tag.startsWith('</')) {
      const closing = /^<\/\s*([A-Za-z_][\w:.-]*)\s*>$/.exec(tag);
      if (!closing || stack.length === 0 || stack.at(-1).name !== closing[1]) throw malformedXml();
      const node = stack.pop();
      if (stack.length > 0) stack.at(-1).children.push(node);
      else roots.push(node);
    } else {
      const opening = /^<\s*([A-Za-z_][\w:.-]*)([\s\S]*?)>$/.exec(tag);
      if (!opening) throw malformedXml();
      let rawAttributes = opening[2];
      const selfClosing = /\/$/.test(rawAttributes.trim());
      if (selfClosing) rawAttributes = rawAttributes.replace(/\/\s*$/, '');
      const node = {
        name: opening[1],
        localName: localName(opening[1]),
        attributes: parseAttributes(rawAttributes),
        children: [],
        text: '',
      };
      if (selfClosing) {
        if (stack.length > 0) stack.at(-1).children.push(node);
        else roots.push(node);
      } else {
        stack.push(node);
      }
    }
    cursor = end + 1;
  }
  if (stack.length !== 0 || roots.length !== 1 || roots[0].localName !== 'rollcall-vote') throw malformedXml();
  return roots[0];
}

function singleChild(node, expectedName) {
  const matches = node.children.filter((child) => child.localName === expectedName);
  if (matches.length !== 1) throw malformedXml();
  return matches[0];
}

function singleTextChild(node, expectedName) {
  const child = singleChild(node, expectedName);
  if (child.children.length !== 0) throw malformedXml();
  const value = normalizeText(child.text);
  if (!value) throw malformedXml();
  return value;
}

function positiveInteger(value) {
  if (!/^\d+$/.test(value)) throw malformedXml();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw malformedXml();
  return parsed;
}

function ordinalInteger(value) {
  const match = /^(\d+)(st|nd|rd|th)?$/.exec(value);
  if (!match) throw malformedXml();
  const parsed = positiveInteger(match[1]);
  if (match[2]) {
    const finalTwoDigits = parsed % 100;
    const expectedSuffix = finalTwoDigits >= 11 && finalTwoDigits <= 13
      ? 'th'
      : ({ 1: 'st', 2: 'nd', 3: 'rd' }[parsed % 10] || 'th');
    if (match[2] !== expectedSuffix) throw malformedXml();
  }
  return parsed;
}

function actionDateToIso(value) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(value);
  if (!match) throw malformedXml();
  const months = {
    Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
    Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
  };
  const month = months[match[2]];
  if (!month) throw malformedXml();
  const isoDate = `${match[3]}-${month}-${match[1].padStart(2, '0')}`;
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || parsed.toISOString().slice(0, 10) !== isoDate) throw malformedXml();
  return isoDate;
}

export function parseHouseRollCallXml(xml) {
  const root = parseXmlTree(xml);
  const metadata = singleChild(root, 'vote-metadata');
  const voteData = singleChild(root, 'vote-data');
  const rollNumber = positiveInteger(singleTextChild(metadata, 'rollcall-num'));
  const congress = positiveInteger(singleTextChild(metadata, 'congress'));
  const session = ordinalInteger(singleTextChild(metadata, 'session'));
  const legislationIdentifier = singleTextChild(metadata, 'legis-num');
  const description = singleTextChild(metadata, 'vote-desc');
  const question = singleTextChild(metadata, 'vote-question');
  const result = singleTextChild(metadata, 'vote-result');
  const actionDate = singleTextChild(metadata, 'action-date');
  actionDateToIso(actionDate);

  const votes = new Map();
  for (const recordedVote of voteData.children.filter((child) => child.localName === 'recorded-vote')) {
    const legislator = singleChild(recordedVote, 'legislator');
    if (legislator.children.length !== 0) throw malformedXml();
    const bioguideId = legislator.attributes.get('name-id');
    const option = singleTextChild(recordedVote, 'vote');
    if (!isNonEmptyString(bioguideId) || votes.has(bioguideId)) throw malformedXml();
    votes.set(bioguideId, option);
  }
  if (votes.size === 0) throw malformedXml();

  return {
    congress,
    session,
    rollNumber,
    legislationIdentifier,
    description,
    question,
    result,
    actionDate,
    votes,
  };
}

function clerkUrl(measure) {
  const year = Number(measure?.year);
  const rollNumber = Number(measure?.rollNumber);
  if (!Number.isSafeInteger(year) || !Number.isSafeInteger(rollNumber) || year < 1 || rollNumber < 1) {
    throw new Error('Invalid House Clerk measure locator.');
  }
  return new URL(`/evs/${year}/roll${String(rollNumber).padStart(3, '0')}.xml`, CLERK_BASE_URL);
}

function isTransientStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function validatesMeasure(roll, measure) {
  return roll.rollNumber === Number(measure?.rollNumber)
    && roll.congress === Number(measure?.congress)
    && roll.session === Number(measure?.session);
}

function recordsForRoll({ roll, measure, bioguideId, retrievedAt, sourceUrl }) {
  const option = roll.votes.get(bioguideId);
  if (!option) return [];
  const finding = `Voted ${option} on ${roll.question}.`;
  return safeCollection(measure?.topics).map((topic) => ({
    topic,
    position: 'related_action',
    actionType: 'roll_call_vote',
    finding,
    date: actionDateToIso(roll.actionDate),
    measure: {
      jurisdiction: 'United States',
      session: String(roll.congress),
      identifier: roll.legislationIdentifier,
      title: roll.description,
    },
    action: {
      option,
      motion: roll.question,
      result: roll.result,
    },
    sources: [{ publisher: CLERK_PUBLISHER, url: sourceUrl }],
    verification: {
      status: 'live_official_source',
      matchMethod: 'bioguide_id',
      retrievedAt,
    },
  }));
}

export function createHouseClerkEvidenceService({
  fetchImpl = fetch,
  measures = HOUSE_MEASURES,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  now = () => new Date().toISOString(),
} = {}) {
  const requestTimeoutMs = boundedTimeout(timeoutMs);

  async function fetchRoll(measure) {
    const url = clerkUrl(measure);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      let response;
      try {
        response = await fetchImpl(url, { signal: AbortSignal.timeout(requestTimeoutMs) });
      } catch (error) {
        if (attempt === 0) continue;
        throw error;
      }
      if (!response?.ok) {
        if (attempt === 0 && isTransientStatus(response?.status)) continue;
        throw new Error('House Clerk roll-call request failed.');
      }
      const roll = parseHouseRollCallXml(await response.text());
      if (!validatesMeasure(roll, measure)) throw new Error('House Clerk roll-call document did not match its locator.');
      return { roll, sourceUrl: url.href };
    }
    throw new Error('House Clerk roll-call request failed.');
  }

  async function getEvidenceForOfficial({ bioguideId } = {}) {
    if (!isNonEmptyString(bioguideId)) {
      return {
        records: [],
        reviewedMeasureCount: 0,
        successfulMeasureCount: 0,
        failedMeasureCount: 0,
      };
    }
    const exactBioguideId = bioguideId;
    const results = await Promise.all(safeCollection(measures).map(async (measure) => {
      try {
        const { roll, sourceUrl } = await fetchRoll(measure);
        return {
          success: true,
          records: recordsForRoll({
            roll,
            measure,
            bioguideId: exactBioguideId,
            retrievedAt: now(),
            sourceUrl,
          }),
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
