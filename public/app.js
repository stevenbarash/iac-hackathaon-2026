const app = document.querySelector('#app');
const statusRegion = document.querySelector('#status');

export const SUPPORTED_TOPICS = Object.freeze([
  'ihra',
  'bds_policy',
  'israel_legislation',
  'antisemitism',
  'jewish_community',
]);

const state = {
  view: 'welcome',
  address: '',
  lookup: null,
  profiles: new Map(),
  profile: null,
  topic: 'all',
  error: null,
  retryAction: null,
  lookupMode: 'live',
};

function element(name, options = {}) {
  const node = document.createElement(name);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.type) node.type = options.type;
  if (options.id) node.id = options.id;
  if (options.attributes) {
    for (const [attribute, value] of Object.entries(options.attributes)) {
      node.setAttribute(attribute, value);
    }
  }
  return node;
}

function announce(message) {
  statusRegion.textContent = message;
}

function focusHeading(heading) {
  requestAnimationFrame(() => heading.focus());
}

function heading(text, level = 'h1') {
  return element(level, { text, attributes: { tabindex: '-1' } });
}

function button(text, className = 'button') {
  return element('button', { className, text, type: 'button' });
}

function openSafeLink(text, url, className = '') {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return element('span', { className, text });
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return element('span', { className, text });
  return element('a', {
    className,
    text,
    attributes: { href: parsed.href, target: '_blank', rel: 'noopener noreferrer' },
  });
}

function apiError(message) {
  const error = new Error(message);
  error.isExpected = true;
  return error;
}

async function requestJson(path, options) {
  const response = await fetch(path, options);
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw apiError(payload?.error?.message || 'The illustrative demo service could not complete that request.');
  return payload;
}

function setView(view, announcement) {
  state.view = view;
  if (announcement) announce(announcement);
  render();
}

function addMainContent(...nodes) {
  app.replaceChildren(...nodes);
}

function renderWelcome() {
  const intro = element('section', { className: 'intro' });
  const title = heading('Know the record. Start with your place.');
  intro.append(title, element('p', { className: 'lede', text: 'Find your elected officials, understand their public roles, and see exactly what issue evidence has—or has not—been researched.' }));

  const panel = element('section', { className: 'form-panel', attributes: { 'aria-labelledby': 'address-heading' } });
  panel.append(element('h2', { id: 'address-heading', text: 'Find your officials' }));
  const form = element('form');
  const label = element('label', { className: 'field-label', text: 'Full address', attributes: { for: 'address' } });
  const hint = element('span', { className: 'field-hint', id: 'address-hint', text: 'Street, city, state, and 5-digit ZIP are required for a reliable match.' });
  const input = element('input', { id: 'address', type: 'text', attributes: { name: 'address', autocomplete: 'street-address', required: '', 'aria-describedby': 'address-hint' } });
  input.value = state.address;
  const privacy = element('p', { className: 'privacy-copy', text: 'Your address is sent securely to the U.S. Census Geocoder and is not stored. Only the resulting coordinates are sent to Open States.' });
  const actions = element('div', { className: 'actions' });
  const submit = element('button', { className: 'button', text: 'Find my officials', type: 'submit' });
  const demo = button('Use demo location', 'button secondary');
  demo.addEventListener('click', () => {
    input.value = 'Brooklyn, NY 11201';
    state.lookupMode = 'demo';
    input.focus();
    announce('Demo location filled. Submit the form to see illustrative officials.');
  });
  input.addEventListener('input', () => {
    state.lookupMode = 'live';
  });
  actions.append(submit, demo);
  form.append(label, hint, input, privacy, actions);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    state.address = input.value.trim();
    if (!state.address) {
      input.focus();
      input.setCustomValidity('Enter a full address to continue.');
      input.reportValidity();
      input.setCustomValidity('');
      return;
    }
    lookupAddress();
  });
  panel.append(form);
  addMainContent(intro, panel);
  focusHeading(title);
}

async function lookupAddress() {
  const demoMode = state.lookupMode === 'demo';
  setView('loading', demoMode ? 'Looking up illustrative pilot officials.' : 'Looking up elected officials.');
  try {
    const lookup = await requestJson('/api/v1/officials/lookup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ address: state.address, mode: state.lookupMode }),
    });
    const profileResults = await Promise.allSettled(lookup.officials.map(async (official) => {
      const profile = await requestJson(`/api/v1/officials/${encodeURIComponent(official.id)}`);
      return [official.id, profile];
    }));
    const profiles = profileResults
      .filter((result) => result.status === 'fulfilled')
      .map((result) => result.value);
    state.lookup = lookup;
    state.profiles = new Map(profiles);
    setView('officials', `${demoMode ? 'Illustrative officials' : 'Officials'} found for ${lookup.location.city}, ${lookup.location.state}.`);
  } catch (error) {
    state.error = error.isExpected ? error.message : 'A network problem prevented this lookup. Please try again.';
    state.retryAction = () => setView('welcome', 'Return to the address form to try again.');
    setView('error', 'Lookup could not be completed.');
  }
}

