// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Changelog parsing and GitHub Release synchronization.
 *
 * Can be used as a library or as a standalone script.
 *
 * Library usage:
 * ```typescript
 * import * as releaseNotes from "@eser/codebase/release-notes";
 *
 * // Parse changelog
 * const { entries } = await releaseNotes.parseChangelog({ root: "." });
 * console.log(entries[0].version, entries[0].notes);
 *
 * // Sync to GitHub Release
 * const result = await releaseNotes.syncReleaseNotes({
 *   repo: "owner/repo",
 *   tag: "v4.0.43",
 *   createIfMissing: true,
 * });
 * console.log(result.action); // "created" | "updated" | "skipped"
 * ```
 *
 * CLI usage:
 *   deno run --allow-all ./release-notes.ts --repo owner/repo [--tag v1.0.0] [--create-if-missing]
 *
 * @module
 */

import * as cliParseArgs from "@std/cli/parse-args";
import * as stdPath from "@std/path";
import * as results from "@eser/primitives/results";
import { runtime } from "@eser/standards/runtime";
import * as handler from "@eser/functions/handler";
import type { CliEvent } from "@eser/functions/triggers";
import { fromPromise } from "@eser/functions/task";
import type * as shellArgs from "@eser/shell/args";
import * as fmt from "@eser/shell/formatting";
import * as shellExec from "@eser/shell/exec";
import { runCliMain, toCliEvent } from "./cli-support.ts";

/**
 * A parsed entry from a CHANGELOG.md file.
 */
export type ChangelogEntry = {
  /** Version string (e.g., "4.0.43") */
  readonly version: string;
  /** Release date (e.g., "2024-07-16"), empty if not specified */
  readonly date: string;
  /** Git tag (e.g., "v4.0.43") */
  readonly tag: string;
  /** Formatted release notes markdown */
  readonly notes: string;
};

/**
 * Options for parsing a changelog file.
 */
export type ParseChangelogOptions = {
  /** Path to CHANGELOG.md relative to root (default: "CHANGELOG.md") */
  readonly changelogPath?: string;
  /** Root directory (default: ".") */
  readonly root?: string;
};

/**
 * Result of parsing a changelog file.
 */
export type ParseChangelogResult = {
  /** All changelog entries, most recent first */
  readonly entries: ReadonlyArray<ChangelogEntry>;
};

/**
 * Options for syncing release notes to GitHub.
 */
export type SyncReleaseNotesOptions = {
  /** GitHub repository slug (e.g., "owner/repo") */
  readonly repo: string;
  /** Target tag (e.g., "v4.0.43"). If omitted, uses latest changelog entry */
  readonly tag?: string;
  /** Create release if it doesn't exist (default: false) */
  readonly createIfMissing?: boolean;
  /** Path to CHANGELOG.md relative to root (default: "CHANGELOG.md") */
  readonly changelogPath?: string;
  /** Root directory (default: ".") */
  readonly root?: string;
  /** Release title template. Use {tag} placeholder. (default: "eserstack {tag}") */
  readonly releaseTitle?: string;
};

/**
 * Result of syncing release notes.
 */
export type SyncReleaseNotesResult = {
  /** The tag that was synced */
  readonly tag: string;
  /** The changelog entry that was used */
  readonly entry: ChangelogEntry;
  /** Action taken */
  readonly action: "created" | "updated" | "skipped";
};

const HEADING_PATTERN =
  /^##\s+\[?([^\]\s]+)\]?\s*-?\s*([0-9]{4}-[0-9]{2}-[0-9]{2})?\s*$/;

/**
 * Normalizes a tag string by stripping `refs/tags/` prefix and ensuring a `v` prefix.
 *
 * @param rawTag - The raw tag string
 * @returns Normalized tag with `v` prefix
 */
