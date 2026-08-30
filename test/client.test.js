import assert from 'node:assert/strict';
import test from 'node:test';

const SUPPORTED_TOPICS = [
  'ihra',
  'bds_policy',
  'israel_legislation',
  'antisemitism',
  'jewish_community',
];

const PROFILE = {
  id: 'ny-pilot-rivera-001',
  name: 'Avery Rivera',
  office: 'Illustrative U.S. House Representative',
  district: 'New York Congressional District 10 (illustrative)',
  responsibilities: ['Represents the illustrative congressional district.'],
  contact: {
    website: 'https://example.org/officials/avery-rivera',
    email: 'avery.rivera@example.org',
    phone: '+1-212-555-0101',
    officeAddress: 'Illustrative district office, Brooklyn, NY',
  },
  issueRecords: [{
    topic: 'ihra',
    position: 'supports',
    finding: 'Illustrative finding.',
    date: '2026-01-15',
    evidenceType: 'illustrative_resolution',
    source: {
      title: 'Illustrative source',
      url: 'https://example.org/evidence/avery-rivera-ihra',
    },
    verification: {
      status: 'demo_only',
      verifiedAt: '2026-01-16',
      note: 'Illustrative record.',
    },
  }],
  dataMode: 'illustrative_demo',
  evidenceStatus: {
    status: 'illustrative_demo',
    message: 'Every identity and issue record in this profile is fictional illustrative demo data.',
  },
};

const LOOKUP = {
  coverage: { status: 'illustrative_pilot', message: 'Illustrative pilot data.' },
  location: { city: 'Brooklyn', state: 'NY' },
  officials: [{
    id: PROFILE.id,
    name: PROFILE.name,
    office: PROFILE.office,
    district: PROFILE.district,
    documentedRecordCount: 1,
    dataMode: 'illustrative_demo',
    evidenceStatus: 'illustrative_demo',
  }],
};

const LIVE_PROFILE = {
  id: 'ocd-person/live-001',
  name: 'Jordan Example',
  office: 'Assembly Member',
  district: 'New York Assembly District 1',
  party: 'Example Party',
  imageUrl: 'https://example.org/jordan-example.jpg',
  responsibilities: ['Serves in the New York State Assembly.'],
  contact: {
    website: 'https://example.org/live-official',
    email: '',
    phone: '',
    officeAddress: '',
  },
  issueRecords: [{
    topic: 'antisemitism',
    position: 'related_action',
    actionType: 'roll_call_vote',
    finding: 'Voted Yea on Agreeing to the resolution.',
    date: '2024-05-01',
    measure: {
      jurisdiction: 'United States',
      session: '118',
      identifier: 'H R 6090',
      title: 'Antisemitism Awareness Act of 2023',
    },
    action: {
      option: 'Yea',
      motion: 'Agreeing to the resolution',
      result: 'Passed',
    },
    sources: [
      { publisher: 'Office of the Clerk, U.S. House of Representatives', url: 'https://clerk.house.gov/Votes/2024172' },
      { publisher: 'Congress.gov', url: 'https://www.congress.gov/bill/118th-congress/house-bill/6090' },
    ],
    verification: {
      status: 'live_official_source',
      matchMethod: 'bioguide_id',
      retrievedAt: '2026-08-30T12:00:00.000Z',
    },
  }, {
    topic: 'antisemitism',
    position: 'related_action',
    actionType: 'cosponsorship',
    finding: 'Cosponsor of S 1234: Community Safety Act.',
    measure: {
      jurisdiction: 'New York',
      session: '2025-2026',
      identifier: 'S 1234',
      title: 'Community Safety Act',
    },
    action: { classification: 'Cosponsor' },
    sources: [{ publisher: 'New York State Senate', url: 'https://www.nysenate.gov/legislation/bills/2025/S1234' }],
    verification: {
      status: 'live_official_source',
      matchMethod: 'ocd_person_id',
      retrievedAt: '2026-08-30T12:00:00.000Z',
    },
  }],
  dataMode: 'live_identity',
  evidenceStatus: {
    status: 'researched',
    catalogVersion: 'ny-federal-pilot-v1',
    reviewedMeasureCount: 1,
    successfulMeasureCount: 1,
    failedMeasureCount: 0,
    message: 'Every applicable catalog measure was researched; returned actions are literal official-source records.',
  },
  sourceAttribution: {
    name: 'Open States',
    url: 'https://openstates.org/',
  },
};

