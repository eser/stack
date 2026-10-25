// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Clone command — CLI adapter for the clone-recipe handler.
 *
 * @module
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as results from "@eserstack/primitives/results";
import * as cliParseArgs from "@std/cli/parse-args";
import * as task from "@eserstack/functions/task";
import * as streams from "@eserstack/streams";
import * as span from "@eserstack/streams/span";
import * as cloneRecipeHandler from "../recipes/handlers/clone-recipe.ts";
import * as errorChain from "../recipes/error-chain.ts";
import * as tar from "../recipes/tar.ts";
import type * as shellArgs from "@eserstack/shell/args";

// =============================================================================
// Tarball extraction limits
// =============================================================================

/** Sets the tarball byte limit when `--max-bytes` is not given. */
export const MAX_BYTES_ENV = "ESER_KIT_MAX_BYTES";

/** Sets the tarball entry limit when `--max-entries` is not given. */
export const MAX_ENTRIES_ENV = "ESER_KIT_MAX_ENTRIES";

/** The extraction limits a clone passes on; an absent one keeps the default. */
export type ExtractLimits = {
  readonly maxBytes?: number;
  readonly maxEntries?: number;
};

type LimitSetting = {
  readonly flag: string;
  readonly env: string;
  readonly example: string;
};

const LIMIT_SETTINGS: Readonly<Record<tar.TarballLimit, LimitSetting>> = {
  maxBytes: {
    flag: "--max-bytes",
    env: MAX_BYTES_ENV,
    example: "536870912 for 512 MiB",
  },
  maxEntries: {
    flag: "--max-entries",
    env: MAX_ENTRIES_ENV,
    example: "50000",
  },
};

const POSITIVE_INTEGER = /^[1-9][0-9]*$/;

/**
 * Resolves one limit: the flag wins, then the environment variable (an empty
 * one counts as unset); neither leaves the extractor default.
 */
const resolveLimit = (
  setting: LimitSetting,
  flagValue: string | undefined,
  envValue: string | undefined,
): results.Result<number | undefined, RangeError> => {
  let source: string;
  let raw: string;
  if (flagValue !== undefined) {
    source = setting.flag;
    raw = flagValue;
  } else if (envValue !== undefined && envValue !== "") {
    source = setting.env;
    raw = envValue;
  } else {
    return results.ok(undefined);
  }

  const value = Number(raw);
  if (!POSITIVE_INTEGER.test(raw) || !Number.isSafeInteger(value)) {
    return results.fail(
      new RangeError(
        `${source} "${raw}" is not a positive integer; expected a whole number such as ${setting.example}`,
      ),
    );
  }

  return results.ok(value);
};

/**
 * Resolves the tarball extraction limits of a clone. For each limit the
 * command-line flag wins, then the environment variable, then the
 * extractor's default; kit reads no config file for them.
 *
 * @param flags - The raw `--max-bytes` and `--max-entries` values, if given
 * @param getEnv - Reads an environment variable (`runtime.env.get` in the CLI)
 */
export const resolveExtractLimits = (
  flags: { readonly maxBytes?: string; readonly maxEntries?: string },
  getEnv: (name: string) => string | undefined,
): results.Result<ExtractLimits, RangeError> => {
  const maxBytes = resolveLimit(
    LIMIT_SETTINGS.maxBytes,
    flags.maxBytes,
    getEnv(MAX_BYTES_ENV),
  );
  if (results.isFail(maxBytes)) return maxBytes;

  const maxEntries = resolveLimit(
    LIMIT_SETTINGS.maxEntries,
    flags.maxEntries,
    getEnv(MAX_ENTRIES_ENV),
  );
  if (results.isFail(maxEntries)) return maxEntries;

  return results.ok({ maxBytes: maxBytes.value, maxEntries: maxEntries.value });
};

/**
 * The message for a failed clone: the error chain, plus how to raise the
 * limit when the repository tarball went past one.
 */
const failureMessage = (error: cloneRecipeHandler.CloneRecipeError): string => {
  const limitError = errorChain.findCause(
    error.cause,
    tar.TarballLimitError,
  );
  if (limitError === null) {
    return error.message;
  }

  const setting = LIMIT_SETTINGS[limitError.limit];
  return `${error.message}\nIf you trust this repository, raise the limit with ${setting.flag} <n> or ${setting.env}=<n>.`;
};

// =============================================================================
// Command
// =============================================================================

