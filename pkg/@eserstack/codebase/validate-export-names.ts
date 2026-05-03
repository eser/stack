// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Export naming convention checker.
 *
 * Validates that export paths in deno.json follow kebab-case convention.
 *
 * @module
 */

import * as primitives from "@eserstack/primitives";
import type * as shellArgs from "@eserstack/shell/args";
import * as span from "@eserstack/streams/span";
import { createCliOutput, runCliMain } from "./cli-support.ts";
import { ensureLib, getLib } from "./ffi-client.ts";

const out = createCliOutput();

export type CheckExportNamesOptions = {
  readonly root?: string;
  readonly ignoreWords?: string[];
};

export type ExportNameViolation = {
  readonly packageName: string;
  readonly exportPath: string;
  readonly suggestion: string;
};

export type CheckExportNamesResult = {
  readonly isValid: boolean;
  readonly violations: ExportNameViolation[];
  readonly packagesChecked: number;
};

export const checkExportNames = async (
  options: CheckExportNamesOptions = {},
): Promise<CheckExportNamesResult> => {
  const { root = ".", ignoreWords = [] } = options;

  await ensureLib();
  const lib = getLib();

  if (lib === null) {
    throw new Error("native library not available for checkExportNames");
  }

  const raw = lib.symbols.EserAjanCodebaseCheckExportNames(
    JSON.stringify({ dir: root, ignoreWords }),
  );
  const result = JSON.parse(raw) as CheckExportNamesResult & { error?: string };

  if (result.error) {
    throw new Error(result.error);
  }

  return result;
};

export const main = async (
  _cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  try {
    const value = await checkExportNames({ root: "." });

    out.writeln(
      span.blue("ℹ"),
      span.text(` Checked ${value.packagesChecked} packages.`),
    );

    if (!value.isValid) {
      out.writeln(
        span.red("✗"),
        span.text(` Found ${value.violations.length} naming violations:`),
      );

      for (const violation of value.violations) {
        out.writeln(span.yellow("⚠"), span.text(" " + violation.packageName));
        out.writeln(
          span.blue("ℹ"),
          span.text(`   Export: ${violation.exportPath}`),
        );
        out.writeln(
          span.blue("ℹ"),
          span.text(`   Suggestion: ${violation.suggestion}`),
        );
      }

      return primitives.results.fail({ exitCode: 1 });
    }

    out.writeln(
      span.green("✓"),
      span.text(" All export names follow conventions."),
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
