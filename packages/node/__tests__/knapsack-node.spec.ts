import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { finished } from 'node:stream/promises';
import { run, type EventData } from 'node:test';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { NodeCLI } from '../src/node-cli';
import { defaultTestFilePattern, extractState } from '../src/utils';

const runTests = async (root: string, paths: string[]) => {
  const testsCompleted: EventData.TestComplete[] = [];
  const stream = run({ files: paths.map((path) => join(root, path)) });
  stream.on('test:complete', (data) => testsCompleted.push(data));
  await finished(stream.resume());

  return extractState(paths, testsCompleted, root);
};

describe('#extractState', () => {
  let root: string;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'knapsack-node-')));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('extracts recorded and failed paths from a node:test run', async () => {
    await writeFile(
      join(root, 'example.test.mjs'),
      `import { test } from 'node:test';
        test('passes', async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
        });`,
    );

    const { recordedPaths, failedPaths, missingPaths } = await runTests(root, [
      'example.test.mjs',
    ]);

    expect(recordedPaths).toEqual({
      'example.test.mjs': expect.toSatisfy((value) => parseFloat(value) > 0.01),
    });
    expect(failedPaths).toEqual(new Set());
    expect(missingPaths).toEqual([]);
  }, 10_000);

  it('records paths relative to the project path', async () => {
    await mkdir(join(root, 'nested'));
    await writeFile(
      join(root, 'nested', 'example.test.mjs'),
      `import { test } from 'node:test';
        test('passes', () => {});`,
    );

    const { recordedPaths } = await runTests(root, ['nested/example.test.mjs']);

    expect(Object.keys(recordedPaths)).toEqual(['nested/example.test.mjs']);
  }, 10_000);

  it('includes the time to import the file in the recorded duration', async () => {
    await writeFile(
      join(root, 'example.test.mjs'),
      `import { test } from 'node:test';
        await new Promise((resolve) => setTimeout(resolve, 100));
        test('passes', () => {});`,
    );

    const { recordedPaths } = await runTests(root, ['example.test.mjs']);

    expect(recordedPaths['example.test.mjs']).toBeGreaterThan(0.1);
  }, 10_000);

  it('records one duration per file for multiple tests in one file', async () => {
    await writeFile(
      join(root, 'example.test.mjs'),
      `import { describe, test } from 'node:test';
        describe('suite', () => {
          test('first', async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
          });
          test('second', async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
          });
        });`,
    );

    const { recordedPaths } = await runTests(root, ['example.test.mjs']);

    expect(recordedPaths).toEqual({
      'example.test.mjs': expect.toSatisfy((value) => parseFloat(value) > 0.02),
    });
  }, 10_000);

  it('extracts failed paths from a failed node:test run', async () => {
    await writeFile(
      join(root, 'passing.test.mjs'),
      `import { test } from 'node:test';
        test('passes', () => {});`,
    );
    await writeFile(
      join(root, 'failing.test.mjs'),
      `import assert from 'node:assert/strict';
        import { describe, test } from 'node:test';
        describe('suite', () => {
          test('fails', () => {
            assert.equal(true, false);
          });
        });`,
    );

    const { failedPaths } = await runTests(root, [
      'passing.test.mjs',
      'failing.test.mjs',
    ]);

    expect(failedPaths).toEqual(new Set(['failing.test.mjs']));
  }, 10_000);

  it('with an import error, it marks the file-path as failed', async () => {
    await writeFile(
      join(root, 'example.test.mjs'),
      `import { test } from 'node:test';
        import './missing.mjs';
        test('passes', () => {});`,
    );

    const { recordedPaths, failedPaths } = await runTests(root, [
      'example.test.mjs',
    ]);

    expect(recordedPaths).toEqual({
      'example.test.mjs': expect.any(Number),
    });
    expect(failedPaths).toEqual(new Set(['example.test.mjs']));
  }, 10_000);

  it('with an error outside of a test case, it marks the file-path as failed', async () => {
    await writeFile(
      join(root, 'example.test.mjs'),
      `import { test } from 'node:test';
        test('passes', () => {
          setTimeout(() => {
            throw new Error('after the test ended');
          }, 10);
        });`,
    );

    const { failedPaths } = await runTests(root, ['example.test.mjs']);

    expect(failedPaths).toEqual(new Set(['example.test.mjs']));
  }, 10_000);

  it('with a missing file, it marks the file-path as failed', async () => {
    const { failedPaths } = await runTests(root, ['missing.test.mjs']);

    expect(failedPaths).toEqual(new Set(['missing.test.mjs']));
  }, 10_000);

  it('does not mark the file-path as failed for a failing todo test', async () => {
    await writeFile(
      join(root, 'example.test.mjs'),
      `import { test } from 'node:test';
        test('todo', { todo: true }, () => {
          throw new Error('not implemented yet');
        });`,
    );

    const { failedPaths } = await runTests(root, ['example.test.mjs']);

    expect(failedPaths).toEqual(new Set());
  }, 10_000);

  it('marks the scheduled paths without a result as failed and missing', () => {
    const { recordedPaths, failedPaths, missingPaths } = extractState(
      ['example.test.mjs'],
      [],
      root,
    );

    expect(recordedPaths).toEqual({});
    expect(failedPaths).toEqual(new Set(['example.test.mjs']));
    expect(missingPaths).toEqual(['example.test.mjs']);
  });
});

