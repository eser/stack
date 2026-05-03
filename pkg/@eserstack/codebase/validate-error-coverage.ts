// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Error struct field-coverage validator.
 *
 * Verifies that error-struct entries have non-empty required fields.
 *
 * @module
 */

import * as primitives from "@eserstack/primitives";
import * as cliParseArgs from "@std/cli/parse-args";
import type * as shellArgs from "@eserstack/shell/args";
import * as span from "@eserstack/streams/span";
import { runtime } from "@eserstack/standards/cross-runtime";
import { createCliContext, runCliMain } from "./cli-support.ts";

export type CheckErrorCoverageOptions = {
  readonly root?: string;
  readonly file: string;
  readonly errorObjects?: readonly string[];
  readonly requiredFields?: readonly string[];
};

export type CheckErrorCoverageResult = {
  readonly violations: readonly { name: string; missing: readonly string[] }[];
  readonly checked: number;
  readonly passed: boolean;
};

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const checkErrorCoverage = async (
  options: CheckErrorCoverageOptions,
): Promise<CheckErrorCoverageResult> => {
  const {
    root = ".",
    file,
    errorObjects = ["NSError"],
    requiredFields = ["Code", "Cause", "Fix"],
  } = options;

  const filePath = runtime.path.join(root, file);
  const content = await runtime.fs.readTextFile(filePath);

  const typeAlternation = errorObjects.map(escapeRe).join("|");
  const blockRe = new RegExp(
    `(\\w+):\\s*&(?:${typeAlternation})\\{([^}]+)\\}`,
    "gs",
  );

  const violations: { name: string; missing: string[] }[] = [];
  let checked = 0;

  for (const match of content.matchAll(blockRe)) {
    const entryName = match[1];
    const body = match[2];
    checked++;

    const missing: string[] = [];

    for (const field of requiredFields) {
      const fieldRe = new RegExp(
        `^\\s*${escapeRe(field)}:\\s*"([^"]*)"`,
        "m",
      );
      const fieldMatch = body.match(fieldRe);

      if (!fieldMatch || fieldMatch[1].trim() === "") {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      violations.push({ name: entryName, missing });
    }
  }

  return { violations, checked, passed: violations.length === 0 };
};

export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const { output: out } = createCliContext();

  const parsed = cliParseArgs.parseArgs((cliArgs ?? []) as string[], {
    string: ["file", "error-objects", "required-fields"],
    default: {},
  });

  const file = parsed["file"] as string | undefined;

  if (!file) {
    out.writeln(
      span.red("✗"),
      span.text(" validate-error-coverage requires a --file argument"),
    );
    return primitives.results.fail({ exitCode: 1 });
  }

  const errorObjects = parsed["error-objects"] !== undefined
    ? (parsed["error-objects"] as string).split(",").map((s) => s.trim())
    : undefined;

  const requiredFields = parsed["required-fields"] !== undefined
    ? (parsed["required-fields"] as string).split(",").map((s) => s.trim())
    : undefined;

  try {
    const result = await checkErrorCoverage({
      root: ".",
      file,
      errorObjects,
      requiredFields,
    });

    out.writeln(
      span.blue("ℹ"),
      span.text(` Checked ${result.checked} error entries in ${file}.`),
    );

    if (!result.passed) {
      out.writeln(
        span.red("✗"),
        span.text(
          ` Found ${result.violations.length} entry(ies) with missing fields:`,
        ),
      );

      for (const v of result.violations) {
        out.writeln(
          span.yellow("⚠"),
          span.text(` ${v.name}: missing [${v.missing.join(", ")}]`),
        );
      }

      return primitives.results.fail({ exitCode: 1 });
    }

    out.writeln(
      span.green("✓"),
      span.text(" All error entries have required fields populated."),
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
