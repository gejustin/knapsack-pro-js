import { spawnSync, type StdioOptions } from 'child_process';
import { readFileSync, rmSync } from 'fs';
import { resolve } from 'path';
import { XMLParser } from 'fast-xml-parser';

export const MINIMUM_BUN_VERSION = '1.4.0';

// The patterns `bun test` uses to find test files when none are passed:
// https://bun.com/docs/test/discovery
// Hidden directories and `node_modules` are skipped like `bun test` does
// (`glob` skips hidden directories and `PathsFinder` skips `node_modules`).
const extensions = '{js,jsx,ts,tsx,mjs,cjs,mts,cts}';
export const defaultTestFilePattern = `{${[
  `**/*.test.${extensions}`,
  `**/*_test.${extensions}`,
  `**/*.spec.${extensions}`,
  `**/*_spec.${extensions}`,
].join(',')}}`;

export const bunVersion = (): string => {
  const result = spawnSync('bun', ['--version'], { encoding: 'utf8' });

  if ((result.error as NodeJS.ErrnoException | undefined)?.code === 'ENOENT') {
    throw new Error(
      `[@knapsack-pro/bun] bun was not found on PATH. Install Bun ${MINIMUM_BUN_VERSION} or later: https://bun.com/docs/installation`,
    );
  }
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `[@knapsack-pro/bun] \`bun --version\` failed:\n${result.stderr}`,
    );
  }

  return result.stdout.trim();
};

// Accepts versions like `1.4.2` and `1.4.2-canary.1+abc123`.
export const isSupportedBunVersion = (version: string) => {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) return false;

  const actual = match.slice(1).map(Number);
  const minimum = MINIMUM_BUN_VERSION.split('.').map(Number);
  for (let i = 0; i < minimum.length; i++) {
    if (actual[i] !== minimum[i]) return actual[i] > minimum[i];
  }
  return true;
};

export type TestSuite = { file: string; time: number; failures: number };

type JUnitReport = {
  testsuites?: {
    testsuite?: { file: string; time: string; failures: string }[];
  };
};

// Bun writes no report when no test ran (e.g., every file failed to load).
export const readTestSuites = (junitPath: string): TestSuite[] => {
  let xml: string;
  try {
    xml = readFileSync(junitPath, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }

  const report: JUnitReport = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    isArray: (tagName) => tagName === 'testsuite',
  }).parse(xml);

  return (report.testsuites?.testsuite ?? []).map((testSuite) => ({
    file: testSuite.file,
    time: Number(testSuite.time),
    failures: Number(testSuite.failures),
  }));
};

// Runs `bun test` on the given files and reads the results from its JUnit
// report. Paths are passed as absolute paths because `bun test` treats
// arguments not starting with `./` or `/` as filters.
export const runBunTest = ({
  paths,
  options,
  projectPath,
  junitPath,
  stdio = 'inherit',
}: {
  paths: string[];
  options: string[];
  projectPath: string;
  junitPath: string;
  stdio?: StdioOptions;
}) => {
  rmSync(junitPath, { force: true });

  const result = spawnSync(
    'bun',
    [
      'test',
      ...options,
      // `--test-name-pattern` matching no test in a batch is not a failure
      '--pass-with-no-tests',
      '--reporter=junit',
      `--reporter-outfile=${junitPath}`,
      ...paths.map((path) => resolve(projectPath, path)),
    ],
    { cwd: projectPath, stdio },
  );
  if (result.error) throw result.error;

  const testSuites = readTestSuites(junitPath);
  rmSync(junitPath, { force: true });

  return { status: result.status, signal: result.signal, testSuites };
};

// `bun test --reporter=junit` reports each file as a top-level `testsuite`
// with `file` relative to the working directory. Verified on Bun 1.4.0, 1.4.2,
// and 1.4.4:
//   - `time` is the wall time of the file, so it includes importing the file
//     (top-level `await` and synchronous work), hooks, and its tests
//   - `failures` counts the failed tests in the file, including nested
//     `describe` blocks, timeouts, and failed `beforeAll`/`afterAll` hooks;
//     `todo` and `skip` tests are not failures
//   - A file that fails outside of a test (e.g., import error, syntax error,
//     error thrown at the top level) is not reported, and `bun test` exits
//     with 1; an error thrown after a file's tests ended is reported against
//     the file or test running at that moment
//   - A file without tests is not reported either, so it is marked as failed
//   - No report is written when no test ran
//   - `bun test` can exit non-zero without a failure in the report (e.g., a
//     test sets `process.exitCode`), so the exit code is checked separately
// Older versions are not supported: Bun 1.1.0 has no JUnit reporter, Bun 1.2.0
// does not report `file`, Bun 1.2.x and 1.3.x report `time="0"` for files, and
// `--pass-with-no-tests` does not apply to `--test-name-pattern` before 1.3.14.
export const extractState = (
  scheduledPaths: string[],
  testSuites: TestSuite[],
  projectPath: string,
) => {
  const scheduledPathsByFile = new Map(
    scheduledPaths.map((path) => [resolve(projectPath, path), path]),
  );
  const recordedPaths: Record<string, number> = {};
  const failedPaths: Set<string> = new Set();

  for (const testSuite of testSuites) {
    const path = scheduledPathsByFile.get(resolve(projectPath, testSuite.file));
    if (path === undefined) continue;

    recordedPaths[path] = testSuite.time;

    if (testSuite.failures > 0) {
      failedPaths.add(path);
    }
  }

  const missingPaths = scheduledPaths.filter(
    (path) => !(path in recordedPaths),
  );
  missingPaths.forEach((path) => failedPaths.add(path));

  return { recordedPaths, failedPaths, missingPaths };
};
