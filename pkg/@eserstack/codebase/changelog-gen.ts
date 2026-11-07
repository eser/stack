// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * CHANGELOG auto-generation from conventional commits.
 *
 * Reads git history since the last tag, parses conventional commit messages,
 * deduplicates "take" series, and writes a new section to CHANGELOG.md with the
 * notes that were under `## Unreleased`.
 *
 * Library usage:
 * ```typescript
 * import * as changelogGen from "@eserstack/codebase/changelog-gen";
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
 *   node ./changelog-gen.ts [--dry-run]
 *
 * @module
 */

import * as primitives from "@eserstack/primitives";
import * as standards from "@eserstack/standards";
import * as functions from "@eserstack/functions";
import type * as shellArgs from "@eserstack/shell/args";
import * as tui from "@eserstack/shell/tui";
import type * as git from "./git.ts";
import * as cliSupport from "./cli-support.ts";
import * as ffiClient from "./ffi-client.ts";

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
export type ChangelogSection = "Added" | "Fixed" | "Changed" | "Removed";

/**
 * Options for generating a changelog.
 */
export type GenerateChangelogOptions = {
  /** Root directory containing VERSION and CHANGELOG.md (default: ".") */
  readonly root?: string;
  /** Release version for the heading. Default: next patch after the latest tag. */
  readonly version?: string;
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
  // Match the Go generator (pkg/ajan/codebasefx/changelog.go): headings are
  // bare. A "## v4.3.1" heading is recognised by neither the Go dedup nor the
  // release-notes parser, so a v-prefixed caller would silently produce a
  // duplicate section and empty release notes.
  const bare = version.replace(/^v/, "");
  const grouped = groupBySection(commits);

  if (grouped.size === 0) {
    const today = new Date().toISOString().split("T")[0];
    return `## ${bare} - ${today}\n\n_Maintenance release._`;
  }

  const today = new Date().toISOString().split("T")[0];
  const lines: string[] = [`## ${bare} - ${today}`];

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

/** Matches `## Unreleased`, `## [Unreleased]` and the form with a link. */
const UNRELEASED_HEADING =
  /^##\s{1,100}\[?unreleased\]?(\(.{0,1000}\))?\s{0,100}$/i;

/**
 * The short hash the Go generator ends every entry with. Text a person wrote
 * does not end in one.
 */
const GENERATED_ENTRY_SUFFIX = /\s\([0-9a-f]{7,40}\)$/;

/** Section order of the Go generator, which every released section follows. */
const SUBSECTION_ORDER = ["added", "fixed", "changed", "removed"];

const isBlank = (line: string): boolean => line.trim() === "";

const isIndentedText = (line: string): boolean =>
  !isBlank(line) && (line.startsWith(" ") || line.startsWith("\t"));

const normalizeEntry = (text: string): string =>
  text.trim().replace(/\s{1,1000}/g, " ");

const trimBlankLines = (lines: ReadonlyArray<string>): string[] => {
  let start = 0;
  let end = lines.length;
  while (start < end && isBlank(lines[start]!)) {
    start++;
  }
  while (end > start && isBlank(lines[end - 1]!)) {
    end--;
  }
  return lines.slice(start, end);
};

/**
 * Follows fenced code blocks, where a line that reads like a heading or a list
 * item is only text. The returned function takes lines in order and tells
 * whether each opens, closes or sits in a fence.
 */
const createFenceTracker = (): ((line: string) => boolean) => {
  let marker = "";
  let size = 0;

  return (line) => {
    const trimmed = line.trimStart();
    const first = trimmed.charAt(0);
    let run = 0;
    if (first === "`" || first === "~") {
      while (trimmed.charAt(run) === first) {
        run++;
      }
    }

    if (size === 0) {
      // A backtick in the info string makes it an inline code span instead.
      if (run < 3 || (first === "`" && trimmed.slice(run).includes("`"))) {
        return false;
      }
      marker = first;
      size = run;
      return true;
    }

    if (run >= size && first === marker && isBlank(trimmed.slice(run))) {
      size = 0;
    }
    return true;
  };
};

/**
 * Cuts lines at each heading with the given prefix outside a fence. Each block
 * starts with its heading; `head` holds the lines before the first one.
 */
const splitAtHeadings = (
  lines: ReadonlyArray<string>,
  prefix: string,
): { head: ReadonlyArray<string>; blocks: string[][] } => {
  const inFence = createFenceTracker();
  const starts: number[] = [];

  lines.forEach((line, index) => {
    if (!inFence(line) && line.startsWith(prefix)) {
      starts.push(index);
    }
  });

  return {
    head: starts.length === 0 ? lines : lines.slice(0, starts[0]),
    blocks: starts.map((start, i) => lines.slice(start, starts[i + 1])),
  };
};

/**
 * Appends `b` to `a`. Two lists stay one tight list, since a blank line between
 * them would make oxfmt space every item of the result.
 */
