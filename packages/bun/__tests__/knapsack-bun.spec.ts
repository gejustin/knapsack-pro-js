import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import { BunCLI } from '../src/bun-cli';
import {
  defaultTestFilePattern,
  extractState,
  isSupportedBunVersion,
  readTestSuites,
  runBunTest,
} from '../src/utils';

const runTests = (root: string, paths: string[], options: string[] = []) => {
  const { status, testSuites } = runBunTest({
    paths,
    options,
    projectPath: root,
    junitPath: join(root, 'junit.xml'),
    stdio: 'ignore',
  });

  return { status, ...extractState(paths, testSuites, root) };
};

describe('#extractState', () => {
  let root: string;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'knapsack-bun-')));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('extracts recorded and failed paths from a bun test run', async () => {
    await writeFile(
      join(root, 'example.test.ts'),
      `import { test } from 'bun:test';
        test('passes', async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
        });`,
    );

    const { status, recordedPaths, failedPaths, missingPaths } = runTests(
      root,
      ['example.test.ts'],
    );

    expect(status).toEqual(0);
    expect(recordedPaths).toEqual({
      'example.test.ts': expect.toSatisfy((value) => parseFloat(value) > 0.01),
    });
    expect(failedPaths).toEqual(new Set());
    expect(missingPaths).toEqual([]);
  }, 10_000);

  it('records paths relative to the project path', async () => {
    await mkdir(join(root, 'nested'));
    await writeFile(
      join(root, 'nested', 'example.test.ts'),
      `import { test } from 'bun:test';
        test('passes', () => {});`,
    );

    const { recordedPaths } = runTests(root, ['nested/example.test.ts']);

    expect(Object.keys(recordedPaths)).toEqual(['nested/example.test.ts']);
  }, 10_000);

  it('includes the time to import the file in the recorded duration', async () => {
    await writeFile(
      join(root, 'example.test.ts'),
      `import { test } from 'bun:test';
        await new Promise((resolve) => setTimeout(resolve, 100));
        test('passes', () => {});`,
    );

    const { recordedPaths } = runTests(root, ['example.test.ts']);

    expect(recordedPaths['example.test.ts']).toBeGreaterThan(0.1);
  }, 10_000);

  it('records one duration per file for multiple tests in one file', async () => {
    await writeFile(
      join(root, 'example.test.ts'),
      `import { describe, test } from 'bun:test';
        describe('suite', () => {
          test('first', async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
          });
          test('second', async () => {
            await new Promise((resolve) => setTimeout(resolve, 10));
          });
        });`,
    );

    const { recordedPaths } = runTests(root, ['example.test.ts']);

    expect(recordedPaths).toEqual({
      'example.test.ts': expect.toSatisfy((value) => parseFloat(value) > 0.02),
    });
  }, 10_000);

  it('extracts failed paths from a failed bun test run', async () => {
    await writeFile(
      join(root, 'passing.test.ts'),
      `import { test } from 'bun:test';
        test('passes', () => {});`,
    );
    await writeFile(
      join(root, 'failing.test.ts'),
      `import { describe, expect, test } from 'bun:test';
        describe('suite', () => {
          test('fails', () => {
            expect(true).toBe(false);
          });
        });`,
    );

    const { status, failedPaths } = runTests(root, [
      'passing.test.ts',
      'failing.test.ts',
    ]);

    expect(status).toEqual(1);
    expect(failedPaths).toEqual(new Set(['failing.test.ts']));
  }, 10_000);

  it('with a failing hook, it marks the file-path as failed', async () => {
    await writeFile(
      join(root, 'example.test.ts'),
      `import { beforeAll, test } from 'bun:test';
        beforeAll(() => {
          throw new Error('in the hook');
        });
        test('passes', () => {});`,
    );

    const { failedPaths } = runTests(root, ['example.test.ts']);

    expect(failedPaths).toEqual(new Set(['example.test.ts']));
  }, 10_000);

  it('with an import error, it marks the file-path as failed', async () => {
    await writeFile(
      join(root, 'passing.test.ts'),
      `import { test } from 'bun:test';
        test('passes', () => {});`,
    );
    await writeFile(
      join(root, 'example.test.ts'),
      `import { test } from 'bun:test';
        import './missing';
        test('passes', () => {});`,
    );

    const { status, recordedPaths, failedPaths, missingPaths } = runTests(
      root,
      ['passing.test.ts', 'example.test.ts'],
    );

    expect(status).toEqual(1);
    expect(Object.keys(recordedPaths)).toEqual(['passing.test.ts']);
    expect(failedPaths).toEqual(new Set(['example.test.ts']));
    expect(missingPaths).toEqual(['example.test.ts']);
  }, 10_000);

  it('with an error outside of a test case, it marks the file-path as failed', async () => {
    await writeFile(
      join(root, 'example.test.ts'),
      `import { test } from 'bun:test';
        test('passes', () => {});
        throw new Error('at the top level');`,
    );

    const { status, failedPaths } = runTests(root, ['example.test.ts']);

    expect(status).toEqual(1);
    expect(failedPaths).toEqual(new Set(['example.test.ts']));
  }, 10_000);

  it('with a missing file, it marks the file-path as failed', () => {
    const { status, failedPaths } = runTests(root, ['missing.test.ts']);

    expect(status).toEqual(1);
    expect(failedPaths).toEqual(new Set(['missing.test.ts']));
  }, 10_000);

  it('with a file without tests, it marks the file-path as failed', async () => {
    await writeFile(join(root, 'example.test.ts'), `export const a = 1;`);

    const { status, failedPaths, missingPaths } = runTests(root, [
      'example.test.ts',
    ]);

    expect(status).toEqual(0);
    expect(failedPaths).toEqual(new Set(['example.test.ts']));
    expect(missingPaths).toEqual(['example.test.ts']);
  }, 10_000);

  it('does not mark the file-path as failed for todo and skipped tests', async () => {
    await writeFile(
      join(root, 'example.test.ts'),
      `import { test } from 'bun:test';
        test.todo('todo', () => {
          throw new Error('not implemented yet');
        });
        test.skip('skipped', () => {
          throw new Error('skipped');
        });
        test('passes', () => {});`,
    );

    const { status, failedPaths } = runTests(root, ['example.test.ts']);

    expect(status).toEqual(0);
    expect(failedPaths).toEqual(new Set());
  }, 10_000);

  it('does not fail when --test-name-pattern matches no test in the batch', async () => {
    await writeFile(
      join(root, 'example.test.ts'),
      `import { test } from 'bun:test';
        test('passes', () => {});`,
    );

    const { status, recordedPaths, failedPaths } = runTests(
      root,
      ['example.test.ts'],
      ['--test-name-pattern=no-match'],
    );

    expect(status).toEqual(0);
    expect(Object.keys(recordedPaths)).toEqual(['example.test.ts']);
    expect(failedPaths).toEqual(new Set());
  }, 10_000);

  it('returns the exit code when bun test fails without a failed test', async () => {
    await writeFile(
      join(root, 'example.test.ts'),
      `import { test } from 'bun:test';
        test('passes', () => {
          process.exitCode = 3;
        });`,
    );

    const { status, failedPaths } = runTests(root, ['example.test.ts']);

    expect(status).toEqual(3);
    expect(failedPaths).toEqual(new Set());
  }, 10_000);

  it('marks the scheduled paths without a result as failed and missing', () => {
    const { recordedPaths, failedPaths, missingPaths } = extractState(
      ['example.test.ts'],
      [],
      root,
    );

    expect(recordedPaths).toEqual({});
    expect(failedPaths).toEqual(new Set(['example.test.ts']));
    expect(missingPaths).toEqual(['example.test.ts']);
  });
});