export const normalizeTag = (rawTag: string): string => {
  const trimmed = rawTag.trim().replace(/^refs\/tags\//, "");
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
};

/**
 * Parses raw changelog text into structured entries.
 * This is a pure function with no I/O — useful for testing.
 *
 * @param text - Raw CHANGELOG.md content
 * @returns Array of changelog entries, most recent first
 */
export const parseChangelogText = (text: string): ChangelogEntry[] => {
  const lines = text.split(/\r?\n/);
  const headings: {
    version: string;
    date: string;
    headingLineIndex: number;
  }[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const m = line.match(HEADING_PATTERN);
    if (m === null) {
      continue;
    }

    headings.push({
      version: m[1]!,
      date: m[2] ?? "",
      headingLineIndex: index,
    });
  }

  if (headings.length === 0) {
    return [];
  }

  return headings.map((heading, index) => {
    const nextHeading = headings[index + 1];
    const bodyStart = heading.headingLineIndex + 1;
    const bodyEnd = nextHeading !== undefined
      ? nextHeading.headingLineIndex
      : lines.length;

    const bodyLines = lines.slice(bodyStart, bodyEnd);
    while (bodyLines.length > 0 && bodyLines[0]!.trim() === "") {
      bodyLines.shift();
    }
    while (
      bodyLines.length > 0 && bodyLines[bodyLines.length - 1]!.trim() === ""
    ) {
      bodyLines.pop();
    }

    const notesParts = [
      `## ${heading.version}${heading.date !== "" ? ` - ${heading.date}` : ""}`,
    ];
    if (bodyLines.length > 0) {
      notesParts.push("", ...bodyLines);
    }

    return {
      version: heading.version,
      date: heading.date,
      tag: `v${heading.version}`,
      notes: `${notesParts.join("\n").trim()}\n`,
    };
  });
};

/**
 * Reads and parses a CHANGELOG.md file into structured entries.
 *
 * @param options - Options for the operation
 * @returns Result with changelog entries
 */
export const parseChangelog = async (
  options: ParseChangelogOptions = {},
): Promise<ParseChangelogResult> => {
  const { changelogPath = "CHANGELOG.md", root = "." } = options;
  const fullPath = stdPath.resolve(root, changelogPath);
  const text = await runtime.fs.readTextFile(fullPath);
  const entries = parseChangelogText(text);

  return { entries };
};

/**
 * Checks whether a GitHub Release exists for a given tag.
 *
 * @param tag - The tag to check (e.g., "v4.0.43")
 * @param repo - The repository slug (e.g., "owner/repo")
 * @returns true if the release exists
 */
export const hasGitHubRelease = async (
  tag: string,
  repo: string,
): Promise<boolean> => {
  try {
    await shellExec.exec`gh release view ${tag} --repo ${repo}`.quiet().text();
    return true;
  } catch {
    return false;
  }
};

/**
 * Syncs a changelog entry to a GitHub Release.
 *
 * Finds the changelog entry matching the target tag, then creates or updates
 * the corresponding GitHub Release with the entry's notes.
 *
 * @param options - Options for the operation
 * @returns Result describing what action was taken
 */
export const syncReleaseNotes = async (
  options: SyncReleaseNotesOptions,
): Promise<SyncReleaseNotesResult> => {
  const {
    repo,
    createIfMissing = false,
    changelogPath = "CHANGELOG.md",
    root = ".",
    releaseTitle = "eserstack {tag}",
  } = options;

  const { entries } = await parseChangelog({ changelogPath, root });

  if (entries.length === 0) {
    throw new Error("No release headings found in CHANGELOG.md.");
  }

  const targetTag = options.tag !== undefined
    ? normalizeTag(options.tag)
    : entries[0]!.tag;

  const entry = entries.find((e) => e.tag === targetTag);
  if (entry === undefined) {
    throw new Error(`No matching changelog section found for ${targetTag}.`);
  }

  // Write notes to a temp file for gh CLI
  const tempDir = await Deno.makeTempDir({ prefix: "eserstack-release-" });
  const notesPath = stdPath.join(tempDir, `${targetTag}-notes.md`);
  await runtime.fs.writeTextFile(notesPath, entry.notes);

  try {
    const exists = await hasGitHubRelease(targetTag, repo);

    if (exists) {
      await shellExec
        .exec`gh release edit ${targetTag} --repo ${repo} --notes-file ${notesPath}`
        .spawn();
      return { tag: targetTag, entry, action: "updated" };
    }

    if (!createIfMissing) {
      return { tag: targetTag, entry, action: "skipped" };
    }

    const title = releaseTitle.replace("{tag}", targetTag);

    try {
      await shellExec
        .exec`gh release create ${targetTag} --repo ${repo} --title ${title} --notes-file ${notesPath} --verify-tag`
        .spawn();
      return { tag: targetTag, entry, action: "created" };
    } catch {
      // Race condition: release may have been created between check and create
      await shellExec
        .exec`gh release edit ${targetTag} --repo ${repo} --notes-file ${notesPath}`
        .spawn();
      return { tag: targetTag, entry, action: "updated" };
    }
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
};

// --- Handler ---

/** Handler: wraps syncReleaseNotes as a Task via fromPromise. */
export const syncReleaseNotesHandler: handler.Handler<
  SyncReleaseNotesOptions,
  SyncReleaseNotesResult,
  Error
> = (input) => fromPromise(() => syncReleaseNotes(input));

// --- CLI Adapter ---

/** Adapter: CliEvent → SyncReleaseNotesOptions (extracts --repo, --tag, --create-if-missing flags). */
const cliAdapter: handler.Adapter<CliEvent, SyncReleaseNotesOptions> = (
  event,
) => {
  const repo = (event.flags["repo"] as string | undefined) ??
    Deno.env.get("GITHUB_REPOSITORY") ?? "";

  if (repo === "") {
    return results.fail(
      handler.adaptError(
        "Missing repository. Pass --repo or set GITHUB_REPOSITORY.",
      ),
    );
  }

  return results.ok({
    repo,
    tag: (event.flags["tag"] as string | undefined) ?? undefined,
    createIfMissing: event.flags["create-if-missing"] === true,
  });
};

// --- CLI ResponseMapper ---

/** ResponseMapper: formats SyncReleaseNotesResult for CLI output. */
const cliResponseMapper: handler.ResponseMapper<
  SyncReleaseNotesResult,
  Error | handler.AdaptError,
  shellArgs.CliResult<void>
> = (result) => {
  if (results.isFail(result)) {
    const err = result.error;
    const message = err instanceof Error
      ? err.message
      : (err as handler.AdaptError).message ?? String(err);
    fmt.printError(message);
    return results.fail({ exitCode: 1 });
  }

  const { value } = result;

  switch (value.action) {
    case "created":
      fmt.printSuccess(`Created release ${value.tag} with changelog notes.`);
      break;
    case "updated":
      fmt.printSuccess(`Updated release notes for ${value.tag}.`);
      break;
    case "skipped":
      fmt.printWarning(
        `Release ${value.tag} not found. Skipping (pass --create-if-missing to create).`,
      );
      break;
  }

  return results.ok(undefined);
};

// --- CLI Trigger ---

/** Runnable CLI trigger for release-notes. */
export const handleCli: (
  event: CliEvent,
) => Promise<shellArgs.CliResult<void>> = handler.createTrigger({
  handler: syncReleaseNotesHandler,
  adaptInput: cliAdapter,
  adaptOutput: cliResponseMapper,
});

/** CLI entry point for dispatcher compatibility. */
export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const parsed = cliParseArgs.parseArgs(
    (cliArgs ?? []) as string[],
    {
      string: ["repo", "tag"],
      boolean: ["create-if-missing"],
      alias: { h: "help" },
    },
  );
  const event = toCliEvent("release-notes", parsed);
  return await handleCli(event);
};

if (import.meta.main) {
  runCliMain(await main(runtime.process.args as string[]));
}
