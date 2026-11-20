import assert from 'node:assert/strict';
import { test } from 'node:test';
import { add } from './add.js';

test('adds 1 + 2 to equal 3', async () => {
  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(add(1, 2), 3);
});
