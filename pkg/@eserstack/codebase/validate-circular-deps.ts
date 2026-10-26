// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Circular dependency checker for workspace packages.
 *
 * Detects circular dependencies between packages in the workspace.
 *
 * @module
 */

import * as primitives from "@eserstack/primitives";
import type * as shellArgs from "@eserstack/shell/args";
import * as span from "@eserstack/streams/span";
import * as cliSupport from "./cli-support.ts";
import * as ffiClient from "./ffi-client.ts";

export type CheckCircularDepsOptions = {
  readonly root?: string;
};

export type CheckCircularDepsResult = {
  readonly hasCycles: boolean;
  readonly cycles: string[][];
  readonly packagesChecked: number;
};

export const checkCircularDeps = async (
  options: CheckCircularDepsOptions = {},
): Promise<CheckCircularDepsResult> => {
  const { root = "." } = options;

  await ffiClient.ensureLib();
  const lib = ffiClient.getLib();

  if (lib === null) {
    throw new Error("native library not available for checkCircularDeps");
  }

  const result = lib.call("codebaseCheckCircularDeps", {
    dir: root,
  }) as CheckCircularDepsResult & {
    error?: string;
  };

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
    const value = await checkCircularDeps({ root: "." });

    out.writeln(
      span.blue("ℹ"),
      span.text(` Checked ${value.packagesChecked} packages.`),
    );

    if (value.hasCycles) {
      out.writeln(
        span.red("✗"),
        span.text(` Found ${value.cycles.length} circular dependencies:`),
      );

      for (const cycle of value.cycles) {
        out.writeln(span.yellow("⚠"), span.text(` ${cycle.join(" → ")}`));
      }

      return primitives.results.fail({ exitCode: 1 });
    }

    out.writeln(span.green("✓"), span.text(" No circular dependencies found."));
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
