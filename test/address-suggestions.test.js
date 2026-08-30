import assert from 'node:assert/strict';
import test from 'node:test';

import { createAddressSuggestionService } from '../src/services/address-suggestions.js';

test('address suggestions return unique formatted U.S. house addresses', async () => {
  const suggest = createAddressSuggestionService({
    async fetchImplementation(url) {
      assert.equal(url.searchParams.get('q'), '350 Fifth Ave');
      assert.equal(url.searchParams.get('countrycode'), 'us');
      assert.equal(url.searchParams.get('layer'), 'house');
      return {
        ok: true,
        async json() {
          return {
            features: [
              { properties: { housenumber: '350', street: '5th Avenue', city: 'New York', state: 'New York', postcode: '10118', countrycode: 'US' } },
              { properties: { housenumber: '350', street: '5th Avenue', city: 'New York', state: 'New York', postcode: '10118', countrycode: 'US' } },
              { properties: { name: 'Empire State Building', city: 'New York', countrycode: 'US' } },
              { properties: { housenumber: '1', street: 'Queen Street', city: 'Toronto', countrycode: 'CA' } },
            ],
          };
        },
      };
    },
  });

  assert.deepEqual(await suggest('350 Fifth Ave'), {
    suggestions: [{ id: '350 5th Avenue, New York, New York 10118', label: '350 5th Avenue, New York, New York 10118' }],
  });
});

test('address suggestions skip short queries without calling the provider', async () => {
  const suggest = createAddressSuggestionService({
    fetchImplementation() {
      throw new Error('provider should not be called');
    },
  });

  assert.deepEqual(await suggest('350'), { suggestions: [] });
});
