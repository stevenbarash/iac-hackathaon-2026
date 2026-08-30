const app = document.querySelector('#app');
const statusRegion = document.querySelector('#status');
const APPEARANCE_KEYS = Object.freeze({ theme: 'kyo.theme.v1', textsize: 'kyo.textsize.v1' });
const OPENSTATES_KEY_STORAGE = 'kyo.openstatesApiKey.v1';

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
  openStatesApiKey: safeSessionGet(OPENSTATES_KEY_STORAGE, ''),
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

function safeStorageGet(key, fallback) {
  try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
}

function safeStorageSet(key, value) {
  try { localStorage.setItem(key, value); } catch { /* Appearance still works for this page. */ }
}

function safeSessionGet(key, fallback) {
  try { return sessionStorage.getItem(key) || fallback; } catch { return fallback; }
}

function safeSessionSet(key, value) {
  try { sessionStorage.setItem(key, value); } catch { /* The key remains available in page memory. */ }
}

function safeSessionRemove(key) {
  try { sessionStorage.removeItem(key); } catch { /* The key remains available in page memory. */ }
}

function liveApiHeaders(headers = {}) {
  if (!state.openStatesApiKey) return headers;
  return { ...headers, 'x-openstates-api-key': state.openStatesApiKey };
}

function setAppearance(attribute, value, switchNode) {
  document.documentElement?.setAttribute(`data-${attribute}`, value);
  safeStorageSet(APPEARANCE_KEYS[attribute], value);
  switchNode?.querySelectorAll?.('button[data-value]').forEach((control) => {
    control.setAttribute('aria-pressed', String(control.dataset.value === value));
  });
}

function initAppearance() {
  for (const [attribute, fallback] of [['theme', 'system'], ['textsize', 'normal']]) {
    const switchNode = document.querySelector(`#${attribute}-switch`);
    if (!switchNode) continue;
    const value = safeStorageGet(APPEARANCE_KEYS[attribute], fallback);
    setAppearance(attribute, value, switchNode);
    switchNode.addEventListener('click', (event) => {
      const control = event.target.closest?.('button[data-value]');
      if (control) setAppearance(attribute, control.dataset.value, switchNode);
    });
  }
}

function initApiSettings() {
  const settingsButton = document.querySelector('#api-settings-button');
  const settingsDialog = document.querySelector('#api-settings-dialog');
  const settingsForm = document.querySelector('#api-settings-form');
  const settingsInput = document.querySelector('#openstates-api-key');
  const closeButton = document.querySelector('#api-settings-close');
  const clearButton = document.querySelector('#api-settings-clear');
  if (!settingsButton || !settingsDialog || !settingsForm || !settingsInput || !closeButton || !clearButton) return;

  settingsInput.value = state.openStatesApiKey;
  settingsButton.addEventListener('click', () => {
    settingsInput.value = state.openStatesApiKey;
    settingsDialog.showModal();
    settingsInput.focus();
  });
  closeButton.addEventListener('click', () => settingsDialog.close());
  clearButton.addEventListener('click', () => {
    state.openStatesApiKey = '';
    settingsInput.value = '';
    safeSessionRemove(OPENSTATES_KEY_STORAGE);
    settingsDialog.close();
    announce('Using the default Open States API key.');
  });
  settingsForm.addEventListener('submit', (event) => {
    event.preventDefault();
    state.openStatesApiKey = settingsInput.value.trim();
    if (state.openStatesApiKey) safeSessionSet(OPENSTATES_KEY_STORAGE, state.openStatesApiKey);
    else safeSessionRemove(OPENSTATES_KEY_STORAGE);
    settingsInput.value = state.openStatesApiKey;
    settingsDialog.close();
    announce(state.openStatesApiKey ? 'Custom Open States API key saved for this tab.' : 'Using the default Open States API key.');
  });
}

