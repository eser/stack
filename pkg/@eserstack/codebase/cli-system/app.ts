// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Identity of the binary the `system` commands are acting on.
 *
 * The system tree used to live in @eserstack/cli with "eser" written into it in
 * a dozen places. It is shared now — `eser`, `noskills` and `laroux` are all
 * shipped binaries built from this workspace, released at the same version by
 * the same pipeline — so the parts that differ between them are gathered here
 * and passed in, rather than each binary getting its own fork of install,
 * update, doctor and completions.
 *
 * @module
 */

/** What `system install` / `update` / `doctor` need to know about a binary. */
export type CliApp = {
  /** The command name, e.g. "noskills". Also the installed file name. */
  readonly command: string;
  /** How to run it from a source checkout, for doctor's guidance. */
  readonly devCommand: string;
  /** npm package that provides it, when one does. */
  readonly npmPackage?: string;
  /** JSR package that provides it, when one does. */
  readonly jsrPackage?: string;
};

/**
 * Falls back to the root command's own name.
 *
 * A binary that never declares an app descriptor still gets a working
 * `system completions` and `system version`, because both are answerable from
 * the command tree alone.
 */
export const appFromName = (command: string): CliApp => ({
  command,
  devCommand: `deno task cli ${command}`,
});
