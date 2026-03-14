// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Commit message checker — validates conventional commit format.
 *
 * Format: `type(scope): message`
 * Required scopes: ci, chore, docs, feat, fix, perf, refactor, revert, test
 *
 * Can be used as a git commit-msg hook or standalone validator.
 *
 * @module
 */

import * as cliParseArgs from "@std/cli/parse-args";
import * as primitives from "@eser/primitives";
import * as standards from "@eser/standards";
import * as shell from "@eser/shell";
import { runCliMain } from "./cli-support.ts";

const output = shell.formatting.createOutput();

// =============================================================================
// Validation logic (pure)
// =============================================================================

const VALID_TYPES = new Set([
  "ci",
  "chore",
  "docs",
  "feat",
  "fix",
  "perf",
  "refactor",
  "revert",
  "test",
]);

const CONVENTIONAL_PATTERN = /^(\w+)(?:\(([^)]+)\))?!?:\s{1,5}.+$/;

/**
 * Result of validating a commit message.
 */
export type CommitMsgResult = {
  readonly valid: boolean;
  readonly issues: readonly string[];
};

/**
 * Validate a commit message against conventional commit format.
 */
export const validateCommitMsg = (message: string): CommitMsgResult => {
  const issues: string[] = [];

  // Take first line only
  const firstLine = message.split("\n")[0]?.trim() ?? "";

  if (firstLine === "") {
    return { valid: false, issues: ["commit message is empty"] };
  }

  // Skip merge commits
  if (firstLine.startsWith("Merge ")) {
    return { valid: true, issues: [] };
  }

  const match = firstLine.match(CONVENTIONAL_PATTERN);
  if (match === null) {
    issues.push(
      `invalid format: expected "type(scope): message", got: "${firstLine}"`,
    );
    return { valid: false, issues };
  }

  const type = match[1]!.toLowerCase();
  const scope = match[2];

  if (!VALID_TYPES.has(type)) {
    issues.push(
      `invalid type "${type}". Must be one of: ${[...VALID_TYPES].join(", ")}`,
    );
  }

  if (scope === undefined || scope.trim() === "") {
    issues.push("scope is required: use type(scope): message");
  }

  return { valid: issues.length === 0, issues };
};

// =============================================================================
// CLI
// =============================================================================

/**
 * CLI entry point. Accepts a commit message file path as first argument
 * (for use as git commit-msg hook) or --message flag.
 */
export const main = async (
  cliArgs?: readonly string[],
): Promise<shell.args.CliResult<void>> => {
  const parsed = cliParseArgs.parseArgs(
    (cliArgs ?? []) as string[],
    {
      string: ["message"],
      boolean: ["help"],
      alias: { h: "help", m: "message" },
    },
  );

  if (parsed.help) {
    console.log(
      "eser codebase validate-commit-msg — Validate conventional commit format\n",
    );
    console.log("Usage:");
    console.log("  eser codebase validate-commit-msg <commit-msg-file>");
    console.log("  eser codebase validate-commit-msg --message 'feat(x): msg'");
    return primitives.results.ok(undefined);
  }

  let message: string;

  if (parsed.message !== undefined) {
    message = parsed.message;
  } else if (parsed._.length > 0) {
    // Read from file (git commit-msg hook passes the file path)
    try {
      message = await standards.runtime.current.fs.readTextFile(
        String(parsed._[0]),
      );
    } catch {
      output.printError(`cannot read commit message file: ${parsed._[0]}`);
      return primitives.results.fail({ exitCode: 1 });
    }
  } else {
    output.printError("no commit message provided");
    return primitives.results.fail({ exitCode: 1 });
  }

  const result = validateCommitMsg(message);

  if (result.valid) {
    output.printSuccess("commit message is valid");
    return primitives.results.ok(undefined);
  }

  for (const issue of result.issues) {
    output.printError(issue);
  }
  return primitives.results.fail({ exitCode: 1 });
};

if (import.meta.main) {
  runCliMain(await main(standards.runtime.current.process.args as string[]));
}