const LIVE_LOOKUP = {
  coverage: { status: 'live_identity', message: 'Official identities are live from Open States. Issue evidence is not researched.' },
  location: { city: 'New York', state: 'NY' },
  officials: [{
    id: LIVE_PROFILE.id,
    name: LIVE_PROFILE.name,
    office: LIVE_PROFILE.office,
    district: LIVE_PROFILE.district,
    party: LIVE_PROFILE.party,
    imageUrl: LIVE_PROFILE.imageUrl,
    documentedRecordCount: 0,
    dataMode: 'live_identity',
    evidenceStatus: 'not_researched',
  }],
};

let moduleNumber = 0;

class FakeNode {
  constructor(name, text = '') {
    this.nodeName = name;
    this.children = [];
    this.listeners = new Map();
    this.attributes = new Map();
    this.dataset = {};
    this.textContent = text;
    this.className = '';
    this.value = '';
    this.id = '';
  }

  append(...children) {
    this.children.push(...children);
  }

  replaceChildren(...children) {
    this.children = [...children];
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  setCustomValidity() {}

  reportValidity() {}

  focus() {
    globalThis.__clientFocusedNode = this;
  }

  showModal() {
    this.open = true;
  }

  close() {
    this.open = false;
  }

  querySelector(selector) {
    const topic = /^\[data-topic="(.+)"\]$/.exec(selector)?.[1];
    return walk(this).find((node) => topic !== undefined && node.dataset.topic === topic) || null;
  }
}

function walk(node) {
  return [node, ...node.children.flatMap((child) => child instanceof FakeNode ? walk(child) : [])];
}

function find(root, predicate) {
  return walk(root).find(predicate);
}

async function waitFor(predicate) {
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const value = predicate();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error('Timed out waiting for client state.');
}

async function loadClient(fetchImplementation) {
  const app = new FakeNode('main');
  const status = new FakeNode('p');
  const settings = {
    button: new FakeNode('button'),
    dialog: new FakeNode('dialog'),
    form: new FakeNode('form'),
    input: new FakeNode('input'),
    close: new FakeNode('button'),
    clear: new FakeNode('button'),
  };
  const settingsSelectors = new Map([
    ['#api-settings-button', settings.button],
    ['#api-settings-dialog', settings.dialog],
    ['#api-settings-form', settings.form],
    ['#openstates-api-key', settings.input],
    ['#api-settings-close', settings.close],
    ['#api-settings-clear', settings.clear],
  ]);
  globalThis.document = {
    querySelector(selector) {
      if (selector === '#app') return app;
      if (selector === '#status') return status;
      return settingsSelectors.get(selector) || null;
    },
    createElement(name) {
      return new FakeNode(name);
    },
    createTextNode(text) {
      return new FakeNode('#text', text);
    },
  };
  globalThis.requestAnimationFrame = (callback) => callback();
  globalThis.fetch = fetchImplementation;
  const client = await import(`../public/app.js?client-test=${moduleNumber += 1}`);
  return { app, client, settings };
}

function successfulFetch(path) {
  const payload = path === '/api/v1/officials/lookup' ? LOOKUP : PROFILE;
  return Promise.resolve({ ok: true, json: async () => structuredClone(payload) });
}

async function submitAddress(app, address, { demo = false } = {}) {
  const input = find(app, (node) => node.id === 'address');
  if (demo) {
    const demoButton = find(app, (node) => node.textContent === 'Use demo location');
    demoButton.listeners.get('click')();
  }
  input.value = address;
  const form = find(app, (node) => node.nodeName === 'form');
  form.listeners.get('submit')({ preventDefault() {} });
}

test.after(() => {
  delete globalThis.document;
  delete globalThis.requestAnimationFrame;
  delete globalThis.fetch;
  delete globalThis.sessionStorage;
  delete globalThis.__clientFocusedNode;
});

test.afterEach(() => {
  delete globalThis.sessionStorage;
});

test('profile renders every supported topic and a neutral empty state for an absent topic', async () => {
  const { app, client } = await loadClient(successfulFetch);
  assert.deepEqual(client.SUPPORTED_TOPICS, SUPPORTED_TOPICS);
  await submitAddress(app, '123 Demo Street, Brooklyn, NY 11201', { demo: true });
  const profileButton = await waitFor(() => find(app, (node) => node.textContent === 'View illustrative profile'));
  profileButton.listeners.get('click')();

  const topicButtons = walk(app).filter((node) => node.className === 'chip');
  assert.deepEqual(topicButtons.map((node) => node.dataset.topic), ['all', ...SUPPORTED_TOPICS]);
  const absentTopic = topicButtons.find((node) => node.dataset.topic === 'jewish_community');
  absentTopic.listeners.get('click')();

  assert.ok(find(app, (node) => node.textContent === 'No displayed documented record for this topic.'));
  assert.equal(walk(app).some((node) => node.className === 'evidence-card'), false);
  assert.equal(globalThis.__clientFocusedNode.dataset.topic, 'jewish_community');
});

test('Edit address restores the last successfully submitted address in page memory', async () => {
  const address = '123 Demo Street, Brooklyn, NY 11201';
  const { app } = await loadClient(successfulFetch);
  await submitAddress(app, address, { demo: true });
  const editButton = await waitFor(() => find(app, (node) => node.textContent === 'Edit address'));
  editButton.listeners.get('click')();

  assert.equal(find(app, (node) => node.id === 'address').value, address);
});

test('typing an address opens a selectable autocomplete dropdown', async () => {
  const { app } = await loadClient(async (path) => {
    if (String(path).startsWith('/api/v1/addresses/suggest?')) {
      return {
        ok: true,
        json: async () => ({
          suggestions: [
            { id: 'one', label: '350 5th Avenue, New York, New York 10118' },
            { id: 'two', label: '351 5th Avenue, New York, New York 10016' },
          ],
        }),
      };
    }
    return successfulFetch(path);
  });
  const input = find(app, (node) => node.id === 'address');
  input.value = '350 Fifth';
  input.listeners.get('input')();

  const firstOption = await waitFor(() => find(app, (node) => node.attributes.get('role') === 'option'));
  const listbox = find(app, (node) => node.attributes.get('role') === 'listbox');
  assert.equal(input.attributes.get('aria-expanded'), 'true');
  assert.equal(listbox.children.length, 2);

  firstOption.listeners.get('click')();
  assert.equal(input.value, '350 5th Avenue, New York, New York 10118');
  assert.equal(input.attributes.get('aria-expanded'), 'false');
  assert.equal(listbox.children.length, 0);
  assert.equal(globalThis.__clientFocusedNode, input);
});

test('manual address submission uses live mode and prefetched profile evidence on compact cards', async () => {
  const calls = [];
  const { app } = await loadClient(async (path, options = {}) => {
    calls.push({ path, options });
    const payload = path === '/api/v1/officials/lookup' ? LIVE_LOOKUP : LIVE_PROFILE;
    return { ok: true, json: async () => structuredClone(payload) };
  });

  await submitAddress(app, '350 Fifth Avenue, New York, NY 10118');
  await waitFor(() => find(app, (node) => node.textContent === '2 documented official-source records · Research complete'));

  assert.deepEqual(JSON.parse(calls[0].options.body), {
    address: '350 Fifth Avenue, New York, NY 10118',
    mode: 'live',
  });
  assert.equal(find(app, (node) => node.textContent === 'Issue evidence not researched yet'), undefined);
  assert.ok(find(app, (node) => node.textContent === 'Example Party'));
  assert.ok(find(app, (node) => node.textContent === 'View profile'));
});

test('a session-persisted Open States key is sent only in live API request headers', async () => {
  const calls = [];
  globalThis.sessionStorage = {
    getItem(key) {
      return key === 'kyo.openstatesApiKey.v1' ? 'session-user-key' : null;
    },
    setItem() {},
    removeItem() {},
  };
  const { app } = await loadClient(async (path, options = {}) => {
    calls.push({ path, options });
    const payload = path === '/api/v1/officials/lookup' ? LIVE_LOOKUP : LIVE_PROFILE;
    return { ok: true, json: async () => structuredClone(payload) };
  });

  await submitAddress(app, '350 Fifth Avenue, New York, NY 10118');
  await waitFor(() => find(app, (node) => node.textContent === 'View profile'));

  assert.equal(calls.length, 2);
  assert.equal(calls[0].options.headers['x-openstates-api-key'], 'session-user-key');
  assert.equal(calls[1].options.headers['x-openstates-api-key'], 'session-user-key');
  assert.equal(calls.every(({ path }) => !String(path).includes('session-user-key')), true);
  assert.equal(JSON.stringify(JSON.parse(calls[0].options.body)).includes('session-user-key'), false);
});

test('API settings replace the session key used by subsequent live requests', async () => {
  const stored = new Map([['kyo.openstatesApiKey.v1', 'old-session-key']]);
  const calls = [];
  globalThis.sessionStorage = {
    getItem(key) { return stored.get(key) || null; },
    setItem(key, value) { stored.set(key, value); },
    removeItem(key) { stored.delete(key); },
  };
  const { app, settings } = await loadClient(async (path, options = {}) => {
    calls.push({ path, options });
    const payload = path === '/api/v1/officials/lookup' ? LIVE_LOOKUP : LIVE_PROFILE;
    return { ok: true, json: async () => structuredClone(payload) };
  });

  assert.equal(settings.input.value, 'old-session-key');
  settings.button.listeners.get('click')();
  assert.equal(settings.dialog.open, true);
  settings.input.value = 'new-session-key';
  settings.form.listeners.get('submit')({ preventDefault() {} });
  assert.equal(stored.get('kyo.openstatesApiKey.v1'), 'new-session-key');
  assert.equal(settings.dialog.open, false);

  await submitAddress(app, '350 Fifth Avenue, New York, NY 10118');
  await waitFor(() => find(app, (node) => node.textContent === 'View profile'));
  assert.equal(calls[0].options.headers['x-openstates-api-key'], 'new-session-key');
});

test('API settings can clear the session key and restore the default', async () => {
  const stored = new Map([['kyo.openstatesApiKey.v1', 'session-user-key']]);
  const calls = [];
  globalThis.sessionStorage = {
    getItem(key) { return stored.get(key) || null; },
    setItem(key, value) { stored.set(key, value); },
    removeItem(key) { stored.delete(key); },
  };
  const { app, settings } = await loadClient(async (path, options = {}) => {
    calls.push({ path, options });
    const payload = path === '/api/v1/officials/lookup' ? LIVE_LOOKUP : LIVE_PROFILE;
    return { ok: true, json: async () => structuredClone(payload) };
  });

  settings.button.listeners.get('click')();
  settings.clear.listeners.get('click')();

  assert.equal(stored.has('kyo.openstatesApiKey.v1'), false);
  assert.equal(settings.input.value, '');
  assert.equal(settings.dialog.open, false);
  await submitAddress(app, '350 Fifth Avenue, New York, NY 10118');
  await waitFor(() => find(app, (node) => node.textContent === 'View profile'));
  assert.equal(calls[0].options.headers['x-openstates-api-key'], undefined);
});

test('live official card and profile render the Open States headshot with an initials fallback', async () => {
  const { app } = await loadClient(async (path) => {
    const payload = path === '/api/v1/officials/lookup' ? LIVE_LOOKUP : LIVE_PROFILE;
    return { ok: true, json: async () => structuredClone(payload) };
  });

  await submitAddress(app, '350 Fifth Avenue, New York, NY 10118');
  const cardImage = await waitFor(() => find(app, (node) => node.nodeName === 'img'));
  const cardAvatar = find(app, (node) => node.className === 'official-avatar');
  assert.equal(cardImage.attributes.get('src'), LIVE_PROFILE.imageUrl);
  assert.equal(cardImage.attributes.get('alt'), 'Jordan Example');
  assert.equal(cardAvatar.textContent, 'JE');

  cardImage.listeners.get('error')();
  assert.equal(cardImage.attributes.get('hidden'), '');
  assert.equal(cardAvatar.attributes.has('hidden'), false);

  const profileButton = find(app, (node) => node.textContent === 'View profile');
  profileButton.listeners.get('click')();
  const profileImage = find(app, (node) => node.nodeName === 'img');
  assert.equal(profileImage.attributes.get('src'), LIVE_PROFILE.imageUrl);
});

test('official without an image URL renders initials instead of a broken image', async () => {
  const lookup = structuredClone(LIVE_LOOKUP);
  const profile = structuredClone(LIVE_PROFILE);
  lookup.officials[0].imageUrl = '';
  profile.imageUrl = '';
  const { app } = await loadClient(async (path) => ({
    ok: true,
    json: async () => structuredClone(path === '/api/v1/officials/lookup' ? lookup : profile),
  }));

  await submitAddress(app, '350 Fifth Avenue, New York, NY 10118');
  await waitFor(() => find(app, (node) => node.className === 'official-avatar'));
  assert.equal(walk(app).some((node) => node.nodeName === 'img'), false);
  assert.equal(find(app, (node) => node.className === 'official-avatar').textContent, 'JE');
});

test('demo button makes the next lookup explicitly illustrative', async () => {
  const calls = [];
  globalThis.sessionStorage = {
    getItem(key) {
      return key === 'kyo.openstatesApiKey.v1' ? 'session-user-key' : null;
    },
    setItem() {},
    removeItem() {},
  };
  const { app } = await loadClient(async (path, options = {}) => {
    calls.push({ path, options });
    return successfulFetch(path);
  });

  await submitAddress(app, 'Brooklyn, NY 11201', { demo: true });
  await waitFor(() => find(app, (node) => node.textContent === 'View illustrative profile'));

  assert.deepEqual(JSON.parse(calls[0].options.body), {
    address: 'Brooklyn, NY 11201',
    mode: 'demo',
  });
  assert.equal(calls.every(({ options }) => options.headers?.['x-openstates-api-key'] === undefined), true);
});

test('live profile renders its coverage status, attribution, evidence, and safe empty contacts', async () => {
  const { app } = await loadClient(async (path) => {
    const payload = path === '/api/v1/officials/lookup' ? LIVE_LOOKUP : LIVE_PROFILE;
    return { ok: true, json: async () => structuredClone(payload) };
  });
  await submitAddress(app, '350 Fifth Avenue, New York, NY 10118');
  const profileButton = await waitFor(() => find(app, (node) => node.textContent === 'View profile'));
  assert.equal(find(app, (node) => node.textContent === LIVE_LOOKUP.coverage.message), undefined);
  profileButton.listeners.get('click')();

  assert.ok(find(app, (node) => node.textContent === LIVE_PROFILE.evidenceStatus.message));
  assert.ok(find(app, (node) => node.textContent === 'Data source: Open States'));
  assert.equal(walk(app).some((node) => node.className === 'evidence-card'), true);
  assert.ok(walk(app).filter((node) => node.textContent === 'Not provided').length >= 2);
});

test('live evidence renders literal action details and every source without inferred labels or demo prose', async () => {
  const { app } = await loadClient(async (path) => {
    const payload = path === '/api/v1/officials/lookup' ? LIVE_LOOKUP : LIVE_PROFILE;
    return { ok: true, json: async () => structuredClone(payload) };
  });
  await submitAddress(app, '350 Fifth Avenue, New York, NY 10118');
  const profileButton = await waitFor(() => find(app, (node) => node.textContent === 'View profile'));
  profileButton.listeners.get('click')();

  assert.ok(find(app, (node) => node.textContent === 'Voted Yea on Agreeing to the resolution.'));
  assert.ok(find(app, (node) => node.textContent === 'Action: Roll call vote'));
  assert.ok(find(app, (node) => node.textContent === 'Motion: Agreeing to the resolution'));
  assert.ok(find(app, (node) => node.textContent === 'Vote: Yea'));
  assert.ok(find(app, (node) => node.textContent === 'Result: Passed'));
  assert.ok(find(app, (node) => node.textContent === 'Date: 2024-05-01'));
  assert.ok(find(app, (node) => node.textContent === 'Cosponsor of S 1234: Community Safety Act.'));
  assert.ok(find(app, (node) => node.textContent === 'Action: Cosponsorship'));
  assert.ok(find(app, (node) => node.textContent === 'Classification: Cosponsor'));
  const evidenceCards = walk(app).filter((node) => node.className === 'evidence-card');
  const sponsorshipCard = evidenceCards.find((card) => find(card, (node) => node.textContent === 'Cosponsor of S 1234: Community Safety Act.'));
  assert.ok(sponsorshipCard);
  assert.equal(walk(sponsorshipCard).some((node) => node.textContent.startsWith('Date:')), false);
  const metadataItems = walk(app).filter((node) => node.className === 'evidence-meta-item');
  assert.ok(metadataItems.length > 0);
  assert.ok(metadataItems.every((node) => node.nodeName === 'span'));
  assert.ok(metadataItems.some((node) => node.textContent === 'Measure: H R 6090 — Antisemitism Awareness Act of 2023'));
  const sourceLinks = walk(app).filter((node) => node.nodeName === 'a' && node.textContent.startsWith('Open source:'));
  assert.deepEqual(sourceLinks.map((node) => node.textContent), [
    'Open source: Office of the Clerk, U.S. House of Representatives',
    'Open source: Congress.gov',
    'Open source: New York State Senate',
  ]);
  assert.deepEqual(sourceLinks.map((node) => node.attributes.get('href')), [
    'https://clerk.house.gov/Votes/2024172',
    'https://www.congress.gov/bill/118th-congress/house-bill/6090',
    'https://www.nysenate.gov/legislation/bills/2025/S1234',
  ]);
  const renderedText = walk(app).map((node) => node.textContent).join('\n');
  assert.doesNotMatch(renderedText, /\bscore\b|\bsupports\b|\bopposes\b|Verification:/i);
});

test('failed lookup keeps the submitted address available for correction', async () => {
  const address = '1 Main Street, Albany, NY 12207';
  const { app } = await loadClient(async () => {
    throw new Error('network unavailable');
  });
  await submitAddress(app, address);
  await waitFor(() => find(app, (node) => node.textContent === 'We could not complete that lookup.'));
  const editButton = find(app, (node) => node.textContent === 'Edit address');
  editButton.listeners.get('click')();

  assert.equal(find(app, (node) => node.id === 'address').value, address);
});
