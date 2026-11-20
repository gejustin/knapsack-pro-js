import { readFileSync } from 'fs';
import { glob } from 'glob';
import { minimatch } from 'minimatch';
import { KnapsackProEnvConfig } from './config/index.js';
import { KnapsackProLogger } from './knapsack-pro-logger.js';

export class PathsFinder {
  public static pathsFromSourceFile(): string[] | null {
    if (!KnapsackProEnvConfig.testFileListSourceFile) {
      return null;
    }

    const knapsackProLogger = new KnapsackProLogger();
    knapsackProLogger.debug(
      `The KNAPSACK_PRO_TEST_FILE_LIST_SOURCE_FILE environment variable is defined. Knapsack will execute test files based on a list of test files from a file: ${KnapsackProEnvConfig.testFileListSourceFile}.`,
    );

    const allFileContents = readFileSync(
      KnapsackProEnvConfig.testFileListSourceFile,
      'utf-8',
    );

    return allFileContents
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((path) => path.length > 0);
  }

  // For test runners that do not resolve their own test files.
  public static allPaths({
    clientName,
    defaultTestFilePattern,
    noTestsFoundUrl,
  }: {
    clientName: string;
    defaultTestFilePattern: string;
    noTestsFoundUrl: string;
  }): string[] {
    const testFilePattern =
      KnapsackProEnvConfig.testFilePattern || defaultTestFilePattern;
    const testFileExcludePattern = KnapsackProEnvConfig.testFileExcludePattern;

    const paths = glob
      .sync(testFilePattern)
      .filter((path: string) => {
        if (testFileExcludePattern) {
          return !minimatch(path, testFileExcludePattern, {
            matchBase: true,
          });
        }
        return true;
      })
      .filter((path: string) => !path.match(/node_modules/));

    if (paths.length === 0) {
      const knapsackProLogger = new KnapsackProLogger();

      const errorMessage = `[${clientName}] Test files cannot be found.\nPlease set KNAPSACK_PRO_TEST_FILE_PATTERN matching your test directory structure.\nLearn more: ${noTestsFoundUrl}`;

      knapsackProLogger.error(errorMessage);
      throw new Error(errorMessage);
    }

    return paths;
  }
}
