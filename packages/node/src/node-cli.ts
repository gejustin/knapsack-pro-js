import minimist from 'minimist';
import type { RunOptions } from 'node:test';

// Translate `node --test` options to `run()` options:
// `node --test` options: https://nodejs.org/api/cli.html
// `run()` options: https://nodejs.org/api/test.html#runoptions
export class NodeCLI {
  public static argvToOptions(argv = process.argv.slice(2)): RunOptions {
    const args = minimist(argv, {
      string: ['test-name-pattern', 'test-concurrency'],
      boolean: ['test-only'],
      unknown: (arg) => {
        if (arg.startsWith('-')) {
          throw new Error(
            `[@knapsack-pro/node] Option ${arg} is not supported. Supported options: --test-name-pattern, --test-only, --test-concurrency`,
          );
        }
        return true;
      },
    });

    if (args._.length > 0) {
      throw new Error(
        '[@knapsack-pro/node] Passing list of files to test from command line is not supported',
      );
    }

    const concurrency =
      args['test-concurrency'] === undefined
        ? undefined
        : Number(args['test-concurrency']);
    if (
      concurrency !== undefined &&
      !(Number.isInteger(concurrency) && concurrency > 0)
    ) {
      throw new Error(
        `[@knapsack-pro/node] --test-concurrency must be a positive integer. Received: ${args['test-concurrency']}`,
      );
    }

    return {
      ...(args['test-name-pattern'] !== undefined && {
        testNamePatterns: [args['test-name-pattern']].flat(),
      }),
      ...(args['test-only'] && { only: true }),
      ...(concurrency !== undefined && { concurrency }),
    };
  }
}
