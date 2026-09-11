/* ==========================================================================
   Know Your Officials — application
   --------------------------------------------------------------------------
   Address -> districts -> officials, entirely in the browser. There is no
   server: the roster is a static file, and the district lookup calls public
   key-free services that send CORS headers.

     * NYC Planning GeoSearch    — address -> coordinates (New York City)
     * Nominatim / OpenStreetMap — address -> coordinates (everywhere else)
     * Zippopotam.us             — ZIP code -> coordinates
     * Census TIGERweb (ArcGIS)  — coordinates -> official district boundaries

   No sentence text belongs in this file. All copy lives in assets/copy.js and
   is read through COPY.
   ========================================================================== */

'use strict';

/* ─────────────────────────  Endpoints and settings  ───────────────────────── */

const GEOSEARCH = 'https://geosearch.planninglabs.nyc/v2/search';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const ZIPPO = 'https://api.zippopotam.us/us';
const TIGERWEB = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Legislative/MapServer';

const SOURCE_LINKS = {
  openstates: 'https://openstates.org/',
  congress: 'https://github.com/unitedstates/congress-legislators',
};

/* TIGERweb layer ids for the districts currently in effect. */
const TIGER_LAYERS = { congress: 0, senate: 1, assembly: 2 };

/* The roster currently covers one state, so the boundary lookup is scoped to
   it. Widening coverage means loading more officials and relaxing this. */
const COVERED_STATE_FIPS = '36';

const LEVEL_ORDER = { state: 0, federal: 1 };

const STORE = {
  last: 'kyo.lastSearch.v1',
  theme: 'kyo.theme.v1',
  textsize: 'kyo.textsize.v1',
};

/* ─────────────────────────  Small helpers  ───────────────────────── */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Build an element from a tag, attributes and children. */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

const ICONS = {
  phone: 'M6.6 2.5a1.5 1.5 0 011.4 1l.8 2a1.5 1.5 0 01-.4 1.7l-1 .9a11 11 0 004.6 4.6l.9-1a1.5 1.5 0 011.7-.4l2 .8a1.5 1.5 0 011 1.4v2.1a1.5 1.5 0 01-1.7 1.5A15.5 15.5 0 013.4 5.2 1.5 1.5 0 014.9 3.5h1.7z',
  mail: 'M3 5.5h18v13H3zM3 6l9 6.5L21 6',
  pin: 'M12 21s7-5.8 7-11a7 7 0 10-14 0c0 5.2 7 11 7 11z M12 12.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  globe: 'M12 3a9 9 0 100 18 9 9 0 000-18z M3.5 9h17 M3.5 15h17 M12 3c2.5 2.4 3.8 5.5 3.8 9s-1.3 6.6-3.8 9c-2.5-2.4-3.8-5.5-3.8-9S9.5 5.4 12 3z',
  check: 'M4 12.5l5 5L20 6.5',
  info: 'M12 3a9 9 0 100 18 9 9 0 000-18z M12 11v6 M12 7.5v.5',
  chev: 'M6 9l6 6 6-6',
  arrow: 'M5 12h13 M13 6l6 6-6 6',
  doc: 'M6 3h8l4 4v14H6z M14 3v4h4',
};

function icon(name, size = 18, stroke = 2) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', size);
  svg.setAttribute('height', size);
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', stroke);
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name] || '');
  svg.append(path);
  return svg;
}

function initials(name) {
  return name
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter((part) => /[A-Za-z]/.test(part))
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

function formatDate(iso, opts = { dateStyle: 'medium' }) {
  if (!iso) return COPY.time.unknown;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(COPY.locale, opts).format(date);
}

function relativeTime(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hours = Math.round((Date.now() - date.getTime()) / 36e5);
  if (hours < 1) return COPY.time.justNow;
  if (hours < 24) return COPY.time.hoursAgo(hours);
  const days = Math.round(hours / 24);
  return days === 1 ? COPY.time.yesterday : COPY.time.daysAgo(days);
}

let flashTimer;
function flash(message) {
  const node = $('#toast');
  node.textContent = message;
  node.hidden = false;
  clearTimeout(flashTimer);
  flashTimer = setTimeout(() => { node.hidden = true; }, 2800);
}

async function copyText(value, label) {
  try {
    await navigator.clipboard.writeText(value);
    flash(COPY.toast.copied(label));
  } catch {
    flash(COPY.toast.copyFailed);
  }
}

function readStore(key, fallback = null) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

function writeStore(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private browsing */ }
}