const joinBodies = (
  first: ReadonlyArray<string>,
  second: ReadonlyArray<string>,
): string[] => {
  const a = trimBlankLines(first);
  const b = trimBlankLines(second);
  if (a.length === 0 || b.length === 0) {
    return [...a, ...b];
  }

  const last = a[a.length - 1]!;
  const tight =
    (last.startsWith("- ") || last.startsWith(" ")) && b[0]!.startsWith("- ");
  return tight ? [...a, ...b] : [...a, "", ...b];
};

/**
 * Removes the entries an earlier run generated from a subsection's body: list
 * items that end in a commit hash or that the new section lists again. An item
 * with more paragraphs was written by a person.
 */
const dropGeneratedEntries = (
  body: ReadonlyArray<string>,
  regenerated: ReadonlySet<string>,
): string[] => {
  const inFence = createFenceTracker();
  const kept: string[] = [];

  let i = 0;
  while (i < body.length) {
    if (inFence(body[i]!) || !body[i]!.startsWith("- ")) {
      kept.push(body[i]!);
      i++;
      continue;
    }

    let end = i + 1;
    while (end < body.length && isIndentedText(body[end]!)) {
      end++;
    }

    let next = end;
    while (next < body.length && isBlank(body[next]!)) {
      next++;
    }

    const entry = normalizeEntry(body.slice(i, end).join(" "));
    const generated =
      regenerated.has(entry) || GENERATED_ENTRY_SUFFIX.test(entry);
    const continues = next < body.length && isIndentedText(body[next]!);

    if (!generated || continues) {
      kept.push(body[i]!);
      i++;
      continue;
    }

    i = end;
    while (
      i < body.length &&
      isBlank(body[i]!) &&
      (kept.length === 0 || isBlank(kept[kept.length - 1]!))
    ) {
      i++;
    }
  }

  return kept;
};