function renderLoading() {
  const section = element('section', { className: 'loading', attributes: { 'aria-labelledby': 'loading-title', 'aria-busy': 'true' } });
  const demoMode = state.lookupMode === 'demo';
  const title = heading(demoMode ? 'Looking up your illustrative pilot results.' : 'Looking up your elected officials.');
  title.id = 'loading-title';
  section.append(element('div', { className: 'spinner', attributes: { 'aria-hidden': 'true' } }), title, element('p', { className: 'muted', text: demoMode ? 'Preparing the fictional demo records.' : 'Matching your location to current Open States records.' }));
  addMainContent(section);
  focusHeading(title);
}

function renderOfficials() {
  const { lookup } = state;
  const demoMode = lookup.coverage.status === 'illustrative_pilot';
  const intro = element('section', { className: 'screen-header' });
  const title = heading(demoMode ? 'Your illustrative pilot officials' : 'Your elected officials');
  const location = element('p', { className: 'location-confirmation', text: `Results are matched to ${lookup.location.city}, ${lookup.location.state}.` });
  const coverage = element('p', { className: 'pilot-notice', text: lookup.coverage.message });
  intro.append(title, location, coverage);
  const grid = element('section', { className: 'official-grid', attributes: { 'aria-label': demoMode ? 'Illustrative official profiles' : 'Official profiles' } });
  for (const official of lookup.officials) {
    const profile = state.profiles.get(official.id);
    const card = element('article', { className: 'official-card' });
    const copy = element('div');
    copy.append(element('p', { className: 'card-label', text: official.office }), element('h2', { text: official.name }), element('p', { className: 'district', text: official.district }));
    if (official.party) copy.append(element('p', { className: 'district', text: official.party }));
    const responsibilities = profile?.responsibilities || [];
    const summary = responsibilities.length > 0 ? responsibilities.slice(0, 2).join(' · ') : 'Illustrative responsibilities available in the profile.';
    const recordText = official.evidenceStatus === 'not_researched'
      ? 'Issue evidence not researched yet'
      : `${official.documentedRecordCount} documented illustrative record${official.documentedRecordCount === 1 ? '' : 's'}`;
    card.append(copy, element('p', { className: 'responsibility-summary', text: summary }), element('p', { className: 'record-count', text: recordText }));
    const viewProfile = button(demoMode ? 'View illustrative profile' : 'View profile');
    viewProfile.addEventListener('click', () => showProfile(official.id));
    card.append(viewProfile);
    grid.append(card);
  }
  const actions = element('div', { className: 'section-actions' });
  const edit = button('Edit address', 'button secondary');
  edit.addEventListener('click', () => setView('welcome', 'Return to the address form.'));
  actions.append(edit);
  addMainContent(intro, grid, actions);
  focusHeading(title);
}

async function showProfile(id) {
  const existing = state.profiles.get(id);
  if (existing) {
    state.profile = existing;
    state.topic = 'all';
    setView('profile', `Showing the illustrative profile for ${existing.name}.`);
    return;
  }
  setView('loading', 'Loading illustrative profile.');
  try {
    state.profile = await requestJson(`/api/v1/officials/${encodeURIComponent(id)}`);
    state.profiles.set(id, state.profile);
    state.topic = 'all';
    setView('profile', `Showing the illustrative profile for ${state.profile.name}.`);
  } catch (error) {
    state.error = error.isExpected ? error.message : 'A network problem prevented this profile from loading.';
    state.retryAction = () => showProfile(id);
    setView('error', 'Profile could not be completed.');
  }
}

function formatTopic(topic) {
  return topic.replaceAll('_', ' ');
}

function formatPosition(position) {
  return position.replaceAll('_', ' ');
}