async function getJSON(url, { timeout = 12000 } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

/* ─────────────────────────  Copy binding  ───────────────────────── */

/** Fill every data-copy hook in the markup from COPY.ui. */
function applyCopy(root = document) {
  document.title = COPY.document.title;
  for (const node of $$('[data-copy]', root)) {
    node.textContent = COPY.ui[node.dataset.copy] ?? '';
  }
  for (const node of $$('[data-copy-placeholder]', root)) {
    node.placeholder = COPY.ui[node.dataset.copyPlaceholder] ?? '';
  }
  for (const node of $$('[data-copy-aria]', root)) {
    node.setAttribute('aria-label', COPY.ui[node.dataset.copyAria] ?? '');
  }
}

/* ─────────────────────────  Application state  ───────────────────────── */

const state = {
  snapshot: null,
  /** Result of the latest lookup: { query, location, districts, officials }. */
  lookup: null,
  filters: { level: new Set(), office: new Set(), party: new Set(), contact: new Set() },
  sort: 'level',
  mode: 'address',
};

/* ─────────────────────────  Appearance controls  ───────────────────────── */

/* "Auto" follows the operating system. The stylesheet reads these two
   attributes on <html>, so setting them is the whole implementation. */

function setupSwitch(selector, attribute, storeKey, fallback) {
  const key = attribute.replace('data-', '');
  const chosen = readStore(storeKey, fallback);
  document.documentElement.setAttribute(attribute, chosen);

  const buttons = $$('button', $(selector));
  const paint = (value) => {
    for (const button of buttons) {
      button.setAttribute('aria-pressed', String(button.dataset[key] === value));
    }
  };
  paint(chosen);

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const root = document.documentElement;
      /* Suspend transitions for a frame, or every colour animates at once
         and the page washes through grey on the way. */
      root.classList.add('is-swapping');
      root.setAttribute(attribute, button.dataset[key]);
      writeStore(storeKey, button.dataset[key]);
      paint(button.dataset[key]);
      requestAnimationFrame(() => root.classList.remove('is-swapping'));
    });
  }
}

function initAppearance() {
  setupSwitch('#theme-switch', 'data-theme', STORE.theme, 'system');
  setupSwitch('#textsize-switch', 'data-textsize', STORE.textsize, 'normal');
}

/* ─────────────────────────  Snapshot  ───────────────────────── */

function officialById(id) {
  return (state.snapshot?.officials || []).find((official) => official.id === id) || null;
}

async function loadSnapshot() {
  if (window.__OFFICIALS_SNAPSHOT__) return window.__OFFICIALS_SNAPSHOT__;
  return getJSON('data/officials.json', { timeout: 15000 });
}

function stateName(code = state.snapshot?.state) {
  return COPY.states[code] || code || '';
}

/* ─────────────────────────  Geography lookup  ───────────────────────── */

/**
 * Point-in-polygon lookup against the Census TIGERweb boundary service.
 * One request per layer, in parallel; a failed layer degrades that district
 * rather than the whole search.
 */
async function districtsForPoint(lon, lat) {
  const entries = await Promise.all(
    Object.entries(TIGER_LAYERS).map(async ([key, layer]) => {
      const url = `${TIGERWEB}/${layer}/query?geometry=${lon},${lat}`
        + '&geometryType=esriGeometryPoint&inSR=4326&spatialRel=esriSpatialRelIntersects'
        + '&outFields=NAME,BASENAME,GEOID,STATE&returnGeometry=false&f=json';
      try {
        const data = await getJSON(url, { timeout: 15000 });
        const attrs = data?.features?.[0]?.attributes;
        if (!attrs) return [key, null];
        const geoid = String(attrs.GEOID || '');
        if (String(attrs.STATE || geoid.slice(0, 2)) !== COVERED_STATE_FIPS) return [key, null];
        return [key, { name: attrs.NAME || '', number: String(attrs.BASENAME || '').replace(/^0+/, '') }];
      } catch {
        return [key, null];
      }
    }),
  );
  return Object.fromEntries(entries.filter(([, value]) => value));
}

/* GeoSearch covers only the five boroughs, and for an address outside them it
   returns a same-numbered city street with full confidence — "100 Popham Rd,
   Scarsdale" comes back as "100 Gunhill Road, Bronx". Its confidence and
   match_type fields look identical for good and bad hits, so we check the
   street name ourselves before trusting the result. */

const STREET_SUFFIXES = new Set([
  'street', 'st', 'avenue', 'ave', 'av', 'boulevard', 'blvd', 'road', 'rd', 'drive', 'dr',
  'lane', 'ln', 'place', 'pl', 'court', 'ct', 'terrace', 'ter', 'parkway', 'pkwy', 'plaza',
  'square', 'sq', 'way', 'circle', 'cir', 'highway', 'hwy', 'expressway', 'north', 'south',
  'east', 'west', 'n', 's', 'e', 'w',
]);

/** Lower-case word tokens, with ordinals normalised so "5th" matches "5". */
function addressTokens(text) {
  return new Set(
    String(text)
      .toLowerCase()
      .replace(/(\d+)(st|nd|rd|th)\b/g, '$1')
      .split(/[^a-z0-9]+/)
      .filter(Boolean),
  );
}

function isPlausibleCityMatch(query, properties) {
  const street = properties?.street;
  if (!street) return false;
  const queryTokens = addressTokens(query);
  const distinctive = [...addressTokens(street)].filter((token) => !STREET_SUFFIXES.has(token));
  if (distinctive.length === 0) return false;
  return distinctive.some((token) => queryTokens.has(token));
}

