import { expect, test } from 'bun:test';
import { add } from './add.js';

test('adds 1 + 2 to equal 3', async () => {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  expect(add(1, 2)).toBe(3);
}, 2000);

test('excluded test should not be run (verify KNAPSACK_PRO_TEST_FILE_EXCLUDE_PATTERN is respected)', () => {
  expect(true).toBe(false);
});
