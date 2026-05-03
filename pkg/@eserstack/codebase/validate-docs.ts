// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Documentation validation tool.
 *
 * Validates JSDoc documentation for exported symbols.
 *
 * @module
 */

import * as primitives from "@eserstack/primitives";
import type * as shellArgs from "@eserstack/shell/args";
import * as span from "@eserstack/streams/span";
import { createCliOutput, runCliMain } from "./cli-support.ts";
import { ensureLib, getLib } from "./ffi-client.ts";

const out = createCliOutput();

export type CheckDocsOptions = {
  readonly root?: string;
  readonly requireExamples?: boolean;
};

export type DocIssueType =
  | "missing-description"
  | "missing-param"
  | "missing-returns"
  | "missing-example"
  | "empty-description";

export type DocIssue = {
  readonly file: string;
  readonly symbol: string;
  readonly issue: DocIssueType;
  readonly line?: number;
};

export type CheckDocsResult = {
  readonly isValid: boolean;
  readonly issues: DocIssue[];
  readonly filesChecked: number;
  readonly symbolsChecked: number;
};

export const checkDocs = async (
  options: CheckDocsOptions = {},
): Promise<CheckDocsResult> => {
  const { root = ".", requireExamples = false } = options;

  await ensureLib();
  const lib = getLib();

  if (lib === null) {
    throw new Error("native library not available for checkDocs");
  }

  const raw = lib.symbols.EserAjanCodebaseCheckDocs(
    JSON.stringify({ dir: root, requireExamples }),
  );
  const result = JSON.parse(raw) as CheckDocsResult & { error?: string };

  if (result.error) {
    throw new Error(result.error);
  }

  return result;
};

const formatIssue = (issue: DocIssueType): string => {
  switch (issue) {
    case "missing-description":
      return "Missing JSDoc documentation";
    case "missing-param":
      return "Missing @param documentation";
    case "missing-returns":
      return "Missing @returns documentation";
    case "missing-example":
      return "Missing @example";
    case "empty-description":
      return "Empty description";
  }
};

export const main = async (
  _cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  try {
    const value = await checkDocs({ root: "." });

    out.writeln(
      span.blue("ℹ"),
      span.text(
        ` Checked ${value.filesChecked} files, ${value.symbolsChecked} symbols.`,
      ),
    );

    if (!value.isValid) {
      out.writeln(
        span.red("✗"),
        span.text(` Found ${value.issues.length} documentation issues:`),
      );

      const byFile = new Map<string, DocIssue[]>();
      for (const issue of value.issues) {
        const existing = byFile.get(issue.file) ?? [];
        existing.push(issue);
        byFile.set(issue.file, existing);
      }

      for (const [file, fileIssues] of byFile) {
        out.writeln(span.yellow("⚠"), span.text(" " + file));
        for (const issue of fileIssues) {
          const lineInfo = issue.line !== undefined ? `:${issue.line}` : "";
          out.writeln(
            span.blue("ℹ"),
            span.text(
              `   ${issue.symbol}${lineInfo}: ${formatIssue(issue.issue)}`,
            ),
          );
        }
      }

      return primitives.results.fail({ exitCode: 1 });
    }

    out.writeln(span.green("✓"), span.text(" All documentation is valid."));
    return primitives.results.ok(undefined);
  } catch (err) {
    out.writeln(span.red("✗"), span.text(` ${String(err)}`));
    return primitives.results.fail({ exitCode: 1 });
  }
};

if (import.meta.main) {
  runCliMain(await main(), out);
}
