// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Documentation validation tool.
 *
 * Validates JSDoc documentation for exported symbols.
 * Checks for @param, @returns, @example tags.
 *
 * Library usage:
 * ```typescript
 * import * as docs from "@eser/codebase/check-docs";
 *
 * const result = await docs.checkDocs();
 * if (!result.isValid) {
 *   console.log("Issues:", result.issues);
 * }
 * ```
 *
 * CLI usage:
 *   deno run --allow-all ./check-docs.ts
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as handler from "@eser/functions/handler";
import type { CliEvent } from "@eser/functions/triggers";
import { fromPromise } from "@eser/functions/task";
import * as standardsRuntime from "@eser/standards/runtime";
import type * as shellArgs from "@eser/shell/args";
import * as fmt from "@eser/shell/formatting";
import * as workspaceDiscovery from "./workspace-discovery.ts";
import { runCliMain } from "./cli-support.ts";

/**
 * Options for documentation checking.
 */
export type CheckDocsOptions = {
  /** Root directory (default: ".") */
  readonly root?: string;
  /** Require @example tags */
  readonly requireExamples?: boolean;
};

/**
 * Type of documentation issue.
 */
export type DocIssueType =
  | "missing-description"
  | "missing-param"
  | "missing-returns"
  | "missing-example"
  | "empty-description";

/**
 * Information about a documentation issue.
 */
export type DocIssue = {
  /** File path */
  readonly file: string;
  /** Symbol name */
  readonly symbol: string;
  /** Issue type */
  readonly issue: DocIssueType;
  /** Line number (if available) */
  readonly line?: number;
};

/**
 * Result of documentation check.
 */
export type CheckDocsResult = {
  /** Whether all documentation is valid */
  readonly isValid: boolean;
  /** Documentation issues */
  readonly issues: DocIssue[];
  /** Number of files checked */
  readonly filesChecked: number;
  /** Number of symbols checked */
  readonly symbolsChecked: number;
};

/**
 * Regex patterns for JSDoc parsing.
 */
const JSDOC_PATTERN = /\/\*\*\s*([\s\S]*?)\s*\*\//g;
const EXPORT_PATTERN =
  /export\s+(const|function|class|type|interface)\s+(\w+)/g;
const EXAMPLE_PATTERN = /@example/;

/**
 * Extracts JSDoc comments and their associated exports from a file.
 *
 * @param content - File content
 * @returns Array of { jsdoc, symbolName, line } objects
 */
const extractJSDocAndExports = (
  content: string,
): { jsdoc: string | null; symbolName: string; line: number }[] => {
  const results: { jsdoc: string | null; symbolName: string; line: number }[] =
    [];

  // Find all export statements
  let match: RegExpExecArray | null;
  EXPORT_PATTERN.lastIndex = 0;
  while ((match = EXPORT_PATTERN.exec(content)) !== null) {
    const exportIndex = match.index;
    const symbolName = match[2];

    if (symbolName === undefined) {
      continue;
    }

    // Calculate line number
    const textBefore = content.substring(0, exportIndex);
    const lineNumber = textBefore.split("\n").length;

    // Look for JSDoc comment before the export
    let jsdoc: string | null = null;

    // Search backwards for a JSDoc comment
    const beforeExport = content.substring(0, exportIndex);
    const jsdocMatches = [...beforeExport.matchAll(JSDOC_PATTERN)];

    if (jsdocMatches.length > 0) {
      const lastJsdoc = jsdocMatches[jsdocMatches.length - 1];
      if (lastJsdoc !== undefined) {
        const jsdocEnd = (lastJsdoc.index ?? 0) + lastJsdoc[0].length;

        // Check if JSDoc is immediately before export (only whitespace between)
        const between = content.substring(jsdocEnd, exportIndex);
        if (/^\s*$/.test(between)) {
          jsdoc = lastJsdoc[1] ?? null;
        }
      }
    }

    results.push({ jsdoc, symbolName, line: lineNumber });
  }

  return results;
};

/**
 * Validates a JSDoc comment for completeness.
 *
 * @param jsdoc - JSDoc content (without comment markers)
 * @param symbolName - Name of the symbol
 * @param requireExamples - Whether to require @example
 * @returns Array of issue types
 */
