const PHOTON_ENDPOINT = 'https://photon.komoot.io/api/';

function formatAddress(properties) {
  if (String(properties.countrycode || '').toUpperCase() !== 'US') return '';
  if (!properties.housenumber || !properties.street || !properties.city) return '';

  const streetAddress = `${properties.housenumber} ${properties.street}`;
  const region = [properties.state, properties.postcode].filter(Boolean).join(' ');
  return [streetAddress, properties.city, region].filter(Boolean).join(', ');
}

export function createAddressSuggestionService({ fetchImplementation = fetch } = {}) {
  return async function suggestAddresses(rawQuery = '') {
    const query = String(rawQuery).trim().slice(0, 100);
    if (query.length < 5) return { suggestions: [] };

    const url = new URL(PHOTON_ENDPOINT);
    url.searchParams.set('q', query);
    url.searchParams.set('countrycode', 'us');
    url.searchParams.set('layer', 'house');
    url.searchParams.set('limit', '6');
    url.searchParams.set('lang', 'en');

    const response = await fetchImplementation(url, {
      headers: { accept: 'application/geo+json, application/json' },
      signal: AbortSignal.timeout(4_000),
    });
    if (!response.ok) return { suggestions: [] };

    const payload = await response.json();
    const labels = (Array.isArray(payload?.features) ? payload.features : [])
      .map((feature) => formatAddress(feature?.properties || {}))
      .filter(Boolean);
    return {
      suggestions: [...new Set(labels)].slice(0, 5).map((label) => ({ id: label, label })),
    };
  };
}
