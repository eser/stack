// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Command prefix — captured from process.argv at init, stored in manifest,
 * read from manifest on every subsequent call.
 *
 * @module
 */

import * as crossRuntime from "@eserstack/standards/cross-runtime";
import type { CliCommandOptions } from "@eserstack/standards/cross-runtime";
import * as schema from "../state/schema.ts";
import * as persistence from "../state/persistence.ts";

const ESER_OPTS: CliCommandOptions = {
  command: "eser",
  devCommand: "pnpm cli",
  npmPackage: "eser",
};

let _prefix: string = schema.DEFAULT_COMMAND_PREFIX;

/** Set the prefix (called when reading manifest or during init). */
export const setCommandPrefix = (prefix: string): void => {
  _prefix = prefix;
};

/** Get the current prefix. */
export const cmdPrefix = (): string => _prefix;

/** Build a full command: prefix + subcommand. */
export const cmd = (subcommand: string): string => `${_prefix} ${subcommand}`;

/**
 * Makes the `command` in the project's manifest the current prefix and
 * returns it. A command calls this once, before it builds any command string,
 * so its output names the command the user configured (for example
 * `pnpm cli noskills`) rather than the npx default. The current prefix
 * stays when the project has no manifest or the manifest sets no command.
 */
export const loadCommandPrefix = async (root: string): Promise<string> => {
  const manifest = await persistence.readManifest(root);
  // readManifest casts hand-editable YAML to the type, so an older manifest
  // can lack the key or hold another type there.
  const configured: unknown = manifest?.command;

  if (typeof configured === "string" && configured !== "") {
    _prefix = configured;
  }

  return _prefix;
};

/**
 * The variable through which the Go noskills binary (cmd/noskills) names the
 * command that runs it when it hands a command it has not ported to this
 * CLI. `noskills init` run through the binary then writes that command into
 * the manifest, so the hooks and the git wrapper call the binary, which
 * answers them without starting Node or asking a registry.
 */
export const CLI_PREFIX_ENV = "NOSKILLS_CLI_PREFIX";

/**
 * The prefix a NOSKILLS_CLI_PREFIX value names, or null when the value is
 * unset, blank or spans lines (the prefix goes into one-line shell commands).
 */
export const prefixFromEnv = (value: string | undefined): string | null => {
  const prefix = value?.trim() ?? "";

  return prefix === "" || /[\r\n]/.test(prefix) ? null : prefix;
};

/**
 * Detect prefix by analyzing execution context and argv.
 * Used during init to capture how the user invoked the CLI. The Go binary's
 * NOSKILLS_CLI_PREFIX comes first: the process here is the TypeScript CLI it
 * started, so argv would name Node instead.
 */
export const extractPrefix = async (): Promise<string> =>
  prefixFromEnv(crossRuntime.runtime.env.get(CLI_PREFIX_ENV)) ??
  (await crossRuntime.getCliPrefix(ESER_OPTS, ["noskills", "nos"])) ??
  schema.DEFAULT_COMMAND_PREFIX;