/** Resolve free text to { label, locality, lon, lat, via, approximate }. */
async function geocode(query) {
  const trimmed = query.trim();

  if (/^\d{5}$/.test(trimmed)) {
    const data = await getJSON(`${ZIPPO}/${trimmed}`);
    const place = data?.places?.[0];
    if (!place) throw new Error(COPY.errors.codes.notFound);
    return {
      label: `${place['place name']}, ${place['state abbreviation']} ${trimmed}`,
      locality: place['place name'],
      lon: Number(place.longitude),
      lat: Number(place.latitude),
      via: 'Zippopotam.us',
      approximate: true,
    };
  }

  try {
    const data = await getJSON(`${GEOSEARCH}?size=1&text=${encodeURIComponent(trimmed)}`);
    const feature = data?.features?.[0];
    if (feature?.geometry?.coordinates && isPlausibleCityMatch(trimmed, feature.properties)) {
      const [lon, lat] = feature.geometry.coordinates;
      return {
        label: feature.properties?.label || trimmed,
        locality: feature.properties?.borough || feature.properties?.locality || '',
        lon,
        lat,
        via: 'NYC Planning GeoSearch',
      };
    }
  } catch { /* not a city address — fall through to the wider geocoder */ }

  const results = await getJSON(
    `${NOMINATIM}?format=jsonv2&countrycodes=us&limit=1&q=${encodeURIComponent(trimmed)}`,
    { timeout: 20000 },
  );
  const hit = Array.isArray(results) ? results[0] : null;
  if (!hit) throw new Error(COPY.errors.codes.notFound);
  return {
    label: hit.display_name.replace(/, United States$/, ''),
    locality: hit.display_name.split(',')[2]?.trim() || '',
    lon: Number(hit.lon),
    lat: Number(hit.lat),
    via: 'OpenStreetMap / Nominatim',
  };
}

/** Full pipeline: query -> matched location, districts and officials. */
async function lookup(query) {
  const location = await geocode(query);
  const districts = await districtsForPoint(location.lon, location.lat);

  if (!districts.congress && !districts.senate && !districts.assembly) {
    throw new Error(COPY.errors.codes.outside);
  }

  const code = state.snapshot.state;
  const keys = [];
  if (districts.congress) keys.push(`${code}-CD-${districts.congress.number.padStart(2, '0')}`);
  if (districts.senate) keys.push(`${code}-SLDU-${districts.senate.number.padStart(3, '0')}`);
  if (districts.assembly) keys.push(`${code}-SLDL-${districts.assembly.number.padStart(3, '0')}`);
  keys.push(`${code}-SEN`); // both US Senators represent every address in the state

  const index = state.snapshot.districtIndex || {};
  const officials = keys.flatMap((key) => index[key] || []).map(officialById).filter(Boolean);

  if (officials.length === 0) throw new Error(COPY.errors.codes.outside);

  return { query, location, districts, officials };
}

/* ─────────────────────────  Describing an official  ───────────────────────── */

/* Colour carries level of government and nothing else. Party is always a
   word, so no one has to decode a red or blue badge. */

function levelKey(official) {
  if (official.level === 'federal') return 'federal';
  return official.body.includes('Senate') ? 'senate' : 'assembly';
}

function isStatewide(official) {
  return /-SEN$/.test(official.districtKey || '');
}

function officialStateCode(official) {
  return (official.districtKey || '').split('-')[0];
}

/** The chamber name this official's own state uses. */
function chamberLabel(official) {
  if (official.body.includes('Senate')) return COPY.chambers.upper;
  const rule = COPY.chambers.lower.find((entry) => entry.match.test(official.body));
  return rule ? rule.label : COPY.chambers.lowerFallback;
}

function routeBullet(official, size = '') {
  return el(
    'span',
    { class: `bullet level-${levelKey(official)} ${size}`.trim(), 'aria-hidden': 'true' },
    isStatewide(official) ? officialStateCode(official) : official.district,
  );
}

function partyWord(official) {
  const raw = (official.party || '').trim();
  if (!raw) return COPY.official.partyUnlisted;
  /* Fusion voting means the raw field can read "Democratic/Working Families".
     Show the party a resident would recognise. */
  const primary = raw.split(/[/,]/)[0].trim();
  return COPY.parties[primary] || primary;
}

function partyDetail(official) {
  const raw = (official.party || '').trim();
  return raw && raw !== partyWord(official) ? COPY.official.partyLines(raw) : null;
}

/* Seniority ("Junior"/"Senior" Senator) is Capitol vocabulary and means
   nothing to a resident deciding who to call. */
function officeLabel(official) {
  return official.office.replace(/\s*\((?:Junior|Senior)\)\s*/i, '').trim();
}

/** Plain-language description of the seat. */
function seatLine(official) {
  if (isStatewide(official)) return COPY.official.seatStatewide(stateName());
  if (official.level === 'federal') return COPY.official.seatCongress(official.district);
  return COPY.official.seatChamber(chamberLabel(official), official.district);
}

/** The same seat, phrased to sit inside a sentence in a letter. */
function districtLabel(official) {
  const name = stateName(officialStateCode(official));
  if (isStatewide(official)) return COPY.official.districtStatewide(name);
  if (official.level === 'federal') return COPY.official.districtCongress(name, official.district);
  return COPY.official.districtChamber(name, chamberLabel(official), official.district);
}

