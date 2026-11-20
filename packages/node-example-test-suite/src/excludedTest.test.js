import assert from 'node:assert/strict';
import { test } from 'node:test';
import { add } from './add.js';

test('adds 1 + 2 to equal 3', { timeout: 2000 }, async () => {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.equal(add(1, 2), 3);
});

test('excluded test should not be run (verify KNAPSACK_PRO_TEST_FILE_EXCLUDE_PATTERN is respected)', () => {
  assert.equal(true, false);
});
