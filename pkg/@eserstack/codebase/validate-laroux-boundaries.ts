// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The import rules of the laroux packages (decision-46, decision-53).
 *
 * The check runs in Go (codebasefx.CheckLarouxBoundaries), on the shared lexer,
 * so text in comments and string literals is never taken for an import. It
 * needs the native library.
 *
 * @module
 */

import * as primitives from "@eserstack/primitives";
import type * as shellArgs from "@eserstack/shell/args";
import * as span from "@eserstack/streams/span";
import * as cliSupport from "./cli-support.ts";
import * as ffiClient from "./ffi-client.ts";
import * as gitListing from "./git-listing.ts";

export type CheckLarouxBoundariesOptions = {
  readonly root?: string;
  /** The allowlist file, relative to the root. */
  readonly allowlist?: string;
  readonly exclude?: readonly string[];
};

export type LarouxBoundaryIssue = {
  readonly severity: "error";
  readonly file: string;
  readonly line?: number;
  readonly message: string;
};

export type CheckLarouxBoundariesResult = {
  readonly issues: readonly LarouxBoundaryIssue[];
  readonly filesChecked: number;
};

export const checkLarouxBoundaries = async (
  options: CheckLarouxBoundariesOptions = {},
): Promise<CheckLarouxBoundariesResult> => {
  const { root = "." } = options;

  await ffiClient.ensureLib();
  const lib = ffiClient.getLib();

  if (lib === null) {
    throw new Error("native library not available for checkLarouxBoundaries");
  }

  const result = lib.call("codebaseCheckLarouxBoundaries", {
    dir: root,
    allowlist: options.allowlist,
    exclude: options.exclude,
    ...(await gitListing.bridgeGitOptions(lib, root)),
  }) as CheckLarouxBoundariesResult & { error?: string };

  if (result.error !== undefined && result.error !== "") {
    throw new Error(result.error);
  }

  return result;
};

export const main = async (
  _cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const { output: out } = cliSupport.getCliContext();

  try {
    const value = await checkLarouxBoundaries({ root: "." });

    out.writeln(
      span.blue("ℹ"),
      span.text(` Checked ${value.filesChecked} files.`),
    );

    if (value.issues.length > 0) {
      for (const issue of value.issues) {
        const location =
          issue.line === undefined ? issue.file : `${issue.file}:${issue.line}`;
        out.writeln(span.red("✗"), span.text(` ${location}: ${issue.message}`));
      }

      return primitives.results.fail({ exitCode: 1 });
    }

    out.writeln(span.green("✓"), span.text(" The laroux boundaries hold."));
    return primitives.results.ok(undefined);
  } catch (err) {
    out.writeln(span.red("✗"), span.text(` ${String(err)}`));
    return primitives.results.fail({ exitCode: 1 });
  }
};

if (import.meta.main) {
  // Entry point: the await only runs when this file is executed directly.
  // oxlint-disable-next-line node/no-top-level-await
  const result = await main();
  cliSupport.runCliMain(result, cliSupport.getCliContext().output);
}
