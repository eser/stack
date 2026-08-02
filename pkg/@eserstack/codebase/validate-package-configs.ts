// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Package configuration consistency checker.
 *
 * Validates that package.json and deno.json files have consistent
 * values for name, version, and exports fields.
 *
 * @module
 */

import * as primitives from "@eserstack/primitives";
import * as fp from "@eserstack/fp";
import type * as shellArgs from "@eserstack/shell/args";
import * as span from "@eserstack/streams/span";
import { createCliOutput, runCliMain } from "./cli-support.ts";
import { ensureLib, getLib } from "./ffi-client.ts";

const out = createCliOutput();

export type ConsistencyField = "name" | "version" | "exports";

export type DependencyInconsistency = {
  readonly packageName: string;
  readonly dependencyName: string;
  readonly issue: "missing_in_deno" | "missing_in_package" | "version_mismatch";
  readonly expected?: string;
  readonly actual?: string;
};

export type ConfigInconsistency = {
  readonly packageName: string;
  readonly field: ConsistencyField;
  readonly denoValue: unknown;
  readonly packageValue: unknown;
};

export type CheckPackageConfigsOptions = {
  readonly root?: string;
  readonly failFast?: boolean;
};

export type CheckPackageConfigsResult = {
  readonly isConsistent: boolean;
  readonly inconsistencies: ReadonlyArray<ConfigInconsistency>;
  readonly dependencyInconsistencies: ReadonlyArray<DependencyInconsistency>;
  readonly packagesChecked: number;
};

export const checkPackageConfigs = async (
  options: CheckPackageConfigsOptions = {},
): Promise<CheckPackageConfigsResult> => {
  const { root = "." } = options;

  await ensureLib();
  const lib = getLib();

  if (lib === null) {
    throw new Error("native library not available for checkPackageConfigs");
  }

  const raw = lib.symbols.EserAjanCodebaseCheckPackageConfigs(
    JSON.stringify({ dir: root }),
  );
  const result = JSON.parse(raw) as CheckPackageConfigsResult & {
    error?: string;
  };

  if (result.error) {
    throw new Error(result.error);
  }

  return result;
};

const formatDepIssue = (inc: DependencyInconsistency): string => {
  switch (inc.issue) {
    case "missing_in_deno":
      return `Missing in deno.json imports. Expected: ${inc.expected}`;
    case "missing_in_package":
      return `Extra in deno.json imports (not in package.json): ${inc.actual}`;
    case "version_mismatch":
      return `Version mismatch. Expected: ${inc.expected}, Actual: ${inc.actual}`;
  }
};

export const main = async (
  _cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  try {
    const value = await checkPackageConfigs({ root: "." });

    out.writeln(
      span.blue("ℹ"),
      span.text(` Checked ${value.packagesChecked} packages.`),
    );

    if (!value.isConsistent) {
      if (value.inconsistencies.length > 0) {
        out.writeln(
          span.red("✗"),
          span.text(
            ` Found ${value.inconsistencies.length} field inconsistencies:`,
          ),
        );

        const byPackage = fp.groupBy(
          value.inconsistencies as ConfigInconsistency[],
          (inc) => inc.packageName,
        );

        for (const [pkgName, inconsistencies] of Object.entries(byPackage)) {
          out.writeln(span.yellow("⚠"), span.text(" " + pkgName));
          for (const inc of inconsistencies) {
            out.writeln(span.red("✗"), span.text(`   ${inc.field} mismatch:`));
            out.writeln(
              span.blue("ℹ"),
              span.text(
                `     deno.json:    ${JSON.stringify(inc.denoValue)}`,
              ),
            );
            out.writeln(
              span.blue("ℹ"),
              span.text(
                `     package.json: ${JSON.stringify(inc.packageValue)}`,
              ),
            );
          }
        }
      }

      if (value.dependencyInconsistencies.length > 0) {
        out.writeln(
          span.red("✗"),
          span.text(
            ` Found ${value.dependencyInconsistencies.length} dependency inconsistencies:`,
          ),
        );

        const byPackage = fp.groupBy(
          value.dependencyInconsistencies as DependencyInconsistency[],
          (inc) => inc.packageName,
        );

        for (const [pkgName, inconsistencies] of Object.entries(byPackage)) {
          out.writeln(span.yellow("⚠"), span.text(" " + pkgName));
          for (const inc of inconsistencies) {
            out.writeln(
              span.red("✗"),
              span.text(`   ${inc.dependencyName}:`),
            );
            out.writeln(
              span.blue("ℹ"),
              span.text(`     ${formatDepIssue(inc)}`),
            );
          }
        }
      }

      return primitives.results.fail({ exitCode: 1 });
    }

    out.writeln(
      span.green("✓"),
      span.text(" All package configs are consistent."),
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
