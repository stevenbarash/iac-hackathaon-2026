const freezeMeasure = (measure) => Object.freeze({
  ...measure,
  topics: Object.freeze([...measure.topics]),
});

export const CATALOG_VERSION = 'ny-federal-pilot-v1';

export const STATE_MEASURES = Object.freeze([
  freezeMeasure({
    key: 'ny-j2143',
    provider: 'openstates',
    jurisdiction: 'New York',
    session: '2025-2026',
    lookupId: 'J2143',
    topics: ['jewish_community'],
    inclusionRationale: 'Reviewed New York measure locator for the Jewish-community pilot topic.',
  }),
  freezeMeasure({
    key: 'ny-s7034',
    provider: 'openstates',
    jurisdiction: 'New York',
    session: '2025-2026',
    lookupId: 'S7034',
    topics: ['ihra', 'antisemitism'],
    inclusionRationale: 'Reviewed New York measure locator for the IHRA and antisemitism pilot topics.',
  }),
  freezeMeasure({
    key: 'ny-a2139',
    provider: 'openstates',
    jurisdiction: 'New York',
    session: '2025-2026',
    lookupId: 'A2139',
    topics: ['ihra', 'antisemitism'],
    inclusionRationale: 'Reviewed New York measure locator for the IHRA and antisemitism pilot topics.',
  }),
  freezeMeasure({
    key: 'ny-s7045',
    provider: 'openstates',
    jurisdiction: 'New York',
    session: '2025-2026',
    lookupId: 'S7045',
    topics: ['ihra', 'antisemitism'],
    inclusionRationale: 'Reviewed New York measure locator for the IHRA and antisemitism pilot topics.',
  }),
  freezeMeasure({
    key: 'ny-s1752',
    provider: 'openstates',
    jurisdiction: 'New York',
    session: '2025-2026',
    lookupId: 'S1752',
    topics: ['antisemitism'],
    inclusionRationale: 'Reviewed New York measure locator for the antisemitism pilot topic.',
  }),
]);

export const HOUSE_MEASURES = Object.freeze([
  freezeMeasure({
    key: 'us-house-118-2-roll-172',
    provider: 'house_clerk',
    congress: 118,
    session: 2,
    year: 2024,
    rollNumber: 172,
    topics: ['ihra', 'antisemitism'],
    inclusionRationale: 'Reviewed House roll-call locator for the IHRA and antisemitism pilot topics.',
  }),
]);
