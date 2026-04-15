// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Command prefix — captured from process.argv at init, stored in manifest,
 * read from manifest on every subsequent call.
 *
 * @module
 */

import { getCliPrefix } from "@eserstack/standards/cross-runtime";
import type { CliCommandOptions } from "@eserstack/standards/cross-runtime";

const ESER_OPTS: CliCommandOptions = {
  command: "eser",
  devCommand: "deno task cli",
  npmPackage: "eser",
  jsrPackage: "@eserstack/cli",
};

const DEFAULT_CMD = "npx eser@latest noskills";

let _prefix: string = DEFAULT_CMD;

/** Set the prefix (called when reading manifest or during init). */
export const setCommandPrefix = (prefix: string): void => {
  _prefix = prefix;
};

/** Get the current prefix. */
export const cmdPrefix = (): string => _prefix;

/** Build a full command: prefix + subcommand. */
export const cmd = (subcommand: string): string => `${_prefix} ${subcommand}`;

/**
 * Detect prefix by analyzing execution context and argv.
 * Used during init to capture how the user invoked the CLI.
 */
export const extractPrefix = async (): Promise<string> =>
  (await getCliPrefix(ESER_OPTS, ["noskills", "nos"])) ?? DEFAULT_CMD;
