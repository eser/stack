// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Shared CLI support utilities for codebase scripts.
 *
 * Provides helpers for converting parsed CLI arguments to `CliEvent`
 * and for running CLI triggers with standard exit code handling.
 *
 * @module
 */

import type * as cliParseArgs from "@std/cli/parse-args";
import * as results from "@eser/primitives/results";
import type { CliEvent } from "@eser/functions/triggers";
import type * as shellArgs from "@eser/shell/args";
import { current } from "@eser/standards/runtime";

/**
 * Convert a `@std/cli/parse-args` result to a `CliEvent`.
 *
 * @param command - Command name
 * @param parsed - Result from `parseArgs()`
 * @returns A CliEvent with args and flags extracted
 */
export const toCliEvent = (
  command: string,
  parsed: ReturnType<typeof cliParseArgs.parseArgs>,
): CliEvent => ({
  command,
  args: (parsed._ ?? []) as string[],
  flags: Object.fromEntries(
    Object.entries(parsed).filter(([k]) => k !== "_"),
  ),
});

/**
 * Standard `import.meta.main` handler for all CLI scripts.
 *
 * Matches on the `CliResult`, printing any error message and setting
 * the process exit code on failure.
 *
 * @param result - The CliResult from a trigger invocation
 */
export const runCliMain = (result: shellArgs.CliResult<void>): void => {
  results.match(result, {
    ok: () => {},
    fail: (error) => {
      if (error.message !== undefined) {
        console.error(error.message);
      }
      current.process.setExitCode(error.exitCode);
    },
  });
};
