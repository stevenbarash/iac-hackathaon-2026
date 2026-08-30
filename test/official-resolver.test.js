import assert from 'node:assert/strict';
import test from 'node:test';

import { DomainError } from '../src/domain/officials.js';
import { createOfficialResolver } from '../src/services/official-resolver.js';

const LIVE_LOOKUP = {
  requestId: 'live-request',
  coverage: { status: 'live_identity', message: 'Live identity.' },
  location: { city: 'Brooklyn', state: 'NY', districts: ['Assembly Member District 52'] },
  officials: [],
};

const LIVE_PROFILE = {
  id: 'ocd-person/11111111-2222-3333-4444-555555555555',
  name: 'Taylor Example',
  issueRecords: [],
  dataMode: 'live_identity',
};

test('explicit demo mode preserves the illustrative resolver', async () => {
  let liveCalls = 0;
  const resolver = createOfficialResolver({
    liveService: {
      async lookup() { liveCalls += 1; return LIVE_LOOKUP; },
      async getOfficial() { return LIVE_PROFILE; },
    },
  });

  const result = await resolver.lookup({ address: 'Brooklyn, NY 11201', mode: 'demo' });

  assert.equal(result.coverage.status, 'illustrative_pilot');
  assert.equal(liveCalls, 0);
});

test('lookup defaults to live mode and does not pass mode to the upstream adapter', async () => {
  let received;
  const resolver = createOfficialResolver({
    liveService: {
      async lookup(input) { received = input; return LIVE_LOOKUP; },
      async getOfficial() { return LIVE_PROFILE; },
    },
  });

  const result = await resolver.lookup({ address: '123 Test Street, Brooklyn, NY 11201', topics: ['ihra'], locale: 'en-US' });

  assert.equal(result.coverage.status, 'live_identity');
  assert.deepEqual(received, {
    address: '123 Test Street, Brooklyn, NY 11201',
    topics: ['ihra'],
    locale: 'en-US',
  });
});

test('profile IDs dispatch to demo or live sources without storing address state', async () => {
  const liveIds = [];
  const resolver = createOfficialResolver({
    liveService: {
      async lookup() { return LIVE_LOOKUP; },
      async getOfficial(id) { liveIds.push(id); return LIVE_PROFILE; },
    },
  });

  const demo = await resolver.getOfficial('ny-pilot-rivera-001');
  const live = await resolver.getOfficial(LIVE_PROFILE.id);

  assert.equal(demo.dataMode, 'illustrative_demo');
  assert.equal(live.dataMode, 'live_identity');
  assert.deepEqual(liveIds, [LIVE_PROFILE.id]);
});

test('request context reaches live lookup and profile sources', async () => {
  const received = {};
  const resolver = createOfficialResolver({
    liveService: {
      async lookup(input, context) {
        received.lookup = { input, context };
        return LIVE_LOOKUP;
      },
      async getOfficial(id, context) {
        received.profile = { id, context };
        return LIVE_PROFILE;
      },
    },
  });
  const context = { openStatesApiKey: 'session-user-key' };

  await resolver.lookup({ address: '123 Test Street, Brooklyn, NY 11201' }, context);
  await resolver.getOfficial(LIVE_PROFILE.id, context);

  assert.deepEqual(received.lookup, {
    input: { address: '123 Test Street, Brooklyn, NY 11201' },
    context,
  });
  assert.deepEqual(received.profile, { id: LIVE_PROFILE.id, context });
});

test('unsupported lookup modes return INVALID_LOOKUP_MODE', async () => {
  const resolver = createOfficialResolver({
    liveService: { async lookup() {}, async getOfficial() {} },
  });

  await assert.rejects(
    resolver.lookup({ address: 'Brooklyn, NY 11201', mode: 'invented' }),
    (error) => error instanceof DomainError
      && error.code === 'INVALID_LOOKUP_MODE'
      && error.status === 400,
  );
});
