// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Server LOC ceiling validator.
 *
 * Fails if any non-test file in a directory exceeds the configured line limit.
 *
 * @module
 */

import * as primitives from "@eserstack/primitives";
import * as cliParseArgs from "@std/cli/parse-args";
import type * as shellArgs from "@eserstack/shell/args";
import * as span from "@eserstack/streams/span";
import { runtime } from "@eserstack/standards/cross-runtime";
import { createCliContext, runCliMain } from "./cli-support.ts";

export type CheckServerLocOptions = {
  readonly root?: string;
  readonly directory: string;
  readonly maxLines?: number;
  readonly excludeSuffix?: string;
  readonly extension?: string;
};

export type CheckServerLocResult = {
  readonly violations: readonly { path: string; lines: number }[];
  readonly checked: number;
  readonly passed: boolean;
};

export const checkServerLoc = async (
  options: CheckServerLocOptions,
): Promise<CheckServerLocResult> => {
  const {
    root = ".",
    directory,
    maxLines = 500,
    excludeSuffix = "_test.go",
    extension = "go",
  } = options;

  const ext = extension.startsWith(".") ? extension.slice(1) : extension;
  const dirPath = runtime.path.join(root, directory);
  const violations: { path: string; lines: number }[] = [];
  let checked = 0;

  for await (
    const entry of runtime.fs.walk(dirPath, {
      exts: [ext],
      includeDirs: false,
    })
  ) {
    if (entry.path.endsWith(excludeSuffix)) {
      continue;
    }

    const content = await runtime.fs.readTextFile(entry.path);
    const lines = content.split("\n").length;
    checked++;

    if (lines > maxLines) {
      violations.push({ path: entry.path, lines });
    }
  }

  return { violations, checked, passed: violations.length === 0 };
};

export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const { output: out } = createCliContext();

  const parsed = cliParseArgs.parseArgs((cliArgs ?? []) as string[], {
    string: ["directory", "exclude-suffix", "extension"],
    default: {},
  });

  const directory = parsed["directory"] as string | undefined;

  if (!directory) {
    out.writeln(
      span.red("✗"),
      span.text(" validate-server-loc requires a --directory argument"),
    );
    return primitives.results.fail({ exitCode: 1 });
  }

  const maxLinesRaw = parsed["max-lines"];
  const maxLines = maxLinesRaw !== undefined ? Number(maxLinesRaw) : undefined;

  try {
    const result = await checkServerLoc({
      root: ".",
      directory,
      maxLines,
      excludeSuffix: parsed["exclude-suffix"] as string | undefined,
      extension: parsed["extension"] as string | undefined,
    });

    out.writeln(
      span.blue("ℹ"),
      span.text(` Checked ${result.checked} files in ${directory}.`),
    );

    if (!result.passed) {
      out.writeln(
        span.red("✗"),
        span.text(
          ` Found ${result.violations.length} file(s) exceeding the line ceiling:`,
        ),
      );

      for (const v of result.violations) {
        out.writeln(
          span.yellow("⚠"),
          span.text(` ${v.path}: ${v.lines} lines (limit ${maxLines ?? 500})`),
        );
      }

      return primitives.results.fail({ exitCode: 1 });
    }

    out.writeln(
      span.green("✓"),
      span.text(" All files within the line ceiling."),
    );
    return primitives.results.ok(undefined);
  } catch (err) {
    out.writeln(span.red("✗"), span.text(` ${String(err)}`));
    return primitives.results.fail({ exitCode: 1 });
  }
};

if (import.meta.main) {
  const { output: out } = createCliContext();
  runCliMain(await main(Deno.args), out);
}
