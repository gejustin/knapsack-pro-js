#!/usr/bin/env node

import pkg from '@knapsack-pro/node/package.json' with { type: 'json' };
import {
  KnapsackProCore,
  KnapsackProLogger,
  PathsFinder,
  normalizePaths,
  onQueueFailureType,
  onQueueSuccessType,
} from '@knapsack-pro/core';
import { run, type EventData } from 'node:test';
import { spec } from 'node:test/reporters';
import { finished } from 'node:stream/promises';
import { resolve } from 'path';

import { NodeCLI } from './node-cli.js';
import * as Urls from './urls.js';
import { defaultTestFilePattern, extractState } from './utils.js';

if (process.env.KNAPSACK_PRO_TEST_SUITE_TOKEN_NODE) {
  process.env.KNAPSACK_PRO_TEST_SUITE_TOKEN =
    process.env.KNAPSACK_PRO_TEST_SUITE_TOKEN_NODE;
}

const knapsackProLogger = new KnapsackProLogger();

async function main() {
  knapsackProLogger.debug(`Running ${pkg.name}@${pkg.version}`);

  const runOptions = NodeCLI.argvToOptions();
  knapsackProLogger.debug(
    `Node.js test runner options:\n${KnapsackProLogger.objectInspect(runOptions)}`,
  );

  const projectPath = process.cwd();
  const knapsackPro = new KnapsackProCore(pkg.name, pkg.version, () =>
    PathsFinder.allPaths({
      clientName: pkg.name,
      defaultTestFilePattern: defaultTestFilePattern(),
      noTestsFoundUrl: Urls.NO_TESTS_FOUND,
    }),
  );

  const onSuccess: onQueueSuccessType = async (scheduledPaths: string[]) => {
    const stream = run({
      ...runOptions,
      files: scheduledPaths.map((path) => resolve(projectPath, path)),
    });

    const testsCompleted: EventData.TestComplete[] = [];
    stream.on('test:complete', (data) => testsCompleted.push(data));

    // Print the output like `node --test` does
    const reporter = stream.compose(spec);
    reporter.pipe(process.stdout);
    await finished(reporter);

    const { recordedPaths, failedPaths, missingPaths } = extractState(
      scheduledPaths,
      testsCompleted,
      projectPath,
    );

    if (missingPaths.length > 0) {
      knapsackProLogger.error(
        `[@knapsack-pro/node] Marking as failed the test files that did not report a result: ${missingPaths.join(', ')}`,
      );
    }

    return {
      recordedPaths: normalizePaths(scheduledPaths, recordedPaths),
      isTestSuiteGreen: failedPaths.size === 0,
      failedPaths,
    };
  };

  const onError: onQueueFailureType = () => {};

  knapsackPro.runQueueMode(onSuccess, onError);
}

main();
