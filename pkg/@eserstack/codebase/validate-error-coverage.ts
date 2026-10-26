// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Error struct field-coverage validator.
 *
 * Verifies that error-struct entries have non-empty required fields.
 *
 * @module
 */

import * as primitives from "@eserstack/primitives";
import * as shellFlags from "@eserstack/shell/args/flags";
import type * as shellArgs from "@eserstack/shell/args";
import * as span from "@eserstack/streams/span";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as cliSupport from "./cli-support.ts";

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
    const entryName = match[1] ?? "";
    const body = match[2] ?? "";
    checked++;

    const missing: string[] = [];

    for (const field of requiredFields) {
      const fieldRe = new RegExp(`^\\s*${escapeRe(field)}:\\s*"([^"]*)"`, "m");
      const fieldMatch = body.match(fieldRe);

      if (!fieldMatch || (fieldMatch[1] ?? "").trim() === "") {
        missing.push(field);
      }
    }

    if (missing.length > 0) {
      violations.push({ name: entryName, missing });
    }
  }

  return { violations, checked, passed: violations.length === 0 };
};

/** The arguments of `eser codebase validate-error-coverage`. */
export type ErrorCoverageArgs = {
  /** The `--file` path; empty when not given. */
  readonly file: string;
  /** The comma-separated `--error-objects` list. */
  readonly errorObjects: string[] | undefined;
  /** The comma-separated `--required-fields` list. */
  readonly requiredFields: string[] | undefined;
};

const splitList = (value: unknown): string[] | undefined =>
  typeof value === "string" ? value.split(",").map((s) => s.trim()) : undefined;

/** Parse the validate-error-coverage arguments: `--file`, `--error-objects`, `--required-fields`. */
export const parseCliArgs = (
  cliArgs?: readonly string[],
): ErrorCoverageArgs => {
  const { values } = shellFlags.parseArgs(cliArgs ?? [], {
    options: {
      file: { type: "string" },
      "error-objects": { type: "string" },
      "required-fields": { type: "string" },
    },
  });
  const file = values["file"];

  return {
    file: typeof file === "string" ? file : "",
    errorObjects: splitList(values["error-objects"]),
    requiredFields: splitList(values["required-fields"]),
  };
};

export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const { output: out } = cliSupport.getCliContext();

  const { file, errorObjects, requiredFields } = parseCliArgs(cliArgs);

  if (file === "") {
    out.writeln(
      span.red("✗"),
      span.text(" validate-error-coverage requires a --file argument"),
    );
    return primitives.results.fail({ exitCode: 1 });
  }

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
  // Entry point: the await only runs when this file is executed directly.
  // oxlint-disable-next-line node/no-top-level-await
  const result = await main(runtime.process.args as string[]);
  cliSupport.runCliMain(result, cliSupport.getCliContext().output);
}
