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
import * as shellEnv from "@eser/shell/env";
import * as tui from "@eser/shell/tui";
import * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import { runtime } from "@eser/standards/cross-runtime";

/** Return type for {@link createCliContext}. */
export type CliContext = {
  readonly ctx: tui.TuiContext;
  readonly output: streams.Output;
};

/**
 * Creates a `TuiContext` configured for the current environment.
 *
 * Detects whether stdout is a TTY (interactive terminal) or a pipe / CI
 * environment and builds the context accordingly. The `output` field is
 * extracted from the context for backward compatibility with call-sites
 * that only need an `Output`.
 */
export const createCliContext = (): CliContext => {
  const isInteractive = runtime.process.isTerminal("stdout");

  const interaction: shellEnv.Interaction = isInteractive
    ? "interactive"
    : "non-interactive";

  const ctx = tui.createTuiContext({ interaction });

  return { ctx, output: ctx.output };
};

/**
 * Creates a standard Output wired to stdout with ANSI rendering.
 *
 * @deprecated Prefer {@link createCliContext} which returns a full `TuiContext`.
 */
export const createCliOutput = (): streams.Output =>
  streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

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
 * @param out - Output instance for printing errors
 */
export const runCliMain = (
  result: shellArgs.CliResult<void>,
  out?: streams.Output,
): void => {
  results.match(result, {
    ok: () => {},
    fail: (error) => {
      if (error.message !== undefined) {
        if (out !== undefined) {
          out.writeln(span.red(error.message));
        } else {
          console.error(error.message);
        }
      }
      runtime.process.setExitCode(error.exitCode);
    },
  });
};