function attachAddressAutocomplete(input, listbox) {
  let debounceTimer;
  let requestController;
  let activeIndex = -1;

  function closeSuggestions() {
    activeIndex = -1;
    listbox.replaceChildren();
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function selectSuggestion(label) {
    input.value = label;
    state.address = label;
    state.lookupMode = 'live';
    closeSuggestions();
    input.focus();
    announce(`Address selected: ${label}`);
  }

  function setActiveOption(nextIndex) {
    const options = [...listbox.children];
    if (options.length === 0) return;
    activeIndex = (nextIndex + options.length) % options.length;
    options.forEach((option, index) => option.setAttribute('aria-selected', String(index === activeIndex)));
    input.setAttribute('aria-activedescendant', options[activeIndex].id);
  }

  function showSuggestions(suggestions) {
    closeSuggestions();
    suggestions.forEach((suggestion, index) => {
      const option = element('button', {
        className: 'address-option',
        text: suggestion.label,
        type: 'button',
        id: `address-option-${index}`,
        attributes: { role: 'option', 'aria-selected': 'false', tabindex: '-1' },
      });
      option.addEventListener('mousedown', (event) => event.preventDefault());
      option.addEventListener('click', () => selectSuggestion(suggestion.label));
      listbox.append(option);
    });
    if (suggestions.length > 0) {
      input.setAttribute('aria-expanded', 'true');
      announce(`${suggestions.length} address suggestions available.`);
    }
  }

  async function loadSuggestions(query) {
    requestController?.abort();
    requestController = new AbortController();
    try {
      const payload = await requestJson(`/api/v1/addresses/suggest?q=${encodeURIComponent(query)}`, {
        signal: requestController.signal,
      });
      if (input.value.trim() === query) showSuggestions(payload.suggestions || []);
    } catch (error) {
      if (error.name !== 'AbortError') closeSuggestions();
    }
  }

  input.addEventListener('input', () => {
    state.lookupMode = 'live';
    state.address = input.value;
    clearTimeout(debounceTimer);
    const query = input.value.trim();
    if (query.length < 5) {
      requestController?.abort();
      closeSuggestions();
      return;
    }
    debounceTimer = setTimeout(() => loadSuggestions(query), 250);
  });
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveOption(activeIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveOption(activeIndex - 1);
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      selectSuggestion(listbox.children[activeIndex].textContent);
    } else if (event.key === 'Escape') {
      closeSuggestions();
    }
  });
  input.addEventListener('blur', () => setTimeout(closeSuggestions, 120));
}

function initialsFor(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return `${parts[0][0]}${parts.length > 1 ? parts.at(-1)[0] : ''}`.toUpperCase();
}

function officialPortrait(official) {
  const portrait = element('div', { className: 'official-portrait' });
  const avatar = element('span', {
    className: 'official-avatar',
    text: initialsFor(official.name),
    attributes: { role: 'img', 'aria-label': `${official.name} initials` },
  });
  portrait.append(avatar);
  if (!official.imageUrl) return portrait;

  avatar.setAttribute('hidden', '');
  const image = element('img', {
    className: 'official-headshot',
    attributes: {
      src: official.imageUrl,
      alt: official.name,
      loading: 'lazy',
      decoding: 'async',
    },
  });
  image.addEventListener('error', () => {
    image.setAttribute('hidden', '');
    avatar.removeAttribute('hidden');
  });
  portrait.append(image);
  return portrait;
}

function governmentLevel(official) {
  const office = `${official.office || ''} ${official.district || ''}`.toLowerCase();
  if (office.includes('congress') || office.includes('u.s.') || office.includes('house representative')) return 'federal';
  if (office.includes('senate') || office.includes('senator')) return 'senate';
  return 'assembly';
}

function districtNumber(official) {
  return String(official.district || '').match(/\d+/)?.[0] || '•';
}

function portraitWithBullet(official) {
  const wrapper = element('div', { className: `portrait-wrap level-${governmentLevel(official)}` });
  wrapper.append(officialPortrait(official), element('span', { className: 'route-bullet', text: districtNumber(official), attributes: { 'aria-hidden': 'true' } }));
  return wrapper;
}