describe('#defaultTestFilePattern', () => {
  it('returns the node:test default patterns', () => {
    expect(defaultTestFilePattern(false)).toEqual(
      '{**/*.test.{cjs,mjs,js},**/*-test.{cjs,mjs,js},**/*_test.{cjs,mjs,js},**/test-*.{cjs,mjs,js},**/test.{cjs,mjs,js},**/test/**/*.{cjs,mjs,js}}',
    );
  });

  it('returns the node:test default patterns with TypeScript when Node.js strips types', () => {
    expect(defaultTestFilePattern('strip')).toEqual(
      '{**/*.test.{cjs,mjs,js,cts,mts,ts},**/*-test.{cjs,mjs,js,cts,mts,ts},**/*_test.{cjs,mjs,js,cts,mts,ts},**/test-*.{cjs,mjs,js,cts,mts,ts},**/test.{cjs,mjs,js,cts,mts,ts},**/test/**/*.{cjs,mjs,js,cts,mts,ts}}',
    );
  });
});

describe('NodeCLI', () => {
  describe('.argvToOptions', () => {
    it('returns no options without arguments', () => {
      expect(NodeCLI.argvToOptions([])).toEqual({});
    });

    it('translates the supported options', () => {
      expect(
        NodeCLI.argvToOptions([
          '--test-name-pattern=first',
          '--test-name-pattern',
          '/second/i',
          '--test-only',
          '--test-concurrency=2',
        ]),
      ).toEqual({
        testNamePatterns: ['first', '/second/i'],
        only: true,
        concurrency: 2,
      });
    });

    it('throws with an unsupported option', () => {
      expect(() => NodeCLI.argvToOptions(['--test-reporter=tap'])).toThrow(
        '[@knapsack-pro/node] Option --test-reporter=tap is not supported. Supported options: --test-name-pattern, --test-only, --test-concurrency',
      );
    });

    it('throws with an invalid --test-concurrency', () => {
      expect(() => NodeCLI.argvToOptions(['--test-concurrency=abc'])).toThrow(
        '[@knapsack-pro/node] --test-concurrency must be a positive integer. Received: abc',
      );
    });

    it('throws with a list of files', () => {
      expect(() => NodeCLI.argvToOptions(['example.test.mjs'])).toThrow(
        '[@knapsack-pro/node] Passing list of files to test from command line is not supported',
      );
    });
  });
});
