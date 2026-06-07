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
import * as results from "@eserstack/primitives/results";
import type { CliEvent } from "@eserstack/functions/triggers";
import type * as shellArgs from "@eserstack/shell/args";
import * as shellEnv from "@eserstack/shell/env";
import * as tui from "@eserstack/shell/tui";
import * as streams from "@eserstack/streams";
import * as span from "@eserstack/streams/span";
import { runtime } from "@eserstack/standards/cross-runtime";

/** Return type for {@link createCliContext}. */
export type CliContext = {
  readonly ctx: tui.TuiContext;
  readonly output: streams.Output;
};

// Every Output created through the helpers below is registered here so
// {@link exitCli} can drain it before a hard process exit. The streams Output
// is sync-write / async-flush; `runtime.process.exit` (Deno.exit) terminates
// synchronously and would drop any not-yet-flushed buffer.
const liveOutputs = new Set<streams.Output>();

const flushLiveOutputs = async (): Promise<void> => {
  await Promise.all(
    [...liveOutputs].map((out) => out.flush().catch(() => {})),
  );
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

  liveOutputs.add(ctx.output);

  return { ctx, output: ctx.output };
};

/**
 * Creates a standard Output wired to stdout with ANSI rendering.
 *
 * @deprecated Prefer {@link createCliContext} which returns a full `TuiContext`.
 */
export const createCliOutput = (): streams.Output => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  liveOutputs.add(out);

  return out;
};

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

/**
 * Terminal `import.meta.main` handler for CLI entry points that may load the
 * native `@eserstack/ajan` FFI library (the `eser` dispatcher, `codebase`,
 * `validation`).
 *
 * Resolves the exit code from `result`, prints any error, drains buffered CLI
 * output, then **hard-exits** via `runtime.process.exit`. The hard exit is
 * deliberate: once the Go c-shared library is loaded it intermittently SIGSEGVs
 * the host on natural teardown and discards the exit code; `Deno.exit` commits
 * the status deterministically. Because that skips the streams async flush, we
 * drain every helper-created Output first (see {@link liveOutputs}).
 *
 * @param result - The CliResult from the command dispatch
 */
export const exitCli = async (
  result: shellArgs.CliResult<void>,
): Promise<never> => {
  const exitCode = results.match(result, {
    ok: () => 0,
    fail: (error) => {
      if (error.message !== undefined) {
        // deno-lint-ignore no-console
        console.error(error.message);
      }
      return error.exitCode;
    },
  });

  await flushLiveOutputs();

  return runtime.process.exit(exitCode);
};