function compactEvidenceText(official, profile, demoMode) {
  const status = profile?.evidenceStatus?.status || official.evidenceStatus;
  const count = Array.isArray(profile?.issueRecords)
    ? profile.issueRecords.length
    : Number(official.documentedRecordCount) || 0;
  const plural = count === 1 ? '' : 's';
  if (demoMode) return `${count} documented illustrative record${plural}`;
  if (status === 'researched') {
    return `${count} documented official-source record${plural} · Research complete`;
  }
  if (status === 'partially_available') {
    return `${count} documented official-source record${plural} · Partial coverage`;
  }
  if (status === 'temporarily_unavailable') {
    return `${count} documented official-source record${plural} · Temporarily unavailable`;
  }
  return 'Issue evidence not researched yet';
}

async function copyText(value, label) {
  const toast = document.querySelector('#toast');
  try {
    await navigator.clipboard.writeText(value);
    if (toast) {
      toast.textContent = `${label} copied`;
      toast.hidden = false;
      setTimeout(() => { toast.hidden = true; }, 2200);
    }
  } catch {
    announce(`Could not copy ${label.toLowerCase()}.`);
  }
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
  const title = heading('Know who represents you. Engage with confidence.');
  intro.append(
    title,
    element('p', { className: 'lede', text: 'Find your elected officials, understand what their offices do and which issues have documented records, then get clear ways to call or write.' }),
    element('p', { className: 'project-context', text: 'Built for the IAC Hackathon 2026 “Know Your Officials” challenge—helping community members turn trustworthy civic information into informed action.' }),
  );

  const panel = element('section', { className: 'form-panel', attributes: { 'aria-labelledby': 'address-heading' } });
  panel.append(element('h2', { id: 'address-heading', text: 'Start with your address' }));
  const form = element('form');
  const label = element('label', { className: 'field-label', text: 'Full address', attributes: { for: 'address' } });
  const hint = element('span', { className: 'field-hint', id: 'address-hint', text: 'Street, city, state, and 5-digit ZIP are required for a reliable match.' });
  const autocomplete = element('div', { className: 'address-autocomplete' });
  const input = element('input', { id: 'address', type: 'text', attributes: { name: 'address', autocomplete: 'off', required: '', 'aria-describedby': 'address-hint', role: 'combobox', 'aria-autocomplete': 'list', 'aria-controls': 'address-suggestions', 'aria-expanded': 'false' } });
  const listbox = element('div', { className: 'address-suggestions', id: 'address-suggestions', attributes: { role: 'listbox', 'aria-label': 'Address suggestions' } });
  input.value = state.address;
  autocomplete.append(input, listbox);
  attachAddressAutocomplete(input, listbox);
  const privacy = element('p', { className: 'privacy-copy', text: 'As you type, address text is sent securely to Photon for suggestions. Your final address is sent to the U.S. Census Geocoder and may be sent to Photon if Census is unavailable; this service does not store it. Only the resulting coordinates are sent to Open States.' });
  const actions = element('div', { className: 'actions' });
  const submit = element('button', { className: 'button', text: 'Find my officials', type: 'submit' });
  const demo = button('Use demo location', 'button secondary');
  demo.addEventListener('click', () => {
    input.value = 'Brooklyn, NY 11201';
    state.lookupMode = 'demo';
    input.focus();
    announce('Demo location filled. Submit the form to see illustrative officials.');
  });
  actions.append(submit, demo);
  form.append(label, hint, autocomplete, privacy, actions);
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
      headers: demoMode
        ? { 'content-type': 'application/json' }
        : liveApiHeaders({ 'content-type': 'application/json' }),
      body: JSON.stringify({ address: state.address, mode: state.lookupMode }),
    });
    const profileResults = await Promise.allSettled(lookup.officials.map(async (official) => {
      const profile = await requestJson(
        `/api/v1/officials/${encodeURIComponent(official.id)}`,
        demoMode ? undefined : { headers: liveApiHeaders() },
      );
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
  intro.append(title, location);
  if (demoMode) {
    intro.append(element('p', { className: 'pilot-notice', text: lookup.coverage.message }));
  }
  const grid = element('section', { className: 'official-grid', attributes: { 'aria-label': demoMode ? 'Illustrative official profiles' : 'Official profiles' } });
  for (const official of lookup.officials) {
    const profile = state.profiles.get(official.id);
    const card = element('article', { className: `official-card level-${governmentLevel(official)}` });
    const copy = element('div', { className: 'official-copy' });
    copy.append(element('p', { className: 'card-label', text: official.office }), element('h2', { text: official.name }), element('p', { className: 'district', text: official.district }));
    if (official.party) copy.append(element('p', { className: 'district', text: official.party }));
    const responsibilities = profile?.responsibilities || [];
    const summary = responsibilities.length > 0 ? responsibilities.slice(0, 2).join(' · ') : 'Illustrative responsibilities available in the profile.';
    const recordText = compactEvidenceText(official, profile, demoMode);
    const evidenceCopy = element('div', { className: 'official-evidence' });
    evidenceCopy.append(element('p', { className: 'card-label', text: 'Evidence status' }), element('p', { className: 'record-count', text: recordText }), element('p', { className: 'responsibility-summary', text: summary }));
    card.append(portraitWithBullet(official), copy, evidenceCopy);
    const viewProfile = button(demoMode ? 'View illustrative profile' : 'View profile', 'button row-action');
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
    state.profile = await requestJson(
      `/api/v1/officials/${encodeURIComponent(id)}`,
      id.startsWith('ocd-person/') ? { headers: liveApiHeaders() } : undefined,
    );
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

function formatActionType(actionType) {
  const label = formatPosition(actionType);
  return `${label[0].toUpperCase()}${label.slice(1)}`;
}

function contactAction(text, href, className) {
  return element('a', { className, text, attributes: { href } });
}

function draftMessage(profile, { topic, residentName, hometown }) {
  const resident = residentName.trim() || 'A constituent';
  const place = hometown.trim() ? ` in ${hometown.trim()}` : '';
  return `Dear ${profile.name},\n\nMy name is ${resident}, and I am a constituent${place}. I am writing about ${topic}. Please let me know what actions your office is taking on this issue.\n\nThank you for your public service.\n\nSincerely,\n${resident}`;
}

function openDraft(profile) {
  const dialog = document.querySelector('#draft-dialog');
  const body = document.querySelector('#draft-body');
  if (!dialog || !body) return;
  const topic = element('select', { id: 'draft-topic' });
  ['antisemitism and community safety', 'Israel-related legislation', 'a local community concern', 'another issue'].forEach((label) => topic.append(element('option', { text: label, attributes: { value: label } })));
  const residentName = element('input', { id: 'draft-name', type: 'text', attributes: { placeholder: 'Your name', autocomplete: 'name' } });
  const hometown = element('input', { id: 'draft-hometown', type: 'text', attributes: { placeholder: 'Your city or neighborhood', autocomplete: 'address-level2' } });
  const output = element('textarea', { id: 'draft-output', attributes: { rows: '10', 'aria-label': 'Editable message draft' } });
  const rebuild = () => { output.value = draftMessage(profile, { topic: topic.value, residentName: residentName.value, hometown: hometown.value }); };
  [topic, residentName, hometown].forEach((control) => control.addEventListener('input', rebuild));
  rebuild();
  const copy = button('Copy message', 'button');
  copy.addEventListener('click', () => copyText(output.value, 'Message'));
  const destination = profile.contact.email
    ? contactAction('Open email', `mailto:${profile.contact.email}?subject=${encodeURIComponent(`Constituent message about ${topic.value}`)}&body=${encodeURIComponent(output.value)}`, 'button write-action')
    : (profile.contact.website ? openSafeLink('Open official website', profile.contact.website, 'button write-action') : null);
  const actions = element('div', { className: 'actions' });
  actions.append(copy);
  if (destination) actions.append(destination);
  body.replaceChildren(
    element('p', { className: 'muted', text: 'This editable draft stays on your device until you choose where to send it.' }),
    element('label', { className: 'field-label', text: 'Topic', attributes: { for: 'draft-topic' } }), topic,
    element('label', { className: 'field-label', text: 'Your name', attributes: { for: 'draft-name' } }), residentName,
    element('label', { className: 'field-label', text: 'City or neighborhood', attributes: { for: 'draft-hometown' } }), hometown,
    element('label', { className: 'field-label', text: 'Message', attributes: { for: 'draft-output' } }), output,
    actions,
  );
  dialog.showModal();
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
  const profileTitleRow = element('div', { className: 'profile-title-row' });
  profileTitleRow.append(portraitWithBullet(profile));
  const primaryActions = element('div', { className: 'profile-actions' });
  if (profile.contact.phone) primaryActions.append(contactAction(`Call ${profile.contact.phone}`, `tel:${profile.contact.phone.replace(/[^\d+]/g, '')}`, 'button call-action'));
  const write = button('Write to this office', 'button write-action');
  write.addEventListener('click', () => openDraft(profile));
  primaryActions.append(write);
  profilePanel.append(profileTitleRow, primaryActions, element('h2', { text: 'Responsibilities' }));
  const responsibilityList = element('ul', { className: 'responsibility-list' });
  profile.responsibilities.forEach((responsibility) => responsibilityList.append(element('li', { text: responsibility })));
  profilePanel.append(responsibilityList, element('h2', { text: 'Contact actions' }));
  const contactList = element('ul', { className: 'contact-list' });
  const websiteRow = element('li');
  websiteRow.append(element('span', { className: 'contact-label', text: 'Website' }), profile.contact.website ? openSafeLink('Open website', profile.contact.website) : element('span', { text: 'Not provided' }));
  const emailRow = element('li');
  const emailLink = profile.contact.email ? element('a', { text: profile.contact.email, attributes: { href: `mailto:${profile.contact.email}` } }) : element('span', { text: 'Not provided' });
  emailRow.append(element('span', { className: 'contact-label', text: 'Email' }), emailLink);
  if (profile.contact.email) { const copy = button('Copy', 'copy-button'); copy.addEventListener('click', () => copyText(profile.contact.email, 'Email')); emailRow.append(copy); }
  const phoneRow = element('li');
  const phoneLink = profile.contact.phone ? element('a', { text: profile.contact.phone, attributes: { href: `tel:${profile.contact.phone}` } }) : element('span', { text: 'Not provided' });
  phoneRow.append(element('span', { className: 'contact-label', text: 'Phone' }), phoneLink);
  if (profile.contact.phone) { const copy = button('Copy', 'copy-button'); copy.addEventListener('click', () => copyText(profile.contact.phone, 'Phone')); phoneRow.append(copy); }
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
    card.append(element('h3', { text: formatTopic(record.topic) }));
    if (demoMode) card.append(element('p', { className: 'position', text: `Position: ${formatPosition(record.position)}` }));
    card.append(element('p', { text: record.finding }));
    const meta = element('p', { className: 'evidence-meta' });
    const addMetadata = (text) => meta.append(element('span', { className: 'evidence-meta-item', text }));
    if (record.date) addMetadata(`Date: ${record.date}`);
    if (demoMode) {
      addMetadata(`Evidence: ${record.evidenceType}`);
    } else {
      if (record.actionType) addMetadata(`Action: ${formatActionType(record.actionType)}`);
      if (record.measure?.identifier) addMetadata(`Measure: ${record.measure.identifier}${record.measure.title ? ` — ${record.measure.title}` : ''}`);
      if (record.action?.classification) addMetadata(`Classification: ${record.action.classification}`);
      if (record.action?.option) addMetadata(`Vote: ${record.action.option}`);
      if (record.action?.motion) addMetadata(`Motion: ${record.action.motion}`);
      if (record.action?.result) addMetadata(`Result: ${record.action.result}`);
    }
    card.append(meta);
    const sourceActions = element('div', { className: 'inline-actions' });
    const sources = Array.isArray(record.sources) ? record.sources : (record.source ? [record.source] : []);
    sources.forEach((source) => {
      const label = source.publisher || source.title || 'Official source';
      sourceActions.append(openSafeLink(`Open source: ${label}`, source.url, 'button secondary'));
    });
    if (sources.length > 0) card.append(sourceActions);
    if (demoMode) card.append(element('p', { className: 'verification', text: `Verification: ${record.verification.status} · ${record.verification.note} · checked ${record.verification.verifiedAt}` }));
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

initAppearance();
initApiSettings();
render();