export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const parsed = cliParseArgs.parseArgs(cliArgs as string[] ?? [], {
    string: ["recipe", "name", "var", "max-bytes", "max-entries"],
    boolean: [
      "force",
      "dry-run",
      "skip-existing",
      "verbose",
      "interactive",
      "no-interactive",
      "no-post-install",
    ],
    collect: ["var"],
    alias: { p: "name", i: "interactive" },
  });

  const specifierRaw = parsed._[0] as string | undefined;
  const targetDirArg = parsed._[1] as string | undefined;
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  if (specifierRaw === undefined) {
    out.writeln("Usage: eser kit clone <specifier> [target-dir] [options]");
    out.writeln();
    out.writeln("Specifier formats:");
    out.writeln(
      "  owner/repo                     GitHub repo (ref main)",
    );
    out.writeln(
      "  owner/repo#ref                 GitHub repo at specific tag/branch",
    );
    out.writeln(
      "  gh:owner/repo/sub/path[#ref]   GitHub repo subpath",
    );
    out.writeln();
    out.writeln("Options:");
    out.writeln(
      "  --recipe <path>                Path to recipe.json (default: recipe.json)",
    );
    out.writeln(
      "  --name, -p <dir>               Project name / target directory",
    );
    out.writeln(
      "  --var key=value                Template variable (repeatable)",
    );
    out.writeln(
      "  --interactive, -i              Prompt for missing variables",
    );
    out.writeln(
      "  --no-post-install              Skip post-install commands",
    );
    out.writeln(
      "  --force                        Overwrite existing files",
    );
    out.writeln(
      "  --dry-run                      Preview without writing",
    );
    out.writeln(
      "  --skip-existing                Skip files that already exist",
    );
    out.writeln(
      "  --verbose                      Show verbose output",
    );
    out.writeln(
      `  --max-bytes <n>                Tarball limit in decompressed bytes (default: ${tar.DEFAULT_MAX_BYTES}, env: ${MAX_BYTES_ENV})`,
    );
    out.writeln(
      `  --max-entries <n>              Tarball limit in entries (default: ${tar.DEFAULT_MAX_ENTRIES}, env: ${MAX_ENTRIES_ENV})`,
    );
    await out.close();
    return results.ok(undefined);
  }

  const specifier = cloneRecipeHandler.parseSpecifier(specifierRaw);

  if (specifier === undefined) {
    out.writeln(
      span.red(
        `Invalid specifier: '${specifierRaw}'. Use format: owner/repo or gh:owner/repo#ref`,
      ),
    );
    await out.close();
    return results.fail({ exitCode: 1 });
  }

  const limits = resolveExtractLimits(
    {
      maxBytes: parsed["max-bytes"] as string | undefined,
      maxEntries: parsed["max-entries"] as string | undefined,
    },
    (name) => runtime.env.get(name),
  );

  if (results.isFail(limits)) {
    await out.close();
    return results.fail({ message: limits.error.message, exitCode: 1 });
  }

  // Parse --var flags
  const variables: Record<string, string> = {};
  for (const v of (parsed["var"] as string[])) {
    const [key, ...valueParts] = String(v).split("=");
    if (key !== undefined && key !== "") {
      variables[key] = valueParts.join("=");
    }
  }

  // Positional target dir overrides --name when both absent; --name wins when present
  const projectName = parsed["name"] as string | undefined ?? targetDirArg;

  // Interactive mode: explicit flag OR auto-detect when stdin is a TTY (unless suppressed)
  const explicitInteractive = parsed["interactive"] === true;
  const noInteractive = parsed["no-interactive"] === true;
  const isTty = runtime.process.isTerminal("stdin");
  const interactive = !noInteractive && (explicitInteractive || isTty);

  if (!explicitInteractive && !noInteractive && isTty) {
    // Prompting was turned on automatically; stderr tells the user why.
    // deno-lint-ignore no-console
    console.error(
      "Prompting for missing variables (use --no-interactive to disable)",
    );
  }

  const skipPostInstall = parsed["no-post-install"] === true;

  out.writeln(
    span.cyan(
      `\nCloning from ${specifier.owner}/${specifier.repo}@${specifier.ref}...\n`,
    ),
  );

  const handlerResult = await task.runTask(
    cloneRecipeHandler.cloneRecipe({
      specifier,
      recipePath: parsed["recipe"] as string | undefined,
      cwd: runtime.process.cwd(),
      projectName,
      dryRun: parsed["dry-run"] === true,
      force: parsed["force"] === true,
      skipExisting: parsed["skip-existing"] === true,
      verbose: parsed["verbose"] === true,
      variables,
      interactive,
      skipPostInstall,
      maxBytes: limits.value.maxBytes,
      maxEntries: limits.value.maxEntries,
    }),
    { out },
  );

  await out.close();

  if (results.isOk(handlerResult)) {
    return results.ok(undefined);
  }

  return results.fail({
    message: failureMessage(handlerResult.error),
    exitCode: 1,
  });
};
