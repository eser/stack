// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Script executor — resolves and runs scripts from .eser/manifest.yml.
 *
 * Supports:
 * - String shorthand: `ok: "eser workflows run -e precommit"`
 * - Object form: `{ command, description, workingDirectory, depends }`
 * - Dependencies: the scripts in `depends` run first, each one after its own
 *   dependencies and once per run, with cycle detection
 * - Arg passing (remaining CLI args appended to the command, one word each)
 *
 * @module
 */

import * as shellExec from "@eserstack/shell/exec";
import * as results from "@eserstack/primitives/results";
import * as span from "@eserstack/streams/span";
import * as streams from "@eserstack/streams";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import type * as shellArgs from "@eserstack/shell/args";

/** A manifest script entry, checked and with its defaults applied. */
export type ParsedScript = {
  readonly name: string;
  readonly command: string;
  readonly description: string;
  readonly workingDirectory: string | undefined;
  readonly depends: readonly string[];
};

/** Why a script cannot be resolved into a run order. */
export type ManifestScriptErrorReason = "cycle" | "unknown" | "malformed";

/**
 * A manifest script that cannot run: its `depends` form a cycle, it names a
 * script the manifest does not define, or an entry has the wrong shape.
 */
export class ManifestScriptError extends Error {
  /** Which of the three problems this is. */
  readonly reason: ManifestScriptErrorReason;
  /** The dependency chain from the requested script to the one at fault. */
  readonly chain: readonly string[];