function hasLocalOffice(official) {
  return Boolean(official.addresses?.some((entry) => /district/i.test(entry.label)));
}

function officialWebsite(official) {
  return official.links?.find((link) => !/ballotpedia|wikipedia|votesmart|linkedin|\?sh=email/i.test(link));
}

function portrait(official, big = false) {
  const wrap = el('span', { class: 'portrait' });
  const letters = () => el('span', { class: 'portrait-img is-letters', 'aria-hidden': 'true' }, initials(official.name));

  if (official.photo) {
    const img = el('img', {
      class: 'portrait-img',
      src: official.photo,
      alt: COPY.official.photoAlt(official.name),
      loading: 'lazy',
      referrerpolicy: 'no-referrer',
    });
    // Headshot URLs on legislature sites rotate; fall back to initials.
    img.addEventListener('error', () => img.replaceWith(letters()), { once: true });
    wrap.append(img);
  } else {
    wrap.append(letters());
  }

  wrap.append(routeBullet(official, big ? '' : 'is-small'));
  return wrap;
}

function cardFacts(official) {
  const facts = [
    el('span', { class: 'fact party-word', title: partyDetail(official) }, partyWord(official)),
  ];
  const phone = official.phones?.[0]?.value;
  if (phone) facts.push(el('span', { class: 'fact fact-tel' }, icon('phone', 12, 2), phone));
  if (official.email) {
    facts.push(el('span', { class: 'fact' }, icon('mail', 12, 2), COPY.official.factEmail));
  } else if (official.contactForm) {
    facts.push(el('span', { class: 'fact' }, icon('mail', 12, 2), COPY.official.factWebForm));
  }
  if (hasLocalOffice(official)) {
    facts.push(el('span', { class: 'fact fact-local' }, icon('pin', 12, 2), COPY.official.factLocalOffice));
  }
  return facts;
}

function officialCard(official) {
  return el(
    'li',
    {},
    el(
      'article',
      { class: 'card' },
      el('a', {
        class: 'card-hit',
        href: `#/official/${encodeURIComponent(official.id)}`,
        'aria-label': COPY.official.cardAria(official.name, officeLabel(official), seatLine(official)),
      }),
      portrait(official),
      el(
        'div',
        {},
        el('h3', { class: 'card-name' }, official.name),
        el('p', { class: 'card-role' }, COPY.official.cardRole(officeLabel(official), seatLine(official))),
        el('div', { class: 'card-facts' }, cardFacts(official)),
      ),
      el('span', { class: 'goarrow', 'aria-hidden': 'true' }, icon('arrow', 20, 2.2)),
    ),
  );
}

/* ─────────────────────────  Router  ───────────────────────── */

const SCREENS = ['home', 'results', 'official', 'loading'];

function showScreen(name) {
  for (const screen of SCREENS) $(`#view-${screen}`).hidden = screen !== name;
}

function parseHash() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const [path, queryString] = hash.split('?');
  return {
    segments: path.split('/').filter(Boolean),
    params: new URLSearchParams(queryString || ''),
  };
}

async function route() {
  const { segments, params } = parseHash();
  const [first, second] = segments;

  if (first === 'results') {
    const query = params.get('q') || '';
    if (!query) { location.hash = '#/'; return; }
    await renderResults(query);
    return;
  }
  if (first === 'official' && second) { renderOfficial(decodeURIComponent(second)); return; }

  showScreen('home');
  window.scrollTo({ top: 0 });
}

/* ─────────────────────────  Screen 1 · Search  ───────────────────────── */

function initSearchForms() {
  const form = $('#home-search');
  const input = $('#home-q');
  const label = $('.finder-label', form);
  const note = $('#home-note');

  const applyMode = (mode) => {
    state.mode = mode;
    for (const button of $$('#mode-switch button')) {
      button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    }
    const zip = mode === 'zip';
    label.textContent = zip ? COPY.home.zipLabel : COPY.home.addressLabel;
    input.placeholder = zip ? COPY.home.zipPlaceholder : COPY.home.addressPlaceholder;
    input.inputMode = zip ? 'numeric' : 'text';
    input.autocomplete = zip ? 'postal-code' : 'street-address';
  };

  for (const button of $$('#mode-switch button')) {
    button.addEventListener('click', () => {
      applyMode(button.dataset.mode);
      input.focus();
    });
  }
  applyMode('address');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = input.value.trim();
    note.classList.remove('is-wrong');
    note.textContent = COPY.ui['home.privacy'];
    if (query.length < 4) {
      note.textContent = COPY.home.tooShort;
      note.classList.add('is-wrong');
      input.focus();
      return;
    }
    location.hash = `#/results?q=${encodeURIComponent(query)}`;
  });

  $('#results-search').addEventListener('submit', (event) => {
    event.preventDefault();
    const query = $('#results-q').value.trim();
    if (query.length < 4) return;
    location.hash = `#/results?q=${encodeURIComponent(query)}`;
  });

  const last = readStore(STORE.last);
  if (last) input.value = last;
}

/* ─────────────────────────  Screen 2 · Results  ───────────────────────── */

