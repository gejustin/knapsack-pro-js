# @knapsack-pro/node

<p align="center">
  <a href="https://knapsackpro.com?utm_source=github&utm_medium=readme&utm_campaign=knapsack-pro-node&utm_content=hero_logo">
    <img alt="Knapsack Pro" src="./.github/assets/knapsack.png" width="300" height="300" style="max-width: 100%;" />
  </a>
</p>

<h3 align="center">Speed up your tests</h3>
<p align="center">Run your 1-hour test suite in 2 minutes with optimal parallelisation on your existing CI infrastructure</p>

---

<div align="center">
  <a href="https://circleci.com/gh/KnapsackPro/knapsack-pro-js">
    <img alt="Circle CI" src="https://circleci.com/gh/KnapsackPro/knapsack-pro-js.svg?style=svg" />
  </a>
</div>

<br />
<br />

Knapsack Pro wraps the [Node.js test runner](https://nodejs.org/api/test.html) (`node:test`) and works with your existing CI infrastructure to parallelize tests optimally:

- Dynamically splits your tests based on up-to-date test execution data
- Is designed from the ground up for CI and supports all of them
- Tracks your CI builds to detect bottlenecks
- Does not have access to your source code and collects minimal test data
- Enables you to export historical metrics about your CI builds
- Replaces local dependencies like Redis with an API and runs your tests regardless of network problems

## Installation

See the [docs](TBD) to get started:

<div align="center">
  <a href="TBD">
    <img alt="Install button" src="./.github/assets/install-button.png" width="116" height="50" />
  </a>
</div>

## Usage

Requires Node.js 20.19.5 or later.

```bash
npx @knapsack-pro/node
```

Test files are found with the same default patterns as `node --test` (TypeScript files are included when Node.js strips types). Use `KNAPSACK_PRO_TEST_FILE_PATTERN` and `KNAPSACK_PRO_TEST_FILE_EXCLUDE_PATTERN` to change them.

Supported `node --test` options:

- `--test-name-pattern`
- `--test-only`
- `--test-concurrency` (test files run one at a time by default)

Pass Node.js options to the test files with `NODE_OPTIONS` (e.g., `NODE_OPTIONS="--import ./setup.js" npx @knapsack-pro/node`).

## Dependencies

- [@knapsack-pro/core](https://github.com/KnapsackPro/knapsack-pro-js/tree/main/packages/core)

## Contributing

Follow the steps in the [root README.md](https://github.com/KnapsackPro/knapsack-pro-js#contributing) to set up the project.

### Testing

To test `@knapsack-pro/node` against a real test suite we use:

- [node-example-test-suite](https://github.com/KnapsackPro/knapsack-pro-js/tree/main/packages/node-example-test-suite)

### Publishing

See [Publishing](../../#publishing) in the root README.md.
