#!/usr/bin/env node

import pkg from '@knapsack-pro/bun/package.json' with { type: 'json' };
import {
  KnapsackProCore,
  KnapsackProLogger,
  PathsFinder,
  normalizePaths,
  onQueueFailureType,
  onQueueSuccessType,
} from '@knapsack-pro/core';
import { mkdirSync } from 'fs';
import { resolve } from 'path';

import { BunCLI } from './bun-cli.js';
import * as Urls from './urls.js';
import {
  MINIMUM_BUN_VERSION,
  bunVersion,
  defaultTestFilePattern,
  extractState,
  isSupportedBunVersion,
  runBunTest,
} from './utils.js';

if (process.env.KNAPSACK_PRO_TEST_SUITE_TOKEN_BUN) {
  process.env.KNAPSACK_PRO_TEST_SUITE_TOKEN =
    process.env.KNAPSACK_PRO_TEST_SUITE_TOKEN_BUN;
}

const knapsackProLogger = new KnapsackProLogger();

async function main() {
  knapsackProLogger.debug(`Running ${pkg.name}@${pkg.version}`);

  const options = BunCLI.argvToOptions();
  knapsackProLogger.debug(
    `Bun test runner options:\n${KnapsackProLogger.objectInspect(options)}`,
  );

  const version = bunVersion();
  knapsackProLogger.debug(`Running bun@${version}`);
  if (!isSupportedBunVersion(version)) {
    throw new Error(
      `[@knapsack-pro/bun] Bun ${version} is not supported. Upgrade to Bun ${MINIMUM_BUN_VERSION} or later (e.g., \`bun upgrade\`).`,
    );
  }

  const projectPath = process.cwd();
  const knapsackPro = new KnapsackProCore(pkg.name, pkg.version, () =>
    PathsFinder.allPaths({
      clientName: pkg.name,
      defaultTestFilePattern,
      noTestsFoundUrl: Urls.NO_TESTS_FOUND,
    }),
  );

  mkdirSync('.knapsack-pro', { recursive: true });
  const junitPath = resolve(projectPath, '.knapsack-pro', 'bun-junit.xml');

  const onSuccess: onQueueSuccessType = async (scheduledPaths: string[]) => {
    const { status, signal, testSuites } = runBunTest({
      paths: scheduledPaths,
      options,
      projectPath,
      junitPath,
    });

    const { recordedPaths, failedPaths, missingPaths } = extractState(
      scheduledPaths,
      testSuites,
      projectPath,
    );

    if (missingPaths.length > 0) {
      knapsackProLogger.error(
        `[@knapsack-pro/bun] Marking as failed the test files that did not report a result: ${missingPaths.join(', ')}`,
      );
    }

    if (status !== 0 && failedPaths.size === 0) {
      knapsackProLogger.error(
        `[@knapsack-pro/bun] bun test ${signal ? `was terminated by ${signal}` : `exited with code ${status}`} without reporting a failed test file`,
      );
    }

    return {
      recordedPaths: normalizePaths(scheduledPaths, recordedPaths),
      isTestSuiteGreen: status === 0 && failedPaths.size === 0,
      failedPaths,
    };
  };

  const onError: onQueueFailureType = () => {};

  knapsackPro.runQueueMode(onSuccess, onError);
}

main();
