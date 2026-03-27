// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * CHANGELOG auto-generation from conventional commits.
 *
 * Reads git history since the last tag, parses conventional commit messages,
 * deduplicates "take" series, and prepends a new section to CHANGELOG.md.
 *
 * Library usage:
 * ```typescript
 * import * as changelogGen from "@eser/codebase/changelog-gen";
 *
 * // Parse commits into changelog entries
 * const entries = changelogGen.parseConventionalCommits([
 *   { subject: "feat(auth): add login", hash: "abc123", body: "" },
 * ]);
 *
 * // Generate a changelog section
 * const section = changelogGen.generateChangelogSection("4.1.2", entries);
 * ```
 *
 * CLI usage:
 *   deno run --allow-all ./changelog-gen.ts [--dry-run]
 *
 * @module
 */

import * as cliParseArgs from "@std/cli/parse-args";
import * as primitives from "@eser/primitives";
import * as standards from "@eser/standards";
import * as functions from "@eser/functions";
import type * as shellArgs from "@eser/shell/args";
import * as span from "@eser/streams/span";
import * as git from "./git.ts";
import { readVersionFile } from "./versions.ts";
import { createCliOutput, runCliMain, toCliEvent } from "./cli-support.ts";

const out = createCliOutput();

// =============================================================================
// Types
// =============================================================================

/**
 * A parsed conventional commit.
 */
export type ConventionalCommit = {
  /** Commit type (feat, fix, refactor, etc.) */
  readonly type: string;
  /** Commit scope (optional, e.g., "auth" in "feat(auth): message") */
  readonly scope: string | undefined;
  /** Commit message (after the colon) */
  readonly message: string;
  /** Original commit hash */
  readonly hash: string;
};

/**
 * CHANGELOG section name from Keep a Changelog format.
 */
export type ChangelogSection =
  | "Added"
  | "Fixed"
  | "Changed"
  | "Removed";

/**
 * Options for generating a changelog.
 */
export type GenerateChangelogOptions = {
  /** Root directory containing VERSION and CHANGELOG.md (default: ".") */
  readonly root?: string;
  /** Preview without writing to CHANGELOG.md (default: false) */
  readonly dryRun?: boolean;
};

/**
 * Result of generating a changelog.
 */
export type GenerateChangelogResult = {
  /** The version for this release */
  readonly version: string;
  /** Number of commits processed */
  readonly commitCount: number;
  /** Number of unique entries (after dedup) */
  readonly entryCount: number;
  /** The generated markdown content */
  readonly content: string;
  /** Whether this was a dry run */
  readonly dryRun: boolean;
};

// =============================================================================
// Commit type → CHANGELOG section mapping
// =============================================================================

const SECTION_MAP: Record<string, ChangelogSection> = {
  feat: "Added",
  fix: "Fixed",
  refactor: "Changed",
  perf: "Changed",
  docs: "Changed",
  revert: "Removed",
};

/** Commit types that are skipped (not user-facing) */
const SKIP_TYPES = new Set(["chore", "ci", "test"]);

// =============================================================================
// Pure functions (exported for testing)
// =============================================================================

/**
 * Pattern for conventional commit: type(scope): message
 * Also handles: type: message (no scope)
 */
const CONVENTIONAL_PATTERN = /^(\w+)(?:\(([^)]+)\))?!?:\s{1,5}(.+)$/;

/**
 * Pattern for "take" suffix: (take II), (take III), (take 2), etc.
 * Supports Roman numerals (I, V, X, L, C, D, M) and Arabic numbers.
 */
const TAKE_PATTERN = /\s{0,100}\(take\s{1,100}[IVXLCDM\d]+\)\s{0,100}\.?$/i;

/**
 * Parse a single commit subject as a conventional commit.
 * Returns undefined if the subject doesn't match the conventional format.
 */
export const parseConventionalCommit = (
  subject: string,
  hash: string,
): ConventionalCommit | undefined => {
  const match = subject.match(CONVENTIONAL_PATTERN);
  if (match === null) {
    return undefined;
  }

  return {
    type: match[1]!.toLowerCase(),
    scope: match[2],
    message: match[3]!.trim(),
    hash,
  };
};

/**
 * Strip the "take" suffix from a message.
 * "authentication system (take II)." → "authentication system."
 * "authentication system (take 3)" → "authentication system"
 */
export const stripTakeSuffix = (message: string): string => {
  return message.replace(TAKE_PATTERN, "").trim();
};

/**
 * Parse an array of git commits into conventional commits.
 * Non-conventional commits are silently skipped.
 */
export const parseConventionalCommits = (
  commits: ReadonlyArray<git.Commit>,
): ConventionalCommit[] => {
  const result: ConventionalCommit[] = [];

  for (const commit of commits) {
    const parsed = parseConventionalCommit(commit.subject, commit.hash);
    if (parsed !== undefined) {
      result.push(parsed);
    }
  }

  return result;
};

