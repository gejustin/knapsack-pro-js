import minimist from 'minimist';

// Validate the `bun test` options passed to each batch:
// `bun test` options: https://bun.com/docs/test
// Options that change which tests or files are reported (e.g., `--only`,
// `--bail`, `--rerun-each`) or the reporter are not supported.
export class BunCLI {
  public static argvToOptions(argv = process.argv.slice(2)): string[] {
    const args = minimist(argv, {
      string: ['test-name-pattern', 'timeout'],
      alias: { t: 'test-name-pattern' },
      unknown: (arg) => {
        if (arg.startsWith('-')) {
          throw new Error(
            `[@knapsack-pro/bun] Option ${arg} is not supported. Supported options: --test-name-pattern (-t), --timeout`,
          );
        }
        return true;
      },
    });

    if (args._.length > 0) {
      throw new Error(
        '[@knapsack-pro/bun] Passing list of files to test from command line is not supported',
      );
    }

    const timeout =
      args.timeout === undefined ? undefined : Number(args.timeout);
    if (timeout !== undefined && !(Number.isInteger(timeout) && timeout > 0)) {
      throw new Error(
        `[@knapsack-pro/bun] --timeout must be a positive integer. Received: ${args.timeout}`,
      );
    }

    return [
      ...[args['test-name-pattern'] ?? []]
        .flat()
        .map((pattern: string) => `--test-name-pattern=${pattern}`),
      ...(timeout === undefined ? [] : [`--timeout=${timeout}`]),
    ];
  }
}
