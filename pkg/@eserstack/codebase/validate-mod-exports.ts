// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Module exports completeness checker.
 *
 * Validates that mod.ts files export all public TypeScript files in a package.
 *
 * @module
 */

import * as primitives from "@eserstack/primitives";
import type * as shellArgs from "@eserstack/shell/args";
import * as span from "@eserstack/streams/span";
import { createCliOutput, runCliMain } from "./cli-support.ts";
import { ensureLib, getLib } from "./ffi-client.ts";

const out = createCliOutput();

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

  await ensureLib();
  const lib = getLib();

  if (lib === null) {
    throw new Error("native library not available for checkModExports");
  }

  const raw = lib.symbols.EserAjanCodebaseCheckModExports(
    JSON.stringify({ dir: root }),
  );
  const result = JSON.parse(raw) as CheckModExportsResult & { error?: string };

  if (result.error) {
    throw new Error(result.error);
  }

  return result;
};

export const main = async (
  _cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  try {
    const value = await checkModExports({ root: "." });

    out.writeln(
      span.blue("ℹ"),
      span.text(` Checked ${value.packagesChecked} packages.`),
    );

    if (!value.isComplete) {
      out.writeln(
        span.red("✗"),
        span.text(` Found ${value.missingExports.length} missing exports:`),
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
      span.text(" All mod.ts exports are complete."),
    );
    return primitives.results.ok(undefined);
  } catch (err) {
    out.writeln(span.red("✗"), span.text(` ${String(err)}`));
    return primitives.results.fail({ exitCode: 1 });
  }
};

if (import.meta.main) {
  runCliMain(await main(), out);
}