const validateJSDoc = (
  jsdoc: string | null,
  _symbolName: string,
  requireExamples: boolean,
): DocIssueType[] => {
  const issues: DocIssueType[] = [];

  if (jsdoc === null) {
    issues.push("missing-description");
    return issues;
  }

  // Check for description
  const descriptionLine = jsdoc.split("\n")[0]?.trim();
  if (!descriptionLine || descriptionLine.startsWith("@")) {
    issues.push("empty-description");
  }

  // Check for @returns (only for functions)
  // Note: We can't easily determine if it's a function from here,
  // so we skip this check for now

  // Check for @example if required
  if (requireExamples && !EXAMPLE_PATTERN.test(jsdoc)) {
    issues.push("missing-example");
  }

  return issues;
};

/**
 * Checks documentation for all workspace packages.
 *
 * @param options - Check options
 * @returns Check result
 */
export const checkDocs = async (
  options: CheckDocsOptions = {},
): Promise<CheckDocsResult> => {
  const { root = ".", requireExamples = false } = options;

  const packages = await workspaceDiscovery.discoverPackages(root);
  const issues: DocIssue[] = [];
  let filesChecked = 0;
  let symbolsChecked = 0;

  for (const pkg of packages) {
    const files = await workspaceDiscovery.getPackageFiles(pkg.path);

    for (const file of files) {
      const filePath = workspaceDiscovery.resolveModulePath(file, pkg.path);

      let content: string;
      try {
        content = await standardsRuntime.runtime.fs.readTextFile(filePath);
      } catch {
        continue;
      }

      filesChecked++;

      const exports = extractJSDocAndExports(content);

      for (const { jsdoc, symbolName, line } of exports) {
        symbolsChecked++;

        const symbolIssues = validateJSDoc(jsdoc, symbolName, requireExamples);

        for (const issue of symbolIssues) {
          issues.push({
            file: filePath,
            symbol: symbolName,
            issue,
            line,
          });
        }
      }
    }
  }

  return {
    isValid: issues.length === 0,
    issues,
    filesChecked,
    symbolsChecked,
  };
};

/**
 * Formats an issue type for display.
 *
 * @param issue - Issue type
 * @returns Human-readable description
 */
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

// --- Handler ---

/**
 * Handler wrapping checkDocs as a Task.
 */
export const checkDocsHandler: handler.Handler<
  CheckDocsOptions,
  CheckDocsResult,
  Error
> = (input) => fromPromise(() => checkDocs(input));

// --- CLI Adapter ---

/**
 * Adapter that produces default CheckDocsOptions from a CLI event.
 */
const cliAdapter: handler.Adapter<CliEvent, CheckDocsOptions> = (
  _event,
) => results.ok({ root: "." });

// --- CLI ResponseMapper ---

/**
 * Maps the handler result to CLI output.
 */
const cliResponseMapper: handler.ResponseMapper<
  CheckDocsResult,
  Error | handler.AdaptError,
  shellArgs.CliResult<void>
> = (result) => {
  if (results.isFail(result)) {
    fmt.printError(String(result.error));
    return results.fail({ exitCode: 1 });
  }

  const { value } = result;

  fmt.printInfo(
    `Checked ${value.filesChecked} files, ${value.symbolsChecked} symbols.`,
  );

  if (!value.isValid) {
    fmt.printError(
      `Found ${value.issues.length} documentation issues:`,
    );

    // Group by file
    const byFile = new Map<string, DocIssue[]>();
    for (const issue of value.issues) {
      const existing = byFile.get(issue.file) ?? [];
      existing.push(issue);
      byFile.set(issue.file, existing);
    }

    for (const [file, fileIssues] of byFile) {
      fmt.printWarning(file);
      for (const issue of fileIssues) {
        const lineInfo = issue.line !== undefined ? `:${issue.line}` : "";
        fmt.printInfo(
          `  ${issue.symbol}${lineInfo}: ${formatIssue(issue.issue)}`,
        );
      }
    }

    return results.fail({ exitCode: 1 });
  }

  fmt.printSuccess("All documentation is valid.");
  return results.ok(undefined);
};

// --- CLI Trigger ---

/**
 * CLI trigger for check-docs.
 */
export const handleCli: (
  event: CliEvent,
) => Promise<shellArgs.CliResult<void>> = handler.createTrigger({
  handler: checkDocsHandler,
  adaptInput: cliAdapter,
  adaptOutput: cliResponseMapper,
});

/** CLI entry point for dispatcher compatibility. */
export const main = async (
  _cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> =>
  await handleCli({ command: "check-docs", args: [], flags: {} });

if (import.meta.main) {
  runCliMain(await main());
}
