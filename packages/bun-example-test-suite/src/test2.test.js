import { expect, test } from 'bun:test';
import { add } from './add.js';

test('adds 1 + 2 to equal 3', async () => {
  await new Promise((resolve) => setTimeout(resolve, 500));
  expect(add(1, 2)).toBe(3);
});
