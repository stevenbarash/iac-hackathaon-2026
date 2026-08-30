import assert from 'node:assert/strict';
import test from 'node:test';
import { HOUSE_MEASURES, STATE_MEASURES } from '../src/data/issue-legislation.js';

test('manifest contains locators and topics but no political outcomes', () => {
  const forbidden = ['title', 'status', 'sponsors', 'sponsorships', 'vote', 'votes', 'result', 'date', 'sourceUrl'];
  for (const measure of [...STATE_MEASURES, ...HOUSE_MEASURES]) {
    assert.ok(measure.key && measure.provider && measure.topics.length > 0);
    assert.ok(forbidden.every((field) => !Object.hasOwn(measure, field)));
  }
});