  constructor(
    reason: ManifestScriptErrorReason,
    chain: readonly string[],
    message: string,
  ) {
    super(message);
    this.name = "ManifestScriptError";
    this.reason = reason;
    this.chain = chain;
  }
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value instanceof Object && !Array.isArray(value);

const isNameList = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

// JSON shows a string with its quotes and a list as a list, which is how the
// value reads in the YAML the user wrote.
const showValue = (value: unknown): string =>
  JSON.stringify(value) ?? String(value);

/**
 * Check a manifest script entry and apply its defaults.
 *
 * The manifest is a file the user edits, so the entry arrives as an unchecked
 * value. A string is the command itself; an object needs a `command` string
 * and may carry `description`, `workingDirectory` and `depends`. The failure
 * value is a message that names the script, the field and the fix.
 */
export const parseScript = (
  name: string,
  entry: unknown,
): results.Result<ParsedScript, string> => {
  if (typeof entry === "string") {
    return results.ok({
      name,
      command: entry,
      description: name,
      workingDirectory: undefined,
      depends: [],
    });
  }

  if (!isRecord(entry)) {
    return results.fail(
      `script "${name}" must be a command string or an object with a ` +
        `"command" string, not ${showValue(entry)}`,
    );
  }

  const { command, description, workingDirectory, depends } = entry;

  if (typeof command !== "string") {
    return results.fail(
      `script "${name}" has no "command" string; add the command it runs, ` +
        `for example command: pnpm test`,
    );
  }

  if (description !== undefined && typeof description !== "string") {
    return results.fail(
      `script "${name}" has a "description" that is not a string: ` +
        showValue(description),
    );
  }

  if (workingDirectory !== undefined && typeof workingDirectory !== "string") {
    return results.fail(
      `script "${name}" has a "workingDirectory" that is not a string: ` +
        showValue(workingDirectory),
    );
  }

  if (depends !== undefined && !isNameList(depends)) {
    return results.fail(
      `script "${name}" has depends ${showValue(depends)}; write a list of ` +
        `script names, for example depends: [build]`,
    );
  }

  return results.ok({
    name,
    command,
    description: description ?? name,
    workingDirectory,
    depends: depends ?? [],
  });
};

/** What a run executes: the dependencies in order, then the script itself. */
export type RunOrder = {
  /** Every script `script` depends on, directly or not, each listed once. */
  readonly dependencies: readonly ParsedScript[];
  /** The requested script; it runs last and receives the forwarded arguments. */
  readonly script: ParsedScript;
};

const unknownScriptMessage = (path: readonly string[]): string => {
  const missing = path[path.length - 1];
  const parent = path[path.length - 2];

  if (parent === undefined) {
    return `script "${missing}" is not defined in the manifest scripts`;
  }

  const chain = path.length > 2 ? ` (${path.join(" -> ")})` : "";
  return (
    `script "${parent}" depends on "${missing}"${chain}, which the ` +
    `manifest does not define; add a "${missing}" script or correct the ` +
    `name in the depends of "${parent}"`
  );
};

/**
 * Resolve the scripts a run of `name` executes, with a depth-first walk over
 * `depends`.
 *
 * The dependencies come in post-order: every script after all of its own
 * dependencies, and a script that several others depend on only once, where
 * it is first needed. Every entry on the way is checked with `parseScript`.
 * The result is a failure when the dependencies form a cycle, name a script
 * the manifest does not define, or reach a malformed entry, so a caller can
 * refuse the whole run before any script starts.
 */
export const resolveRunOrder = (
  name: string,
  scripts: Readonly<Record<string, unknown>>,
): results.Result<RunOrder, ManifestScriptError> => {
  const order: ParsedScript[] = [];
  const resolved = new Map<string, ParsedScript>();
  // The scripts whose dependencies are being walked, from `name` down to the
  // current one. Meeting one of them again means the dependencies loop.
  const walking: string[] = [];

  const visit = (
    current: string,
  ): results.Result<ParsedScript, ManifestScriptError> => {
    const known = resolved.get(current);
    if (known !== undefined) {
      return results.ok(known);
    }

    const path = [...walking, current];

    const cycleStart = walking.indexOf(current);
    if (cycleStart !== -1) {
      const cycle = path.slice(cycleStart).join(" -> ");
      return results.fail(
        new ManifestScriptError(
          "cycle",
          path,
          `script "${current}" depends on itself through ${cycle}; remove ` +
            `one of these depends entries`,
        ),
      );
    }

    // Object.hasOwn keeps names such as "constructor" or "toString" from
    // matching what every object inherits.
    if (!Object.hasOwn(scripts, current)) {
      return results.fail(
        new ManifestScriptError("unknown", path, unknownScriptMessage(path)),
      );
    }

    const parsed = parseScript(current, scripts[current]);
    if (results.isFail(parsed)) {
      return results.fail(
        new ManifestScriptError("malformed", path, parsed.error),
      );
    }

    walking.push(current);
    for (const dependency of parsed.value.depends) {
      const visited = visit(dependency);
      if (results.isFail(visited)) {
        return visited;
      }
    }
    walking.pop();

    resolved.set(current, parsed.value);
    order.push(parsed.value);
    return results.ok(parsed.value);
  };

  const script = visit(name);
  if (results.isFail(script)) {
    return script;
  }

  // Post-order puts `name` last, after everything it depends on.
  return results.ok({ dependencies: order.slice(0, -1), script: script.value });
};

/**
 * Quote a value as one POSIX shell word. Inside single quotes only `'` is
 * special, so each one closes the quote, adds an escaped quote and reopens it.
 */
export const shellQuote = (value: string): string =>
  `'${value.replaceAll("'", `'\\''`)}'`;

/**
 * The command a script runs when this CLI cannot tell how to start itself
 * again: the `eser` on `PATH`, as the script wrote it.
 */
const ESER_ON_PATH = "eser";

/** The paths `buildCliPrefix` builds a self-invocation from. */
export type CliPrefixPaths = {
  /** The running executable: a runtime, or the compiled `eser` binary. */
  readonly execPath: string;
  /**
   * The file the runtime started (`argv[1]`). Under Node it is the entry file
   * of the npm bundle; null when the runtime started no file.
   */
  readonly entryPath: string | null;
  /** This package's `main.ts`, the entry point a dev run starts with node. */
  readonly mainPath: string;
};

/**
 * Build the command that runs this CLI again, the same way it was started.
 *
 * | Invoker                      | Prefix                         |
 * | ---------------------------- | ------------------------------ |
 * | `binary`                     | `'<execPath>'`                 |
 * | `npm`, `npx`, `pnpm`, `pnpx` | `'<execPath>' '<entryPath>'`   |
 * | `dev`                        | `'<execPath>' '<mainPath>'`    |
 * | `unknown`, or no `entryPath` | `eser`, the one on `PATH`      |
 *
 * The compiled binary is the CLI itself. The npm bundle is run by the same
 * Node from its own entry file, so a script never reaches a different `eser`
 * version. A dev run starts the source entry point with the same Node.
 *
 * The prefix is spliced into a script that runs under `sh -c`, so each path is
 * one single-quoted word. A space, a quote, `$` or "\" in a path reaches the
 * runtime as data and never splits the word or runs. For `dev`,
 * `/opt/John Smith/node` and `/src/main.ts` the result is
 * `'/opt/John Smith/node' '/src/main.ts'`.
 */
export const buildCliPrefix = (
  invoker: crossRuntime.CliInvoker,
  paths: CliPrefixPaths,
): string => {
  const executable = shellQuote(paths.execPath);

  switch (invoker) {
    case "binary":
      return executable;
    case "npm":
    case "npx":
    case "pnpm":
    case "pnpx":
      return paths.entryPath === null
        ? ESER_ON_PATH
        : `${executable} ${shellQuote(paths.entryPath)}`;
    case "dev":
      return `${executable} ${shellQuote(paths.mainPath)}`;
    case "unknown":
      return ESER_ON_PATH;
    default: {
      const unreachable: never = invoker;
      throw new Error(
        `build the eser self-invocation: unhandled invoker ${JSON.stringify(
          unreachable,
        )}`,
      );
    }
  }
};

/**
 * Tell how this CLI was started, for `buildCliPrefix`.
 *
 * `detectInvoker` reports `binary` for an executable that is not a known
 * runtime, which is how the compiled `eser` binary shows up.
 */
const detectCliInvoker = (execPath: string): crossRuntime.CliInvoker => {
  // The package manager (npm, pnpm, npx) does not change the prefix, so its
  // environment variables are not read.
  const detected = crossRuntime.detectInvoker(
    crossRuntime.runtime.path.basename(execPath),
    // A single executable application is the CLI itself, so it gets no
    // runtime name and is detected as the binary.
    crossRuntime.runtime.process.isStandalone
      ? "compiled"
      : crossRuntime.detectRuntime(),
    crossRuntime.runtime.process.argv,
    {},
  );

  return detected.invoker;
};

/**
 * Resolve the CLI self-invocation prefix for the running process.
 *
 * A script command that starts with `eser` runs this CLI again instead (see
 * `buildCliPrefix`), so scripts work without a global `eser` installation and
 * use the version that runs them. Native paths pass through `toPosix()` for
 * "/" separators, which msys and git-bash `sh` accept as "C:/…" paths; on
 * POSIX systems it changes nothing.
 */
const resolveCliPrefix = (): string => {
  const { path, process } = crossRuntime.runtime;
  const execPath = crossRuntime.toPosix(process.execPath());
  const entryFile = process.argv[1];
  const dir = import.meta.dirname;
  // `import.meta.dirname` is the native module directory (no file: URL pathname
  // quirks). The remote-execution fallback is already a URL, so it is used as-is.
  const mainPath =
    dir !== undefined
      ? crossRuntime.toPosix(path.join(dir, "main.ts"))
      : new URL("./main.ts", import.meta.url).href;

  return buildCliPrefix(detectCliInvoker(execPath), {
    execPath,
    entryPath: entryFile !== undefined ? crossRuntime.toPosix(entryFile) : null,
    mainPath,
  });
};

/**
 * Replace a leading `eser` word in a command with `cliPrefix` (see
 * `buildCliPrefix`) so scripts work without a global install. Any other
 * command is returned unchanged.
 */
export const resolveCommand = (command: string, cliPrefix: string): string => {
  if (command === "eser" || command.startsWith("eser ")) {
    return `${cliPrefix}${command.slice("eser".length)}`;
  }
  return command;
};

/**
 * Build the `sh` arguments that run a script command with forwarded arguments.
 *
 * The forwarded arguments never become part of the script text. They follow it
 * as sh's positional parameters, and the script ends in `"$@"`, so each one
 * reaches the command as exactly one word: spaces, quotes, `$`, `*` and `;`
 * arrive as data and are never split, expanded or run.
 *
 * For `pnpm test` with the arguments `--filter` and `my test`, the result is
 * `["-c", 'pnpm test "$@"', "sh", "--filter", "my test"]`.
 */
export const buildShellArgs = (
  command: string,
  extraArgs: readonly string[] = [],
): readonly string[] => {
  if (extraArgs.length === 0) {
    return ["-c", command];
  }

  // A command from a YAML block scalar ends in a newline, and "$@" alone on
  // the next line would run the first forwarded argument as a command.
  // The "sh" after the script is $0, the name sh uses in its error messages.
  return ["-c", `${command.trimEnd()} "$@"`, "sh", ...extraArgs];
};

/**
 * Execute a shell command string, optionally in a working directory and with
 * forwarded arguments appended as separate words (see `buildShellArgs`).
 *
 * A leading `eser` runs this CLI (see `resolveCommand`).
 *
 * Returns the process exit code.
 */
export const executeCommand = async (
  command: string,
  workingDirectory?: string,
  extraArgs?: readonly string[],
): Promise<number> => {
  const shellArgs = buildShellArgs(
    resolveCommand(command, resolveCliPrefix()),
    extraArgs,
  );
  const cwd = workingDirectory ?? ".";

  const builder = new shellExec.CommandBuilder("sh", [...shellArgs])
    .cwd(cwd)
    .stdin("inherit")
    .stdout("inherit")
    .stderr("inherit")
    .noThrow();

  const output = await builder.spawn();
  return output.code;
};

/**
 * Run a script by name, running the scripts in its `depends` first (see
 * `resolveRunOrder`).
 *
 * Dependencies run without forwarded arguments; the script itself receives
 * `remainingArgs` appended to its command. Nothing runs when the dependencies
 * cannot be resolved, and the first dependency that exits with a non-zero code
 * stops the run with that code.
 */
export const runScript = async (
  name: string,
  scripts: Readonly<Record<string, unknown>>,
  remainingArgs: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const runOrder = resolveRunOrder(name, scripts);
  if (results.isFail(runOrder)) {
    return results.fail({ message: runOrder.error.message, exitCode: 1 });
  }

  const { dependencies, script } = runOrder.value;

  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  try {
    for (const dependency of dependencies) {
      out.writeln(span.dim(`$ ${dependency.name}`));

      // Sequential on purpose: dependencies run in resolved order, each one may
      // rely on what the previous one produced, and the first failure stops
      // the run.
      // oxlint-disable-next-line no-await-in-loop
      const dependencyCode = await executeCommand(
        dependency.command,
        dependency.workingDirectory,
      );

      if (dependencyCode !== 0) {
        return results.fail({
          message:
            `script "${name}" did not run: its dependency ` +
            `"${dependency.name}" exited with code ${dependencyCode}`,
          exitCode: dependencyCode,
        });
      }
    }

    out.writeln(span.dim(`$ ${script.name}`));

    const exitCode = await executeCommand(
      script.command,
      script.workingDirectory,
      remainingArgs,
    );

    if (exitCode !== 0) {
      return results.fail({ exitCode });
    }

    return results.ok(undefined);
  } finally {
    await out.close();
  }
};