/**
 * Deduplicate commits by stripping "take" suffixes and keeping only the first
 * occurrence of each unique type+message pair.
 */
export const deduplicateCommits = (
  commits: ReadonlyArray<ConventionalCommit>,
): ConventionalCommit[] => {
  const seen = new Set<string>();
  const result: ConventionalCommit[] = [];

  for (const commit of commits) {
    const normalized = stripTakeSuffix(commit.message);
    // Normalize trailing punctuation for dedup key comparison
    const keyMsg = normalized.replace(/[.\s]{1,20}$/, "").toLowerCase();
    const key = `${commit.type}:${keyMsg}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push({
      ...commit,
      message: normalized,
    });
  }

  return result;
};

/**
 * Group commits by CHANGELOG section.
 * Skips commit types that are not user-facing (chore, ci, test).
 */
export const groupBySection = (
  commits: ReadonlyArray<ConventionalCommit>,
): Map<ChangelogSection, ConventionalCommit[]> => {
  const groups = new Map<ChangelogSection, ConventionalCommit[]>();

  for (const commit of commits) {
    if (SKIP_TYPES.has(commit.type)) {
      continue;
    }

    const section = SECTION_MAP[commit.type];
    if (section === undefined) {
      continue;
    }

    const group = groups.get(section);
    if (group !== undefined) {
      group.push(commit);
    } else {
      groups.set(section, [commit]);
    }
  }

  return groups;
};

/**
 * Format a single commit as a markdown list item.
 * With scope: "- **auth:** add login system"
 * Without scope: "- add login system"
 */
const formatEntry = (commit: ConventionalCommit): string => {
  if (commit.scope !== undefined) {
    return `- **${commit.scope}:** ${commit.message}`;
  }
  return `- ${commit.message}`;
};

/**
 * Generate a complete CHANGELOG section from grouped commits.
 */
export const generateChangelogSection = (
  version: string,
  commits: ReadonlyArray<ConventionalCommit>,
): string => {
  const grouped = groupBySection(commits);

  if (grouped.size === 0) {
    const today = new Date().toISOString().split("T")[0];
    return `## ${version} - ${today}\n\n_Maintenance release._`;
  }

  const today = new Date().toISOString().split("T")[0];
  const lines: string[] = [`## ${version} - ${today}`];

  // Ordered sections matching Keep a Changelog convention
  const sectionOrder: ChangelogSection[] = [
    "Added",
    "Changed",
    "Fixed",
    "Removed",
  ];

  for (const section of sectionOrder) {
    const entries = grouped.get(section);
    if (entries === undefined || entries.length === 0) {
      continue;
    }

    lines.push("", `### ${section}`, "");
    for (const entry of entries) {
      lines.push(formatEntry(entry));
    }
  }

  return lines.join("\n");
};

/**
 * Insert a new version section into CHANGELOG.md content.
 *
 * If a section for the same version already exists, it is **replaced** (idempotent).
 * Otherwise, inserts after the `## [Unreleased]` heading, before the next `##`.
 *
 * @param version - The version string to check for duplicates (e.g., "4.1.2")
 */
export const insertIntoChangelog = (
  changelogContent: string,
  newSection: string,
  version?: string,
): string => {
  const lines = changelogContent.split("\n");

  // If version provided, check for an existing section and replace it
  if (version !== undefined) {
    const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const versionPattern = new RegExp(`^##\\s+${escapedVersion}\\b`);
    const existingIdx = lines.findIndex((line) => versionPattern.test(line));

    if (existingIdx !== -1) {
      // Find the end of this section (next ## heading or EOF)
      let sectionEnd = lines.length;
      for (let i = existingIdx + 1; i < lines.length; i++) {
        if (/^##\s+/.test(lines[i]!)) {
          sectionEnd = i;
          break;
        }
      }

      // Replace the existing section (keep blank lines before next heading as separators)
      lines.splice(existingIdx, sectionEnd - existingIdx, newSection);
      return lines.join("\n");
    }
  }

  // No existing section — insert after [Unreleased]
  const unreleased = lines.findIndex((line) =>
    /^##\s+\[Unreleased\]/i.test(line)
  );

  if (unreleased === -1) {
    // No [Unreleased] section — prepend after the first line (title)
    const titleEnd = lines.findIndex((line, i) =>
      i > 0 && line.startsWith("## ")
    );
    const insertAt = titleEnd === -1 ? lines.length : titleEnd;
    lines.splice(insertAt, 0, "", newSection, "");
    return lines.join("\n");
  }

  // Find the next ## heading after [Unreleased]
  let nextHeading = -1;
  for (let i = unreleased + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i]!)) {
      nextHeading = i;
      break;
    }
  }

  const insertAt = nextHeading === -1 ? lines.length : nextHeading;
  lines.splice(insertAt, 0, newSection, "");
  return lines.join("\n");
};

