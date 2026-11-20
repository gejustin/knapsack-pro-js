import { resolve } from 'path';
import type { EventData } from 'node:test';

// The patterns `node --test` uses to find test files when none are passed:
// https://nodejs.org/api/test.html#running-tests-from-the-command-line
// TypeScript extensions are matched only when Node.js strips types.
export const defaultTestFilePattern = (
  typescript: string | false | undefined = process.features.typescript,
) => {
  const extensions = typescript ? '{cjs,mjs,js,cts,mts,ts}' : '{cjs,mjs,js}';

  const patterns = [
    `**/*.test.${extensions}`,
    `**/*-test.${extensions}`,
    `**/*_test.${extensions}`,
    `**/test-*.${extensions}`,
    `**/test.${extensions}`,
    `**/test/**/*.${extensions}`,
  ];

  return `{${patterns.join(',')}}`;
};

// `run()` executes each test file in a child process and reports the file
// itself as a `test:complete` event with `nesting: 0` and `name === file`
// (the absolute path passed to `run()`). Verified on Node.js 20.19.5, 22.19.0,
// 24.22.1, and 26.8.1:
//   - `details.duration_ms` is the wall time of the child process, so it
//     includes spawning, importing the file, and running its tests (the
//     durations of the tests inside the file exclude the import time)
//   - `details.passed` is `false` when a test fails and when the file fails
//     outside of a test (e.g., import error, syntax error, error thrown after
//     a test ended, missing file); failing `todo` tests do not fail the file
//   - Events like `test:summary`, `details.type`, and `entryFile` are not
//     reported by all of the above versions, so they are not used
export const extractState = (
  scheduledPaths: string[],
  testsCompleted: EventData.TestComplete[],
  projectPath: string,
) => {
  const scheduledPathsByFile = new Map(
    scheduledPaths.map((path) => [resolve(projectPath, path), path]),
  );
  const recordedPaths: Record<string, number> = {};
  const failedPaths: Set<string> = new Set();

  for (const test of testsCompleted) {
    if (test.nesting !== 0 || test.name !== test.file) continue;

    const path = scheduledPathsByFile.get(test.file);
    if (path === undefined) continue;

    recordedPaths[path] = test.details.duration_ms / 1000;

    if (!test.details.passed) {
      failedPaths.add(path);
    }
  }

  const missingPaths = scheduledPaths.filter(
    (path) => !(path in recordedPaths),
  );
  missingPaths.forEach((path) => failedPaths.add(path));

  return { recordedPaths, failedPaths, missingPaths };
};