async function renderResults(query) {
  $('#results-q').value = query;

  if (!state.lookup || state.lookup.query !== query) {
    showScreen('loading');
    const trimmed = query.trim();
    $('#loading-text').textContent = /^\d{5}$/.test(trimmed)
      ? COPY.results.loadingZip(trimmed)
      : COPY.results.loadingAddress;
    try {
      state.lookup = await lookup(query);
      state.filters = { level: new Set(), office: new Set(), party: new Set(), contact: new Set() };
      writeStore(STORE.last, query);
    } catch (error) {
      renderLookupProblem(query, error);
      return;
    }
  }

  showScreen('results');
  renderDistricts();
  buildFilters();
  applyFilters();
  window.scrollTo({ top: 0 });
}

/* Three different failures, three different things to do about them. */
function renderLookupProblem(query, error) {
  showScreen('results');
  $('#district-summary').replaceChildren();
  $('#official-list').replaceChildren();
  $('#results-count').textContent = '';

  const outside = error.message === COPY.errors.codes.outside;
  const notFound = error.message === COPY.errors.codes.notFound;

  const title = outside ? COPY.errors.outsideTitle
    : notFound ? COPY.errors.notFoundTitle
      : COPY.errors.slowTitle;
  const body = outside ? COPY.errors.outsideBody(query)
    : notFound ? COPY.errors.notFoundBody(query)
      : COPY.errors.slowBody(query);

  const box = $('#results-empty');
  box.hidden = false;
  box.replaceChildren(
    el('h2', {}, title),
    el('p', {}, body),
    el(
      'div',
      { class: 'nothing-acts' },
      /* Retrying only helps when the address itself was fine. */
      outside ? null : el('button', {
        class: 'action action-go',
        type: 'button',
        onclick: () => { state.lookup = null; renderResults(query); },
      }, COPY.errors.tryAgain),
      el('a', { class: `action ${outside ? 'action-go' : 'action-plain'}`, href: '#/' },
        COPY.errors.searchAnother),
    ),
  );
}

/* States do not agree on what the lower chamber is called, so take the name
   from the officials we actually matched rather than assuming. */
function lowerChamberCaption(officials) {
  const lower = officials.find((o) => o.level !== 'federal' && !o.body.includes('Senate'));
  return lower ? chamberLabel(lower) : COPY.chambers.lowerFallback;
}

function renderDistricts() {
  const { location, districts, officials } = state.lookup;
  const parts = [];

  const add = (caption, number, level) => {
    if (!number) return;
    parts.push(el(
      'span',
      { class: 'district' },
      el('span', { class: `bullet level-${level}`, 'aria-hidden': 'true' }, number),
      el('span', { class: 'district-text' },
        el('b', {}, COPY.results.districtNumber(number)),
        el('i', {}, caption)),
    ));
  };
  add(COPY.results.captionCongress, districts.congress?.number, 'federal');
  add(COPY.chambers.upper, districts.senate?.number, 'senate');
  add(lowerChamberCaption(officials), districts.assembly?.number, 'assembly');

  $('#district-summary').replaceChildren(
    el('div', { class: 'districts-row' },
      el('p', { class: 'districts-where' },
        location.approximate ? COPY.results.coveringPrefix : COPY.results.matchedPrefix,
        el('b', {}, location.label)),
      ...parts),
    el(
      'div',
      { class: 'districts-notes' },
      el('span', { class: 'verified-chip', title: COPY.results.chipBoundariesTitle(location.via) },
        icon('check', 13, 2.6), COPY.results.chipBoundaries),
      location.approximate
        ? el('span', { class: 'caveat', title: COPY.results.chipApproximateTitle },
            icon('info', 13, 2.2), COPY.results.chipApproximate)
        : null,
    ),
  );
}

const FILTER_GROUPS = [
  { key: 'level', target: '#filter-level', of: (o) => o.levelLabel },
  { key: 'office', target: '#filter-office', of: (o) => officeLabel(o) },
  { key: 'party', target: '#filter-party', of: (o) => partyWord(o) },
];

function buildFilters() {
  const officials = state.lookup.officials;

  for (const group of FILTER_GROUPS) {
    const counts = new Map();
    for (const official of officials) {
      const value = group.of(official);
      counts.set(value, (counts.get(value) || 0) + 1);
    }
    const container = $(group.target);
    container.replaceChildren(
      ...Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([value, count]) => tickRow(group.key, value, value, count)),
    );

    /* A group only earns its space if it genuinely groups: two or more
       options, and fewer options than results. One checkbox per official is
       just the list again, in a smaller font. */
    const useful = counts.size >= 2 && counts.size < officials.length;
    container.closest('.narrow-group').hidden = !useful;
    if (!useful) state.filters[group.key].clear();
  }

  $('#filter-contact').replaceChildren(
    tickRow('contact', 'phone', COPY.results.contact.phone,
      officials.filter((o) => o.phones?.length).length),
    tickRow('contact', 'email', COPY.results.contact.email,
      officials.filter((o) => o.email || o.contactForm).length),
    tickRow('contact', 'district', COPY.results.contact.local,
      officials.filter(hasLocalOffice).length),
  );

  $('#filter-reset').onclick = () => {
    state.filters = { level: new Set(), office: new Set(), party: new Set(), contact: new Set() };
    for (const input of $$('.narrow-body input[type="checkbox"]')) input.checked = false;
    applyFilters();
  };

  $('#results-sort').onchange = (event) => {
    state.sort = event.target.value;
    applyFilters();
  };
}

