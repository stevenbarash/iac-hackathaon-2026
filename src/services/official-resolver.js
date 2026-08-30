import { DomainError, getOfficialById, lookupOfficials } from '../domain/officials.js';
import { createLiveOfficialService } from './live-officials.js';

export function createOfficialResolver({
  liveService = createLiveOfficialService(),
  demoLookup = lookupOfficials,
  demoGetOfficial = getOfficialById,
} = {}) {
  async function lookup(input = {}, context = {}) {
    const { mode = 'live', ...lookupInput } = input;
    if (mode === 'demo') return demoLookup(lookupInput);
    if (mode === 'live') return liveService.lookup(lookupInput, context);
    throw new DomainError('INVALID_LOOKUP_MODE', 'Lookup mode must be live or demo.', 400);
  }

  async function getOfficial(id, context = {}) {
    if (typeof id === 'string' && id.startsWith('ocd-person/')) {
      return liveService.getOfficial(id, context);
    }
    return {
      ...demoGetOfficial(id),
      dataMode: 'illustrative_demo',
      evidenceStatus: {
        status: 'illustrative_demo',
        message: 'Every identity and issue record in this profile is fictional illustrative demo data.',
      },
    };
  }

  return { lookup, getOfficial };
}
