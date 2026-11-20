import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PathsFinder } from '../src/paths-finder';

describe('PathsFinder', () => {
  describe('.pathsFromSourceFile', () => {
    describe('when a file with the list of test files is not defined', () => {
      it('returns null', () => {
        expect(PathsFinder.pathsFromSourceFile()).toEqual(null);
      });
    });

    describe('when a file with the list of test files is defined', () => {
      describe('when a file with the list of test files has an invalid path', () => {
        it('throws an exception', () => {
          process.env.KNAPSACK_PRO_TEST_FILE_LIST_SOURCE_FILE =
            '__tests__/fixtures/fake_test_file_list_source_file.txt';

          expect(() => {
            PathsFinder.pathsFromSourceFile();
          }).toThrow(/^ENOENT: no such file or directory/);
        });
      });

      describe('when a file with the list of test files has a valid path', () => {
        it('returns test files and skips blank lines', () => {
          process.env.KNAPSACK_PRO_TEST_FILE_LIST_SOURCE_FILE =
            '__tests__/fixtures/test_file_list_source_file.txt';

          expect(PathsFinder.pathsFromSourceFile()).toMatchObject([
            '__tests__/a.test.js',
            '__tests__/directory/b.test.js',
            '__tests__/c.test.js',
          ]);
        });
      });
    });
  });

  describe('.allPaths', () => {
    const ENV = { ...process.env };
    let root: string;

    const allPaths = (defaultTestFilePattern: string) =>
      PathsFinder.allPaths({
        clientName: '@knapsack-pro/client',
        defaultTestFilePattern,
        noTestsFoundUrl: 'https://knapsackpro.com/perma/client/no-tests-found',
      }).sort();

    beforeEach(async () => {
      delete process.env.KNAPSACK_PRO_TEST_FILE_PATTERN;
      delete process.env.KNAPSACK_PRO_TEST_FILE_EXCLUDE_PATTERN;

      root = await realpath(await mkdtemp(join(tmpdir(), 'knapsack-core-')));
      await mkdir(join(root, 'directory'));
      await mkdir(join(root, 'node_modules', 'package'), { recursive: true });
      await Promise.all(
        [
          'a-test.js',
          'a-test.ts',
          'directory/b-test.js',
          'node_modules/package/c-test.js',
        ].map((path) => writeFile(join(root, path), '')),
      );
    });

    afterEach(async () => {
      process.env = { ...ENV };
      await rm(root, { recursive: true, force: true });
    });

    it('returns the test files matching the default test file pattern', () => {
      expect(allPaths(`${root}/**/*-test.js`)).toEqual([
        join(root, 'a-test.js'),
        join(root, 'directory', 'b-test.js'),
      ]);
    });

    describe('when KNAPSACK_PRO_TEST_FILE_PATTERN is set', () => {
      it('returns the test files matching KNAPSACK_PRO_TEST_FILE_PATTERN', () => {
        process.env.KNAPSACK_PRO_TEST_FILE_PATTERN = `${root}/*-test.ts`;

        expect(allPaths(`${root}/**/*-test.js`)).toEqual([
          join(root, 'a-test.ts'),
        ]);
      });
    });

    describe('when KNAPSACK_PRO_TEST_FILE_EXCLUDE_PATTERN is set', () => {
      it('returns the test files not matching KNAPSACK_PRO_TEST_FILE_EXCLUDE_PATTERN', () => {
        process.env.KNAPSACK_PRO_TEST_FILE_EXCLUDE_PATTERN = 'a-test.js';

        expect(allPaths(`${root}/**/*-test.js`)).toEqual([
          join(root, 'directory', 'b-test.js'),
        ]);
      });
    });

    it('ignores the test files inside node_modules', () => {
      expect(allPaths(`${root}/**/*-test.js`)).not.toContain(
        join(root, 'node_modules', 'package', 'c-test.js'),
      );
    });

    describe('when no test files are found', () => {
      it('throws an error', () => {
        expect(() => allPaths(`${root}/**/*.missing`)).toThrow(
          '[@knapsack-pro/client] Test files cannot be found.\nPlease set KNAPSACK_PRO_TEST_FILE_PATTERN matching your test directory structure.\nLearn more: https://knapsackpro.com/perma/client/no-tests-found',
        );
      });
    });
  });
});
