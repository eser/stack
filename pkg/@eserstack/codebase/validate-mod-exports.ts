// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Module reachability checker.
 *
 * Reports the top-level modules of each package that no entry point reaches:
 * mod.ts, the exports map, the package.json bin, main and module fields, and
 * any module that runs as a program. Such a module is missing from the exports
 * or is dead code.
 *
 * @module
 */

import * as primitives from "@eserstack/primitives";
import type * as shellArgs from "@eserstack/shell/args";
import * as span from "@eserstack/streams/span";
import * as cliSupport from "./cli-support.ts";
import * as ffiClient from "./ffi-client.ts";

export type CheckModExportsOptions = {
  readonly root?: string;
  readonly failFast?: boolean;
};

export type MissingExport = {
  readonly packageName: string;
  readonly file: string;
};

export type CheckModExportsResult = {
  readonly isComplete: boolean;
  readonly missingExports: MissingExport[];
  readonly packagesChecked: number;
};

export const checkModExports = async (
  options: CheckModExportsOptions = {},
): Promise<CheckModExportsResult> => {
  const { root = "." } = options;

  await ffiClient.ensureLib();
  const lib = ffiClient.getLib();

  if (lib === null) {
    throw new Error("native library not available for checkModExports");
  }

  const result = lib.call("codebaseCheckModExports", {
    dir: root,
  }) as CheckModExportsResult & { error?: string };

  if (result.error) {
    throw new Error(result.error);
  }

  return result;
};

export const main = async (
  _cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const { output: out } = cliSupport.getCliContext();

  try {
    const value = await checkModExports({ root: "." });

    out.writeln(
      span.blue("ℹ"),
      span.text(` Checked ${value.packagesChecked} packages.`),
    );

    if (!value.isComplete) {
      out.writeln(
        span.red("✗"),
        span.text(
          ` Found ${value.missingExports.length} modules no entry point reaches (export them or remove them):`,
        ),
      );

      for (const missing of value.missingExports) {
        out.writeln(
          span.yellow("⚠"),
          span.text(` ${missing.packageName}: ${missing.file}`),
        );
      }

      return primitives.results.fail({ exitCode: 1 });
    }

    out.writeln(
      span.green("✓"),
      span.text(" Every module is reached from a package entry point."),
    );
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
