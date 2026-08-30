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
  responsibilities: ['Serves in the New York State Assembly.'],
  contact: {
    website: 'https://example.org/live-official',
    email: '',
    phone: '',
    officeAddress: '',
  },
  issueRecords: [],
  dataMode: 'live_identity',
  evidenceStatus: {
    status: 'not_researched',
    message: 'Identity is live from Open States. Issue evidence has not been researched yet.',
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

  setCustomValidity() {}

  reportValidity() {}

  focus() {
    globalThis.__clientFocusedNode = this;
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
    await new Promise((resolve) => setImmediate(resolve));
  }
  throw new Error('Timed out waiting for client state.');
}

async function loadClient(fetchImplementation) {
  const app = new FakeNode('main');
  const status = new FakeNode('p');
  globalThis.document = {
    querySelector(selector) {
      if (selector === '#app') return app;
      if (selector === '#status') return status;
      return null;
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
  return { app, client };
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
  delete globalThis.__clientFocusedNode;
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

test('manual address submission uses live mode and labels missing issue research accurately', async () => {
  const calls = [];
  const { app } = await loadClient(async (path, options = {}) => {
    calls.push({ path, options });
    const payload = path === '/api/v1/officials/lookup' ? LIVE_LOOKUP : LIVE_PROFILE;
    return { ok: true, json: async () => structuredClone(payload) };
  });

  await submitAddress(app, '350 Fifth Avenue, New York, NY 10118');
  await waitFor(() => find(app, (node) => node.textContent === 'Issue evidence not researched yet'));

  assert.deepEqual(JSON.parse(calls[0].options.body), {
    address: '350 Fifth Avenue, New York, NY 10118',
    mode: 'live',
  });
  assert.ok(find(app, (node) => node.textContent === 'Example Party'));
  assert.ok(find(app, (node) => node.textContent === 'View profile'));
});

test('demo button makes the next lookup explicitly illustrative', async () => {
  const calls = [];
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
});

test('live profile renders the not-researched state, attribution, and safe empty contacts', async () => {
  const { app } = await loadClient(async (path) => {
    const payload = path === '/api/v1/officials/lookup' ? LIVE_LOOKUP : LIVE_PROFILE;
    return { ok: true, json: async () => structuredClone(payload) };
  });
  await submitAddress(app, '350 Fifth Avenue, New York, NY 10118');
  const profileButton = await waitFor(() => find(app, (node) => node.textContent === 'View profile'));
  profileButton.listeners.get('click')();

  assert.ok(find(app, (node) => node.textContent === LIVE_PROFILE.evidenceStatus.message));
  assert.ok(find(app, (node) => node.textContent === 'Data source: Open States'));
  assert.equal(walk(app).some((node) => node.className === 'evidence-card'), false);
  assert.ok(walk(app).filter((node) => node.textContent === 'Not provided').length >= 2);
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
