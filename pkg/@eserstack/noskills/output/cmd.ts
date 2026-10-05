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
  devCommand: "deno task cli",
  npmPackage: "eser",
  jsrPackage: "@eserstack/cli",
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
 * `deno task cli noskills`) rather than the npx default. The current prefix
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
 * Detect prefix by analyzing execution context and argv.
 * Used during init to capture how the user invoked the CLI.
 */
export const extractPrefix = async (): Promise<string> =>
  (await crossRuntime.getCliPrefix(ESER_OPTS, ["noskills", "nos"])) ??
    schema.DEFAULT_COMMAND_PREFIX;