const subsectionTitle = (heading: string): string =>
  heading.replace(/^### /, "").trim();

/** Generated sections in their order, then every other subsection. */
const subsectionRank = (title: string): number => {
  const rank = SUBSECTION_ORDER.indexOf(title.toLowerCase());
  return rank === -1 ? SUBSECTION_ORDER.length : rank;
};

/**
 * Builds a version's section from the generated section, the body the version's
 * section already has on a re-run, and the notes that were under Unreleased.
 *
 * The order follows the CHANGELOG.md style: text directly under the heading,
 * then the sections in the generator's order, then Migration and any other
 * hand-written subsection. A hand-written list joins the generated section of
 * its name. On a re-run the old generated entries go, since the new section
 * lists them again; everything else in the old body was written by a person
 * and stays.
 */
const mergeReleaseSection = (
  newSection: string,
  previous: ReadonlyArray<string>,
  notes: ReadonlyArray<string>,
): string[] => {
  const generated = splitAtHeadings(newSection.split("\n"), "### ");
  const [heading = "", ...restOfHead] = trimBlankLines(generated.head);
  const generatedText = trimBlankLines(restOfHead);

  const subsections: { heading: string; title: string; body: string[] }[] = [];
  const addSubsection = (
    subsectionHeading: string,
    body: ReadonlyArray<string>,
  ): void => {
    const title = subsectionTitle(subsectionHeading);
    const existing = subsections.find(
      (subsection) => subsection.title.toLowerCase() === title.toLowerCase(),
    );
    if (existing !== undefined) {
      existing.body = joinBodies(existing.body, body);
      return;
    }
    subsections.push({
      heading: subsectionHeading,
      title,
      body: trimBlankLines(body),
    });
  };

  const regenerated = new Set<string>();
  for (const [subsectionHeading, ...body] of generated.blocks) {
    addSubsection(subsectionHeading!, body);
    for (const line of body) {
      if (line.startsWith("- ")) {
        regenerated.add(normalizeEntry(line));
      }
    }
  }

  const old = splitAtHeadings(previous, "### ");
  const moved = splitAtHeadings(notes, "### ");

  const oldText = trimBlankLines(old.head);
  const sameText =
    oldText.length === generatedText.length &&
    oldText.every((line, i) => line === generatedText[i]);
  const text = joinBodies(
    sameText ? generatedText : joinBodies(generatedText, oldText),
    moved.head,
  );

  for (const [subsectionHeading, ...body] of old.blocks) {
    const isGeneratedName =
      subsectionRank(subsectionTitle(subsectionHeading!)) <
      SUBSECTION_ORDER.length;
    addSubsection(
      subsectionHeading!,
      isGeneratedName ? dropGeneratedEntries(body, regenerated) : body,
    );
  }

  for (const [subsectionHeading, ...body] of moved.blocks) {
    addSubsection(subsectionHeading!, body);
  }

  const ordered = subsections.toSorted(
    (a, b) => subsectionRank(a.title) - subsectionRank(b.title),
  );

  const result = text.length > 0 ? [heading, "", ...text] : [heading];
  for (const subsection of ordered) {
    if (subsection.body.length > 0) {
      result.push("", subsection.heading, "", ...subsection.body);
    }
  }
  return result;
};

/** Whether a heading line is the version's, in the bare or the legacy style. */
const isVersionHeading = (line: string, bare: string): boolean => {
  const stripped = line.trim();
  return (
    stripped === `## ${bare}` ||
    stripped.startsWith(`## ${bare} `) ||
    stripped.startsWith(`## [${bare}]`) ||
    stripped.startsWith(`## [v${bare}]`)
  );
};

/**
 * Writes a version's section into CHANGELOG.md content and moves the notes under
 * `## Unreleased` into it, leaving that heading empty above the section. This is
 * the same layout as InsertIntoChangelog in pkg/ajan/codebasefx, which is what a
 * release runs: {@link generateChangelog} calls the Go generator through the
 * bridge, and a Go test compares the two on the same cases.
 *
 * The section goes below Unreleased, or first when there is no Unreleased. An
 * existing section of the version is replaced in place, and the text in it a
 * person wrote stays.
 *
 * @param version - The version string to check for duplicates (e.g., "4.1.2")
 */
export const insertIntoChangelog = (
  changelogContent: string,
  newSection: string,
  version?: string,
): string => {
  const { head, blocks } = splitAtHeadings(changelogContent.split("\n"), "## ");

  const unreleased = blocks.filter((block) =>
    UNRELEASED_HEADING.test(block[0]!),
  );
  const rest = blocks.filter((block) => !UNRELEASED_HEADING.test(block[0]!));
  const notes = unreleased.flatMap((block) => ["", ...block.slice(1)]);

  const bare = version?.replace(/^v/, "");
  const existing =
    bare === undefined || bare === ""
      ? -1
      : rest.findIndex((block) => isVersionHeading(block[0]!, bare));

  const merged = mergeReleaseSection(
    newSection,
    existing === -1 ? [] : rest[existing]!.slice(1),
    notes,
  );

  if (existing === -1) {
    rest.unshift(merged);
  } else {
    rest[existing] = merged;
  }

  const parts = [
    head,
    ...(unreleased.length > 0 ? [unreleased[0]!.slice(0, 1)] : []),
    ...rest,
  ]
    .map((block) => trimBlankLines(block))
    .filter((block) => block.length > 0)
    .map((block) => block.join("\n"));

  return `${parts.join("\n\n")}\n`;
};

// =============================================================================
// Main logic
// =============================================================================

/**
 * Generate a changelog entry from conventional commits since the last tag and
 * write it to CHANGELOG.md, moving the notes under `## Unreleased` into it. The
 * Go generator does the work, so this needs the native library, and `content`
 * holds the generated entries only. A dry run writes nothing.
 */
export const generateChangelog = async (
  options: GenerateChangelogOptions = {},
): Promise<GenerateChangelogResult> => {
  const lib = await ffiClient.requireLib();
  const parsed = lib.call("codebaseGenerateChangelog", {
    dir: options.root ?? ".",
    // Omitted when undefined, which leaves the Go-side fallback in charge.
    version: options.version,
    dryRun: options.dryRun ?? false,
  }) as GenerateChangelogResult | { error: string };
  if ("error" in parsed) {
    throw new Error((parsed as { error: string }).error);
  }
  return parsed as GenerateChangelogResult;
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
  const { ctx } = cliSupport.getCliContext();

  if (primitives.results.isFail(result)) {
    const message =
      result.error instanceof Error
        ? result.error.message
        : String(result.error);
    tui.log.error(ctx, message);
    return primitives.results.fail({ exitCode: 1 });
  }

  const { value } = result;

  if (value.dryRun) {
    tui.log.warn(ctx, "[DRY RUN] Generated changelog preview:");
    tui.log.info(ctx, `\n${value.content}`);
  } else {
    tui.log.success(
      ctx,
      `Added ${value.entryCount} entries to CHANGELOG.md for v${value.version}`,
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

/** Parse the changelog-gen arguments: `--dry-run` (`-n`). */
export const parseCliArgs = (
  cliArgs?: readonly string[],
): functions.triggers.CliEvent =>
  cliSupport.parseCliEvent("changelog-gen", cliArgs, {
    "dry-run": { type: "boolean", short: "n" },
  });

/** CLI entry point. */
export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => await handleCli(parseCliArgs(cliArgs));

if (import.meta.main) {
  // Entry point: the await only runs when this file is executed directly.
  // oxlint-disable-next-line node/no-top-level-await
  const result = await main(
    standards.crossRuntime.runtime.process.args as string[],
  );
  cliSupport.runCliMain(result, cliSupport.getCliContext().output);
}
