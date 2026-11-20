import assert from 'node:assert/strict';
import { test } from 'node:test';
import { add } from './add.js';

test('adds 1 + 2 to equal 3', { timeout: 2000 }, async () => {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.equal(add(1, 2), 3);
});

test('adds 10 + 20 to equal 30', { timeout: 2000 }, async () => {
  await new Promise((resolve) => setTimeout(resolve, 1500));
  assert.equal(add(10, 20), 30);
});