function tickRow(group, value, label, count) {
  return el(
    'label',
    { class: 'tick' },
    el('input', {
      type: 'checkbox',
      checked: state.filters[group].has(value),
      onchange: (event) => {
        if (event.target.checked) state.filters[group].add(value);
        else state.filters[group].delete(value);
        applyFilters();
      },
    }),
    el('span', {}, label),
    el('span', { class: 'tick-n' }, count),
  );
}

function matchesFilters(official) {
  const { level, office, party, contact } = state.filters;
  if (level.size && !level.has(official.levelLabel)) return false;
  if (office.size && !office.has(officeLabel(official))) return false;
  if (party.size && !party.has(partyWord(official))) return false;
  if (contact.has('phone') && !official.phones?.length) return false;
  if (contact.has('email') && !official.email && !official.contactForm) return false;
  if (contact.has('district') && !hasLocalOffice(official)) return false;
  return true;
}

function sortOfficials(list) {
  const sorted = [...list];
  if (state.sort === 'name') {
    sorted.sort((a, b) => a.name.localeCompare(b.name));
  } else if (state.sort === 'party') {
    sorted.sort((a, b) => partyWord(a).localeCompare(partyWord(b)) || a.name.localeCompare(b.name));
  } else {
    // "Closest to home": local state offices before statewide and federal ones.
    sorted.sort((a, b) => (LEVEL_ORDER[a.level] ?? 9) - (LEVEL_ORDER[b.level] ?? 9)
      || a.office.localeCompare(b.office));
  }
  return sorted;
}

function applyFilters() {
  const all = state.lookup.officials;
  const visible = sortOfficials(all.filter(matchesFilters));

  $('#official-list').replaceChildren(...visible.map(officialCard));

  $('#results-count').replaceChildren(
    el('b', {}, String(visible.length)),
    visible.length === all.length
      ? COPY.results.countAll(visible.length)
      : COPY.results.countFiltered(visible.length, all.length),
  );

  const empty = $('#results-empty');
  if (visible.length === 0) {
    empty.hidden = false;
    empty.replaceChildren(
      el('h2', {}, COPY.results.noMatchTitle),
      el('p', {}, COPY.results.noMatchBody(all.length)),
      el('div', { class: 'nothing-acts' },
        el('button', { class: 'action action-go', type: 'button', onclick: () => $('#filter-reset').click() },
          COPY.results.noMatchAction)),
    );
  } else {
    empty.hidden = true;
    empty.replaceChildren();
  }
}

/* ─────────────────────────  Screen 3 · Official  ───────────────────────── */

function renderOfficial(id) {
  const official = officialById(id);
  if (!official) { location.hash = '#/'; return; }

  const back = $('#crumb-back');
  back.href = state.lookup ? `#/results?q=${encodeURIComponent(state.lookup.query)}` : '#/';
  back.textContent = state.lookup ? COPY.official.back : COPY.official.backFresh;

  $('#official-layout').replaceChildren(dossier(official), folderColumn(official));
  showScreen('official');
  window.scrollTo({ top: 0 });
}