describe('#readTestSuites', () => {
  it('returns no test suites without a report', () => {
    expect(readTestSuites(join(tmpdir(), 'missing-junit.xml'))).toEqual([]);
  });
});

describe('#defaultTestFilePattern', () => {
  it('returns the bun test default patterns', () => {
    expect(defaultTestFilePattern).toEqual(
      '{**/*.test.{js,jsx,ts,tsx,mjs,cjs,mts,cts},**/*_test.{js,jsx,ts,tsx,mjs,cjs,mts,cts},**/*.spec.{js,jsx,ts,tsx,mjs,cjs,mts,cts},**/*_spec.{js,jsx,ts,tsx,mjs,cjs,mts,cts}}',
    );
  });
});

describe('#isSupportedBunVersion', () => {
  it.each([
    ['1.4.0', true],
    ['1.4.2', true],
    ['1.10.0', true],
    ['2.0.0', true],
    ['1.4.2-canary.1+abc123', true],
    ['1.3.14', false],
    ['0.8.1', false],
    ['unknown', false],
  ])('with %s, it returns %s', (version, supported) => {
    expect(isSupportedBunVersion(version)).toEqual(supported);
  });
});

describe('BunCLI', () => {
  describe('.argvToOptions', () => {
    it('returns no options without arguments', () => {
      expect(BunCLI.argvToOptions([])).toEqual([]);
    });

    it('translates the supported options', () => {
      expect(
        BunCLI.argvToOptions([
          '--test-name-pattern=first',
          '-t',
          'second',
          '--timeout',
          '2000',
        ]),
      ).toEqual([
        '--test-name-pattern=first',
        '--test-name-pattern=second',
        '--timeout=2000',
      ]);
    });

    it('throws with an unsupported option', () => {
      expect(() => BunCLI.argvToOptions(['--bail'])).toThrow(
        '[@knapsack-pro/bun] Option --bail is not supported. Supported options: --test-name-pattern (-t), --timeout',
      );
    });

    it('throws with an invalid --timeout', () => {
      expect(() => BunCLI.argvToOptions(['--timeout=abc'])).toThrow(
        '[@knapsack-pro/bun] --timeout must be a positive integer. Received: abc',
      );
    });

    it('throws with a list of files', () => {
      expect(() => BunCLI.argvToOptions(['example.test.ts'])).toThrow(
        '[@knapsack-pro/bun] Passing list of files to test from command line is not supported',
      );
    });
  });
});
