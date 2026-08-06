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
import * as shellArgs from "@eserstack/shell/args";

import { appFromName, type CliApp } from "./cli-system/app.ts";
import * as shellEnv from "@eserstack/shell/env";
// The specific module, not the @eserstack/shell/tui barrel.
//
// Only createTuiContext and the TuiContext type are used here, but importing
// the barrel pulled all 26 of its exports -- every prompt widget, the spinner,
// the signal handling -- onto the startup path of every command that touches
// cli-support, which is all of them.
import { createTuiContext, type TuiContext } from "@eserstack/shell/tui/types";
import * as streams from "@eserstack/streams";
import * as span from "@eserstack/streams/span";
import { runtime } from "@eserstack/standards/cross-runtime";

/** Return type for {@link createCliContext}. */
export type CliContext = {
  readonly ctx: TuiContext;
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

  const ctx = createTuiContext({ interaction });

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

/**
 * Builds the entry point for a standalone binary carved out of the `eser` CLI.
 *
 * # The rule this enforces
 *
 * Some submodules are worth shipping on their own: someone who only wants the
 * spec workflow should be able to `brew install noskills` and type
 * `noskills next`, without discovering it lives inside a larger CLI. Someone
 * already using the stack types `eser noskills next`. Both are reasonable, so
 * both are shipped.
 *
 * What must not follow is two implementations. There used to be a 1,563-line Go
 * CLI at cmd/noskills covering a subset of the same commands — a fork of the
 * behaviour, free to drift, and it had. A standalone binary built this way
 * mounts the SAME module object the `eser` CLI mounts, just at the root of its
 * own tree, so `noskills next` and `eser noskills next` are one code path.
 * There is nothing to keep in sync because nothing is duplicated.
 *
 * The only difference between the two entry points is where the module sits and
 * what the binary is called.
 */
/**
 * Attaches the `system` tree and its root aliases to a binary's root command.
 *
 * # Why a layer, and why it attaches to the ROOT
 *
 * Every shipped binary needs the same operational commands: `system install`,
 * `uninstall`, `update`, `doctor`, `completions`, `version`, `info` — plus the
 * short forms people actually type, `eser update` and `noskills doctor`.
 *
 * But `eser noskills version` must NOT exist. A submodule is not a program;
 * giving it a version implies it has one of its own, and repeating the whole
 * system tree under every namespace would bury each one's real commands.
 *
 * Attaching to the root Command rather than to the Module is what draws that
 * line, and it draws it for free. The Module objects are SHARED — `eser` mounts
 * the very same object the standalone `noskills` binary re-roots — so a layer
 * living on the module would necessarily appear in both, with no way to have
 * one without the other.
 *
 * The tree itself is built once in @eserstack/codebase/cli-system and
 * parameterised by {@link CliApp}, so `noskills system install` installs
 * noskills and says so. One implementation, three bindings — not three copies.
 */
export const attachStandardCommands = (
  command: shellArgs.Command,
  app?: Partial<CliApp>,
): shellArgs.Command => {
  const resolved: CliApp = {
    ...appFromName(command.name),
    ...app,
  };

  return command
    .lazyCommand("system", {
      description: "Commands related with this CLI",
      load: async () => {
        const { createSystemCommand } = await import("./cli-system/mod.ts");

        return createSystemCommand(resolved);
      },
    })
    // The short forms. `system` holds the canonical definitions; these are the
    // names people type.
    .shortcut(
      "install",
      "system install",
      `Install ${resolved.command} globally`,
    )
    .shortcut("update", "system update", `Update ${resolved.command}`)
    .shortcut("version", "system version", "Show version number")
    .shortcut("doctor", "system doctor", "Run diagnostic checks");
};

export const runStandaloneModule = async (
  module: { toCommand: (name: string, version: string) => shellArgs.Command },
  name: string,
  version: string,
): Promise<never> => {
  const app = attachStandardCommands(module.toCommand(name, version));

  // exitCli rather than a natural return: the native FFI teardown makes a
  // normal exit unsafe once the shared library has been loaded. See its docs.
  return await exitCli(await app.parse());
};