function renderProfile({ focusTopic = null } = {}) {
  const profile = state.profile;
  const demoMode = profile.dataMode !== 'live_identity';
  const back = button('Back to officials', 'button secondary');
  back.addEventListener('click', () => setView('officials', 'Returned to illustrative official results.'));
  const title = heading(profile.name);
  const header = element('section', { className: 'screen-header' });
  header.append(back, title, element('p', { className: 'location-confirmation', text: `${profile.office} · ${profile.district}` }));
  const profilePanel = element('aside', { className: 'panel profile-summary', attributes: { 'aria-label': demoMode ? 'Illustrative profile details' : 'Official profile details' } });
  profilePanel.append(element('div', { className: 'profile-title-row' }), element('h2', { text: 'Responsibilities' }));
  const responsibilityList = element('ul', { className: 'responsibility-list' });
  profile.responsibilities.forEach((responsibility) => responsibilityList.append(element('li', { text: responsibility })));
  profilePanel.append(responsibilityList, element('h2', { text: 'Contact actions' }));
  const contactList = element('ul', { className: 'contact-list' });
  const websiteRow = element('li');
  websiteRow.append(element('span', { className: 'contact-label', text: 'Website' }), profile.contact.website ? openSafeLink('Open website', profile.contact.website) : element('span', { text: 'Not provided' }));
  const emailRow = element('li');
  const emailLink = profile.contact.email ? element('a', { text: profile.contact.email, attributes: { href: `mailto:${profile.contact.email}` } }) : element('span', { text: 'Not provided' });
  emailRow.append(element('span', { className: 'contact-label', text: 'Email' }), emailLink);
  const phoneRow = element('li');
  const phoneLink = profile.contact.phone ? element('a', { text: profile.contact.phone, attributes: { href: `tel:${profile.contact.phone}` } }) : element('span', { text: 'Not provided' });
  phoneRow.append(element('span', { className: 'contact-label', text: 'Phone' }), phoneLink);
  const officeRow = element('li');
  officeRow.append(element('span', { className: 'contact-label', text: 'Office' }), document.createTextNode(profile.contact.officeAddress || 'Not provided'));
  contactList.append(websiteRow, emailRow, phoneRow, officeRow);
  profilePanel.append(contactList);
  if (profile.sourceAttribution?.url) {
    profilePanel.append(openSafeLink(`Data source: ${profile.sourceAttribution.name}`, profile.sourceAttribution.url));
  }

  const evidencePanel = element('section', { className: 'panel', attributes: { 'aria-labelledby': 'evidence-title' } });
  evidencePanel.append(
    element('h2', { id: 'evidence-title', text: demoMode ? 'Illustrative evidence records' : 'Issue evidence' }),
    element('p', { className: 'muted', text: profile.evidenceStatus?.message || (demoMode ? 'Filter the demo records by topic. Every record is marked demo_only.' : 'Issue evidence has not been researched yet.') }),
  );
  const topics = ['all', ...SUPPORTED_TOPICS];
  const chipList = element('div', { className: 'topics', attributes: { 'aria-label': 'Filter evidence by topic' } });
  topics.forEach((topic) => {
    const chip = button(topic === 'all' ? 'All topics' : formatTopic(topic), 'chip');
    chip.dataset.topic = topic;
    chip.setAttribute('aria-pressed', String(state.topic === topic));
    chip.addEventListener('click', () => {
      state.topic = topic;
      renderProfile({ focusTopic: topic });
      announce(`${topic === 'all' ? 'All topics' : formatTopic(topic)} evidence filter selected.`);
    });
    chipList.append(chip);
  });
  evidencePanel.append(chipList);
  const records = state.topic === 'all' ? profile.issueRecords : profile.issueRecords.filter((record) => record.topic === state.topic);
  const evidenceList = element('div', { className: 'evidence-list' });
  if (records.length === 0) {
    evidenceList.append(element('p', {
      className: 'empty-state',
      text: state.topic === 'all' ? 'No issue evidence is currently displayed.' : 'No displayed documented record for this topic.',
    }));
  }
  records.forEach((record) => {
    const card = element('article', { className: 'evidence-card' });
    card.append(element('h3', { text: formatTopic(record.topic) }), element('p', { className: 'position', text: `Position: ${formatPosition(record.position)}` }), element('p', { text: record.finding }));
    const meta = element('p', { className: 'evidence-meta' });
    meta.append(document.createTextNode(`Date: ${record.date}`), document.createTextNode(`Evidence: ${record.evidenceType}`));
    card.append(meta);
    const source = openSafeLink(`Open source: ${record.source.title}`, record.source.url, 'button secondary');
    const sourceActions = element('div', { className: 'inline-actions' });
    sourceActions.append(source);
    card.append(sourceActions, element('p', { className: 'verification', text: `Verification: ${record.verification.status} · ${record.verification.note} · checked ${record.verification.verifiedAt}` }));
    evidenceList.append(card);
  });
  evidencePanel.append(evidenceList);
  const layout = element('div', { className: 'profile-layout' });
  layout.append(profilePanel, evidencePanel);
  addMainContent(header, layout);
  if (focusTopic) {
    requestAnimationFrame(() => app.querySelector(`[data-topic="${focusTopic}"]`)?.focus());
  } else {
    focusHeading(title);
  }
}

function renderError() {
  const section = element('section', { className: 'error-panel', attributes: { 'aria-labelledby': 'error-title' } });
  const title = heading('We could not complete that lookup.');
  title.id = 'error-title';
  section.append(title, element('p', { text: state.error || 'Please try again.' }));
  const actions = element('div', { className: 'actions' });
  const retry = button('Try again');
  retry.addEventListener('click', () => {
    if (state.retryAction) state.retryAction();
    else setView('welcome', 'Return to the address form to try again.');
  });
  const edit = button('Edit address', 'button secondary');
  edit.addEventListener('click', () => setView('welcome', 'Return to the address form.'));
  actions.append(retry, edit);
  section.append(actions);
  addMainContent(section);
  focusHeading(title);
}

function render() {
  if (state.view === 'welcome') renderWelcome();
  else if (state.view === 'loading') renderLoading();
  else if (state.view === 'officials') renderOfficials();
  else if (state.view === 'profile') renderProfile();
  else renderError();
}

render();