function dossier(official) {
  const website = officialWebsite(official);
  const phone = official.phones?.[0];

  const lines = [];
  for (const entry of official.phones || []) {
    lines.push(reachLine('phone', entry.label,
      el('a', { href: `tel:${entry.value.replace(/[^\d+]/g, '')}` }, entry.value),
      entry.value, { tel: true }));
  }
  if (official.email) {
    lines.push(reachLine('mail', COPY.official.reachEmail,
      el('a', { href: `mailto:${official.email}` }, official.email), official.email));
  } else if (official.contactForm) {
    lines.push(reachLine('mail', COPY.official.reachContactForm,
      el('a', { href: official.contactForm, target: '_blank', rel: 'noopener' },
        COPY.official.reachContactFormAction)));
  }
  for (const entry of official.addresses || []) {
    lines.push(reachLine('pin', entry.label, entry.value, entry.value));
  }
  if (website) {
    lines.push(reachLine('globe', COPY.official.reachWebsite,
      el('a', { href: website, target: '_blank', rel: 'noopener' }, website.replace(/^https?:\/\//, ''))));
  }

  const socialBases = {
    twitter: 'https://twitter.com/', facebook: 'https://facebook.com/',
    instagram: 'https://instagram.com/', youtube: 'https://youtube.com/',
  };
  const socials = Object.entries(official.socials || {})
    .filter(([key]) => socialBases[key])
    .map(([key, handle]) => el(
      'a',
      { href: socialBases[key] + handle, target: '_blank', rel: 'noopener' },
      key === 'twitter' ? COPY.official.socialTwitter(handle) : key[0].toUpperCase() + key.slice(1),
    ));

  return el(
    'aside',
    { class: 'dossier' },
    el(
      'div',
      { class: 'dossier-top' },
      portrait(official, true),
      el('h1', { class: 'dossier-name' }, official.name),
      el('p', { class: 'dossier-role' }, COPY.official.role(officeLabel(official), official.body)),
      el(
        'div',
        { class: 'dossier-meta' },
        el('span', { class: 'fact party-word', title: partyDetail(official) }, partyWord(official)),
        el('span', { class: 'fact' }, seatLine(official)),
        official.termEnd
          ? el('span', { class: 'fact' },
              COPY.official.termEnds(formatDate(official.termEnd, { year: 'numeric', month: 'short' })))
          : null,
      ),
    ),
    el(
      'div',
      { class: 'dossier-acts' },
      phone
        ? el('a', { class: 'action action-call action-tel', href: `tel:${phone.value.replace(/[^\d+]/g, '')}` },
            icon('phone', 18, 2), COPY.official.call(phone.value))
        : null,
      el('button', { class: 'action action-write', type: 'button', onclick: () => openDraft(official) },
        icon('mail', 18, 2), COPY.official.write),
    ),
    el('div', { class: 'reach' },
      el('h3', {}, COPY.official.reachHeading),
      ...lines,
      socials.length ? el('div', { class: 'socials' }, ...socials) : null),
  );
}

function reachLine(iconName, label, value, copyValue, { tel = false } = {}) {
  return el(
    'div',
    { class: 'reach-line' },
    el('span', { class: 'reach-ico' }, icon(iconName, 18, 1.9)),
    el('div', { class: 'reach-text' },
      el('div', { class: 'reach-label' }, label),
      el('div', { class: `reach-value ${tel ? 'is-tel' : ''}`.trim() }, value)),
    copyValue
      ? el('button', {
          class: 'copy',
          type: 'button',
          title: COPY.official.copyTitle(label),
          onclick: () => copyText(copyValue, label),
        }, COPY.official.copy)
      : null,
  );
}

/* ─────────────────────────  The three folders  ───────────────────────── */

/* Each folder links out to the authoritative page, so anything a resident
   repeats in a meeting can be checked at the source. Titles, descriptions and
   destinations all live together in COPY.folders. */

function linkContext(official) {
  return {
    bioguide: official.id.startsWith('congress-') ? official.id.replace('congress-', '') : '',
    name: official.name,
    website: officialWebsite(official),
    isSenate: official.body.includes('Senate'),
    chamberPage: official.links?.find((link) => /assembly|house/i.test(link)),
    ballotpedia: official.sources?.find((source) => /ballotpedia/i.test(source))
      || `https://ballotpedia.org/${encodeURIComponent(official.name.replace(/\s+/g, '_'))}`,
  };
}

function linkRow(entry, context) {
  const href = entry.href(context);
  if (!href) return null;
  return el(
    'a',
    { class: 'linkrow', href, target: '_blank', rel: 'noopener' },
    el('span', { class: 'linkrow-ico' }, icon('doc', 17, 1.9)),
    el('span', { class: 'linkrow-text' }, el('b', {}, entry.title), el('span', {}, entry.desc)),
    el('span', { class: 'linkrow-go' }, icon('arrow', 17, 2)),
  );
}

function folder(section, entries, context, { open = false } = {}) {
  return el(
    'details',
    { class: 'folder', open: open || null },
    el('summary', {},
      el('span', { class: 'folder-mark' }, icon('chev', 15, 2.4)),
      el('span', { class: 'folder-title' },
        el('h2', {}, section.title),
        el('p', {}, section.subtitle))),
    el(
      'div',
      { class: 'folder-body' },
      el('div', { class: 'links' }, ...entries.map((entry) => linkRow(entry, context)).filter(Boolean)),
      el('div', { class: 'aside-note' }, icon('info', 16, 2),
        el('span', {}, el('b', {}, section.note.lead), ' ', section.note.rest)),
    ),
  );
}

function folderColumn(official) {
  const context = linkContext(official);
  const federal = official.level === 'federal';
  const { voting, issues, meetings } = COPY.folders;

  const votingLinks = federal
    ? [voting.links.federalSponsored, voting.links.federalVotes, voting.links.federalBio]
    : [context.isSenate ? voting.links.stateSponsoredUpper : voting.links.stateSponsoredLower,
      voting.links.stateHowVoted];

  const issuesLinks = [
    issues.links.ownSite,
    federal ? issues.links.committeesFederal : issues.links.committeesState,
    issues.links.independent,
  ];

  const meetingsLinks = federal
    ? [meetings.links.federalHearings, meetings.links.federalLocal]
    : [meetings.links.stateHearings, meetings.links.stateCalendar];

  return el(
    'div',
    {},
    el(
      'div',
      { class: 'folders' },
      folder(voting, votingLinks, context, { open: true }),
      folder(issues, issuesLinks, context),
      folder(meetings, meetingsLinks, context),
    ),
    receipt(official),
  );
}

function receipt(official) {
  const openStates = official.dataSource === 'openstates';
  const name = openStates ? COPY.official.sourceOpenStates : COPY.official.sourceCongress;
  const url = openStates ? SOURCE_LINKS.openstates : SOURCE_LINKS.congress;

  return el(
    'div',
    { class: 'receipt' },
    el('span', { class: 'verified-chip' }, icon('check', 13, 2.6), COPY.official.receiptChip),
    el('span', {}, COPY.official.receiptFrom,
      el('a', { href: url, target: '_blank', rel: 'noopener' }, name)),
    el('span', {}, COPY.official.receiptUpdated(
      formatDate(official.verifiedAt), relativeTime(official.verifiedAt))),
    official.sources?.length
      ? el('a', { href: official.sources[0], target: '_blank', rel: 'noopener' }, COPY.official.receiptOpen)
      : null,
  );
}

/* ─────────────────────────  Write to this office  ───────────────────────── */

function buildDraft(official, { channel, topic, name, hometown }) {
  const parts = {
    title: officeLabel(official),
    name: official.name,
    surname: official.name.split(' ').slice(-1)[0],
    district: districtLabel(official),
    home: hometown ? ` in ${hometown}` : '',
    sign: hometown ? `\n${hometown}` : '',
    signature: name || COPY.letters.placeholderName,
    topic: topic.label.toLowerCase(),
    ask: topic.ask,
  };
  if (channel === 'phone') return COPY.letters.script(parts);
  return topic.id === 'thanks' ? COPY.letters.thanks(parts) : COPY.letters.standard(parts);
}

/* Most offices publish a web form rather than an address, and a few publish
   neither — in that case send the resident to the official site. */
function sendButton(official, mailtoHref) {
  if (official.email) {
    return el('a', { class: 'action action-write', href: mailtoHref() }, COPY.draft.openEmail);
  }
  const target = official.contactForm || officialWebsite(official);
  if (!target) return null;
  return el(
    'a',
    { class: 'action action-write', href: target, target: '_blank', rel: 'noopener' },
    official.contactForm ? COPY.draft.openForm : COPY.draft.openSite,
  );
}

function openDraft(official) {
  const sheet = $('#draft-modal');

  const channel = el('select', { id: 'draft-channel' },
    el('option', { value: 'email' }, COPY.draft.channelEmail),
    el('option', { value: 'phone' }, COPY.draft.channelPhone));
  const topic = el('select', { id: 'draft-topic' },
    ...COPY.topics.map((entry) => el('option', { value: entry.id }, entry.label)));
  const name = el('input', { type: 'text', id: 'draft-name', placeholder: COPY.draft.namePlaceholder });
  const hometown = el('input', {
    type: 'text',
    id: 'draft-hometown',
    placeholder: COPY.draft.townPlaceholder,
    value: state.lookup?.location?.locality || '',
  });
  const output = el('textarea', { id: 'draft-output', spellcheck: 'false' });

  const chosenTopic = () => COPY.topics.find((entry) => entry.id === topic.value) || COPY.topics[0];
  const rebuild = () => {
    output.value = buildDraft(official, {
      channel: channel.value,
      topic: chosenTopic(),
      name: name.value.trim(),
      hometown: hometown.value.trim(),
    });
  };
  for (const control of [channel, topic, name, hometown]) control.addEventListener('input', rebuild);
  rebuild();

  const mailtoHref = () => `mailto:${official.email || ''}`
    + `?subject=${encodeURIComponent(COPY.draft.subject(chosenTopic().label))}`
    + `&body=${encodeURIComponent(output.value)}`;

  const field = (id, label, control, hint) => el(
    'div',
    { class: 'field' },
    el('label', { for: id }, label),
    control,
    hint ? el('p', { class: 'field-hint' }, hint) : null,
  );

  $('#draft-body').replaceChildren(
    el('p', { class: 'field-hint draft-intro' },
      COPY.draft.intro(official.name, seatLine(official))),
    field('draft-channel', COPY.draft.channelLabel, channel),
    field('draft-topic', COPY.draft.topicLabel, topic),
    field('draft-name', COPY.draft.nameLabel, name, COPY.draft.nameHint),
    field('draft-hometown', COPY.draft.townLabel, hometown),
    field('draft-output', COPY.draft.messageLabel, output),
    el(
      'div',
      { class: 'sheet-acts' },
      el('button', {
        class: 'action action-go',
        type: 'button',
        onclick: () => copyText(output.value, COPY.draft.messageNoun),
      }, COPY.draft.copyMessage),
      sendButton(official, mailtoHref),
      el('button', { class: 'action action-quiet', type: 'button', onclick: () => sheet.close() },
        COPY.draft.close),
    ),
  );

  if (typeof sheet.showModal === 'function') sheet.showModal();
  else sheet.setAttribute('open', '');
}

/* ─────────────────────────  Start  ───────────────────────── */

async function boot() {
  applyCopy();
  initAppearance();
  initSearchForms();

  showScreen('loading');

  try {
    state.snapshot = await loadSnapshot();
  } catch {
    showScreen('home');
    const note = $('#home-note');
    note.textContent = COPY.errors.directoryFailed;
    note.classList.add('is-wrong');
    return;
  }

  $('#footer-updated').textContent = COPY.footer.updated(formatDate(state.snapshot.generatedAt));

  window.addEventListener('hashchange', route);
  await route();
}

boot();