// =============================================================================
// Main logic
// =============================================================================

/**
 * Generate a changelog entry from conventional commits since the last tag
 * and prepend it to CHANGELOG.md.
 */
export const generateChangelog = async (
  options: GenerateChangelogOptions = {},
): Promise<GenerateChangelogResult> => {
  const { root = ".", dryRun = false } = options;

  // Read the already-bumped VERSION (versions.ts runs first in release flow)
  const version = await readVersionFile({ root });
  if (version === undefined || version === "") {
    throw new Error("VERSION file is missing or empty.");
  }

  // Get the last tag
  let lastTag: string;
  try {
    lastTag = await git.getLatestTag();
  } catch {
    throw new Error(
      "No git tags found. Create an initial tag first (e.g., git tag v0.0.0).",
    );
  }

  // Get commits since last tag
  const commits = await git.getCommitsBetween(lastTag, "HEAD");
  if (commits.length === 0) {
    throw new Error(
      `No commits found since ${lastTag}. Nothing to release.`,
    );
  }

  // Parse, deduplicate, and generate
  const parsed = parseConventionalCommits(commits);
  const deduped = deduplicateCommits(parsed);
  const content = generateChangelogSection(version, deduped);

  if (!dryRun) {
    const changelogPath = standards.crossRuntime.runtime.path.join(
      root,
      "CHANGELOG.md",
    );

    let existingContent: string;
    try {
      existingContent = await standards.crossRuntime.runtime.fs.readTextFile(
        changelogPath,
      );
    } catch {
      throw new Error(
        `CHANGELOG.md not found at ${changelogPath}. Create one first.`,
      );
    }

    const updatedContent = insertIntoChangelog(
      existingContent,
      content,
      version,
    );
    await standards.crossRuntime.runtime.fs.writeTextFile(
      changelogPath,
      updatedContent,
    );
  }

  return {
    version,
    commitCount: commits.length,
    entryCount: deduped.filter((c) => !SKIP_TYPES.has(c.type)).length,
    content,
    dryRun,
  };
};

// =============================================================================
// CLI interface (Handler/Adapter/ResponseMapper pattern)
// =============================================================================

/** Handler: wraps generateChangelog as a Task via fromPromise. */
export const generateChangelogHandler: functions.handler.Handler<
  GenerateChangelogOptions,
  GenerateChangelogResult,
  Error
> = (input) => functions.task.fromPromise(() => generateChangelog(input));

/** Adapter: CliEvent → GenerateChangelogOptions */
const cliAdapter: functions.handler.Adapter<
  functions.triggers.CliEvent,
  GenerateChangelogOptions
> = (event) =>
  primitives.results.ok({ dryRun: event.flags["dry-run"] === true });

/** ResponseMapper: formats GenerateChangelogResult for CLI output. */
const cliResponseMapper: functions.handler.ResponseMapper<
  GenerateChangelogResult,
  Error | functions.handler.AdaptError,
  shellArgs.CliResult<void>
> = (result) => {
  if (primitives.results.isFail(result)) {
    out.writeln(
      span.red("✗"),
      span.text(
        " " +
          (result.error instanceof Error
            ? result.error.message
            : String(result.error)),
      ),
    );
    return primitives.results.fail({ exitCode: 1 });
  }

  const { value } = result;

  if (value.dryRun) {
    out.writeln(
      span.yellow("⚠"),
      span.text(" [DRY RUN] Generated changelog preview:"),
    );
    out.writeln(span.blue("ℹ"), span.text(` \n${value.content}`));
  } else {
    out.writeln(
      span.green("✓"),
      span.text(
        ` Added ${value.entryCount} entries to CHANGELOG.md for v${value.version}`,
      ),
    );
  }

  return primitives.results.ok(undefined);
};

/** Runnable CLI trigger for changelog-gen. */
export const handleCli: (
  event: functions.triggers.CliEvent,
) => Promise<shellArgs.CliResult<void>> = functions.handler.createTrigger({
  handler: generateChangelogHandler,
  adaptInput: cliAdapter,
  adaptOutput: cliResponseMapper,
});

/** CLI entry point. */
export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const parsed = cliParseArgs.parseArgs(
    (cliArgs ?? []) as string[],
    { boolean: ["dry-run"], alias: { n: "dry-run" } },
  );
  const event = toCliEvent("changelog-gen", parsed);
  return await handleCli(event);
};

if (import.meta.main) {
  runCliMain(
    await main(standards.crossRuntime.runtime.process.args as string[]),
    out,
  );
}
