// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Release orchestration — bump version, generate changelog, commit, push, tag.
 *
 * The release pipeline is tag-triggered: pushing `v<version>` is what makes CI
 * validate and publish. Every command here is therefore defined by what it does
 * to that tag.
 *
 * Provides three commands:
 * - **release** — full release flow (bump, changelog, commit, push, push tag)
 * - **rerelease** — delete and re-push the current version tag at HEAD, which
 *   re-fires the pipeline for a version that is already committed
 * - **unrelease** — delete the current version tag and its GitHub Release,
 *   leaving the version-bump commit in history
 *
 * Library usage:
 * ```typescript
 * import * as release from "@eserstack/codebase/release";
 *
 * const result = await release.release({ type: "patch" });
 * console.log(result.tag); // "v4.1.4"
 * ```
 *
 * CLI usage:
 *   eser codebase release <patch|minor|major|same> [--dry-run] [--yes]
 *   eser codebase rerelease [--dry-run] [--yes]
 *   eser codebase unrelease [--yes]
 *
 * Only the release flow runs when this file is executed directly
 * (`deno run --allow-all ./release.ts patch`); rerelease and unrelease are
 * separate entry points, not flags on it.
 *
 * @module
 */

import * as cliParseArgs from "@std/cli/parse-args";
import * as primitives from "@eserstack/primitives";
import * as standards from "@eserstack/standards";
import * as functions from "@eserstack/functions";
import type * as shellArgs from "@eserstack/shell/args";
import * as shellExec from "@eserstack/shell/exec";
import * as tui from "@eserstack/shell/tui";

import {
  bumpVersion,
  readVersionFile,
  type VersionCommand,
} from "./versions.ts";
import { createCliContext, runCliMain, toCliEvent } from "./cli-support.ts";

const { ctx, output: out } = createCliContext();

// =============================================================================
// Types
// =============================================================================

/**
 * Options for the release command.
 */
export type ReleaseOptions = {
  /** Version bump type: patch, minor, major, or same (no bump). */
  readonly type: "patch" | "minor" | "major" | "same";
  /** Preview changes without executing (default: false). */
  readonly dryRun?: boolean;
  /** Skip confirmation prompt (default: false). */
  readonly yes?: boolean;
};

/**
 * Result of the release command.
 */
export type ReleaseResult = {
  /** The new version after bumping. */
  readonly version: string;
  /** The previous version before bumping. */
  readonly previousVersion: string;
  /** The release tag for the new version (e.g. "v4.3.1"). */
  readonly tag: string;
  /** Whether a changelog entry was generated. */
  readonly changelogGenerated: boolean;
  /** Whether changes were committed. */
  readonly committed: boolean;
  /** Whether the commit was pushed. */
  readonly pushed: boolean;
  /** Whether the tag was pushed (this is what starts the pipeline). */
  readonly tagPushed: boolean;
  /** Whether this was a dry run. */
  readonly dryRun: boolean;
};

/**
 * Options for the rerelease command.
 */
export type RereleaseOptions = {
  /** Preview changes without executing (default: false). */
  readonly dryRun?: boolean;
  /** Skip confirmation prompt (default: false). */
  readonly yes?: boolean;
};

/**
 * Result of the rerelease command.
 */
export type RereleaseResult = {
  /** The current version. */
  readonly version: string;
  /** The tag that was recreated. */
  readonly tag: string;
  /** Whether this was a dry run. */
  readonly dryRun: boolean;
};

/**
 * Options for the unrelease command.
 */
export type UnreleaseOptions = {
  /** Skip confirmation prompt (default: false). */
  readonly yes?: boolean;
};

/**
 * Result of the unrelease command.
 */
export type UnreleaseResult = {
  /** The current version. */
  readonly version: string;
  /** The tag that was deleted. */
  readonly tag: string;
  /** Whether the tag was deleted. */
  readonly deleted: boolean;
  /** Whether the matching GitHub Release was deleted (best-effort). */
  readonly releaseDeleted: boolean;
};

// =============================================================================
// Git helpers
// =============================================================================

/** Check if the working tree is clean. */
const gitIsClean = async (): Promise<boolean> => {
  const text = await shellExec.exec`git status --porcelain`.noThrow().text();
  return text.length === 0;
};

/** List unpushed commits (empty array means up to date). */
const gitUnpushedCommits = async (): Promise<string[]> => {
  const text = await shellExec
    .exec`git log @{u}..HEAD --oneline`.noThrow().text();
  return text.length > 0 ? text.split("\n") : [];
};

/**
 * Stage specific files and create a commit.
 *
 * Each pathspec is reported by name when it fails. `git add` exits 128 on a
 * pathspec matching no tracked file, and this runs after the version bump has
 * already been written, so the bare "exit code 128: git" it used to surface
 * left a half-released tree with no indication of which entry was at fault.
 */
const gitAddAndCommit = async (
  message: string,
  files: ReadonlyArray<string>,
): Promise<void> => {
  for (const file of files) {
    const result = await shellExec.exec`git add ${file}`.noThrow().spawn();

    if (result.code !== 0) {
      throw new Error(
        `git add ${file} failed (exit ${result.code}). The pathspec matches ` +
          `no tracked file — check whether it is gitignored or the layout moved.`,
      );
    }
  }

  await shellExec.exec`git commit -m ${message}`.spawn();
};

/** Push current branch to origin. */
const gitPushHead = async (): Promise<void> => {
  await shellExec.exec`git push origin HEAD`.spawn();
};

/** Delete a tag locally and remotely (best-effort, does not throw). */
const gitDeleteTag = async (tag: string): Promise<void> => {
  await shellExec.exec`git tag -d ${tag}`.noThrow().spawn();
  const refspec = `:refs/tags/${tag}`;
  await shellExec.exec`git push origin ${refspec}`.noThrow().spawn();
};

/**
 * Delete the GitHub Release for a tag. Best-effort: returns whether it worked.
 *
 * No `--repo` (gh infers it from origin) and no `--cleanup-tag` (the caller
 * deletes the tag itself). The try/catch covers gh being absent entirely: a
 * missing binary makes the spawn reject rather than exit non-zero, and losing
 * the tag deletion over an uninstalled CLI would be the worse outcome.
 */
const deleteGitHubRelease = async (tag: string): Promise<boolean> => {
  try {
    const result = await shellExec.exec`gh release delete ${tag} --yes`
      .noThrow().spawn();
    return result.code === 0;
  } catch {
    return false;
  }
};

// =============================================================================
// Prompt helper
// =============================================================================

/**
 * Render why a git step failed, so the recovery advice is actionable.
 *
 * Commands run with piped stdio, so git's own diagnostic ("non-fast-forward",
 * "Permission denied") lives only on CommandError.stderr and is otherwise never
 * printed. Telling an operator to retry a push without saying why it failed
 * sends them to run the same command and watch it fail the same silent way.
 */
const gitFailureDetail = (err: unknown): string => {
  if (err instanceof shellExec.CommandError && err.stderr.trim().length > 0) {
    return `\n\n${err.stderr.trim()}`;
  }

  return err instanceof Error ? `\n\n${err.message}` : "";
};

/**
 * Ask a yes/no question via the TUI confirm widget.
 * Falls back to a simple process-based prompt if TUI is unavailable.
 */
const confirmPrompt = async (question: string): Promise<boolean> => {
  const answer = await tui.confirm(ctx, { message: question });
  return answer === true;
};

// =============================================================================
// Pure logic — release
// =============================================================================

/**
 * Perform a full release: bump version, generate changelog, commit, push, and
 * push the `v<version>` tag that starts the release pipeline.
 *
 * The tag push is the last step and the only one CI reacts to, so a release
 * that stops before it publishes nothing — both push failures below name the
 * command that finishes the job.
 *
 * @param options - Release options
 * @returns Result describing what happened
 * @throws If working tree is dirty, or unpushed commits exist (without --yes)
 */
export const release = async (
  options: ReleaseOptions,
): Promise<ReleaseResult> => {
  const { type, dryRun = false } = options;

  // 1. Validate clean tree
  if (!(await gitIsClean())) {
    throw new Error(
      "Working tree is dirty. Commit or stash changes first.",
    );
  }

  // 2. Check for unpushed commits
  const unpushed = await gitUnpushedCommits();
  if (unpushed.length > 0 && options.yes !== true) {
    throw new Error(
      `You have ${unpushed.length} unpushed commit(s):\n${
        unpushed.join("\n")
      }\n\nPush first, or re-run with --yes to continue anyway.`,
    );
  }

  // 3. Read previous version
  const previousVersion = (await readVersionFile()) ?? "0.0.0";

  // 4. Bump version (unless type is "same")
  //
  // Keep the version versions() computed rather than re-reading VERSION after
  // the call. Under --dry-run nothing is written, so a re-read returns the OLD
  // version and the preview reports "4.1.58 -> 4.1.58" -- telling the user the
  // release is a no-op when it is not. targetVersion is computed before any
  // write, so it is correct in both modes.
  let bumpedVersion: string | undefined;

  if (type !== "same") {
    // Import versions dynamically to avoid circular deps at module scope
    const versionsModule = await import("./versions.ts");
    const bump = await versionsModule.versions(type, { dryRun });

    bumpedVersion = bump.targetVersion;
  }

  // 5. Resolve the new version
  const version = bumpedVersion ?? (await readVersionFile()) ?? previousVersion;
  const tag = `v${version}`;

  // 6. Generate changelog
  //
  // The version is passed explicitly for the same reason it is kept from
  // versions() above: under --dry-run the VERSION file still holds the old
  // version, so a changelog that re-read it would head the entry with it.
  let changelogGenerated = false;
  try {
    const changelogModule = await import("./changelog-gen.ts");
    await changelogModule.generateChangelog({ dryRun, version });
    changelogGenerated = true;
  } catch {
    // No user-facing changes — that's fine, continue without changelog entry
    changelogGenerated = false;
  }

  // 7-11. Format, stage, commit, push, tag
  let committed = false;
  let pushed = false;
  let tagPushed = false;

  if (!dryRun) {
    // Format changelog
    if (changelogGenerated) {
      await shellExec.exec`deno fmt CHANGELOG.md`.noThrow().spawn();
    }

    // Stage and commit
    //
    // Every pathspec here must be able to match a TRACKED file: `git add` exits
    // 128 on one that matches nothing, and gitAddAndCommit does not tolerate
    // that, so a dead entry aborts the release after the version bump has
    // already been written to disk.
    //
    // pkg/@eserstack/*/deno.json is deliberately absent. Those are JSR
    // manifests generated from package.json + VERSION by
    // etc/scripts/gen-jsr-manifests.ts and gitignored (.gitignore), so a
    // `pkg/*/deno.json` entry matched nothing and killed every release attempt.
    // Note `*` spans `/` in a git pathspec, so `pkg/*/package.json` does reach
    // the scoped packages.
    const filesToStage = [
      "VERSION",
      "CHANGELOG.md",
      "pkg/*/package.json",
      "package.json",
    ];
    const commitMessage = `chore(codebase): release ${tag}`;
    await gitAddAndCommit(commitMessage, filesToStage);
    committed = true;

    // Push the commit.
    //
    // Both pushes run after the bump is already written and committed, so a
    // bare git error would leave the operator holding a half-released tree.
    // Each message therefore states the exact command that resumes the release.
    try {
      await gitPushHead();
    } catch (err) {
      throw new Error(
        "Release commit created but push failed. Fix the push, then run: " +
          `git push origin HEAD && eser codebase gh release-tag${
            gitFailureDetail(err)
          }`,
        { cause: err },
      );
    }
    pushed = true;

    // Push the tag — this is what starts the release pipeline.
    //
    // pushReleaseTag re-reads the VERSION file, which on disk already holds the
    // new version, so it derives the same tag computed above. Dynamic import
    // matches the versions/changelog calls above.
    try {
      const releaseTagModule = await import("./release-tag.ts");
      await releaseTagModule.pushReleaseTag({});
    } catch (err) {
      throw new Error(
        `Commit pushed but tag push failed. Run "eser codebase rerelease" to ` +
          `create and push ${tag}.${gitFailureDetail(err)}`,
        { cause: err },
      );
    }
    tagPushed = true;
  }

  // Under --dry-run the tag is only computed, never previewed through
  // pushReleaseTag({ dryRun: true }): that reads the VERSION file, which no
  // write has touched yet, so it would report the OLD version's tag — the same
  // stale-read trap as the bumpedVersion comment above.

  return {
    version,
    previousVersion,
    tag,
    changelogGenerated,
    committed,
    pushed,
    tagPushed,
    dryRun,
  };
};

// =============================================================================
// Pure logic — rerelease
// =============================================================================

/**
 * Delete the current version tag and re-push it at HEAD, re-firing the release
 * pipeline for a version that is already committed.
 *
 * This is the repair path for a release whose tag push failed or whose pipeline
 * run needs repeating; it adds no commit and changes no version.
 *
 * Pre-checks: tree must be clean, no unpushed commits.
 *
 * @param options - Rerelease options
 * @returns Result describing what happened
 * @throws If working tree is dirty or unpushed commits exist
 */
export const rerelease = async (
  options: RereleaseOptions = {},
): Promise<RereleaseResult> => {
  const { dryRun = false } = options;

  // Validate clean tree
  if (!(await gitIsClean())) {
    throw new Error(
      "Working tree is dirty. Commit and push first.",
    );
  }

  // Check for unpushed commits
  const unpushed = await gitUnpushedCommits();
  if (unpushed.length > 0) {
    throw new Error(
      `You have unpushed commits. Push first, then rerelease.\n${
        unpushed.join("\n")
      }`,
    );
  }

  // Read current version
  const version = await readVersionFile();
  if (version === undefined || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      `Invalid or missing version in VERSION file: "${version}"`,
    );
  }

  const tag = `v${version}`;

  if (!dryRun) {
    // The delete is noThrow, so this repairs both the never-tagged case and a
    // tag stranded locally by a failed push. No guard is needed against tagging
    // the wrong commit: the tree is clean, so HEAD's VERSION is the file read
    // above, and the tag can only land on a commit carrying that version.
    await gitDeleteTag(tag);

    // The delete already removed the remote tag. If the re-push fails here the
    // version has NO tag at all, which is worse than where we started, so name
    // the command that finishes the job.
    try {
      const releaseTagModule = await import("./release-tag.ts");
      await releaseTagModule.pushReleaseTag({});
    } catch (err) {
      throw new Error(
        `${tag} was deleted but could not be recreated — the version now has ` +
          `no tag. Run "eser codebase gh release-tag" to push it.${
            gitFailureDetail(err)
          }`,
        { cause: err },
      );
    }
  }

  return { version, tag, dryRun };
};

// =============================================================================
// Pure logic — unrelease
// =============================================================================

/**
 * Delete the current version tag (local + remote) and its GitHub Release.
 *
 * The version-bump commit is deliberately left in history — rewriting a pushed
 * commit is not something a cleanup command should do behind the operator's
 * back. `eser codebase rerelease` re-pushes the tag afterwards, which is the
 * command for "the version is already committed, the tag needs to exist again".
 *
 * @param options - Unrelease options
 * @returns Result describing what happened
 */
export const unrelease = async (
  options: UnreleaseOptions = {},
): Promise<UnreleaseResult> => {
  // Read current version
  const version = await readVersionFile();
  if (version === undefined || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      `Invalid or missing version in VERSION file: "${version}"`,
    );
  }

  const tag = `v${version}`;

  if (options.yes !== true) {
    throw new Error(
      `This will delete tag ${tag} (local + remote) and its GitHub Release. Re-run with --yes to confirm.`,
    );
  }

  // Release first, tag second: gh resolves a release by its tag, so deleting
  // the tag first would leave the Release unreachable and stranded.
  const releaseDeleted = await deleteGitHubRelease(tag);
  await gitDeleteTag(tag);

  return { version, tag, deleted: true, releaseDeleted };
};

// =============================================================================
// Handlers
// =============================================================================

/** Handler: wraps release as a Task via fromPromise. */
export const releaseHandler: functions.handler.Handler<
  ReleaseOptions,
  ReleaseResult,
  Error
> = (input) => functions.task.fromPromise(() => release(input));

/** Handler: wraps rerelease as a Task via fromPromise. */
export const rereleaseHandler: functions.handler.Handler<
  RereleaseOptions,
  RereleaseResult,
  Error
> = (input) => functions.task.fromPromise(() => rerelease(input));

/** Handler: wraps unrelease as a Task via fromPromise. */
export const unreleaseHandler: functions.handler.Handler<
  UnreleaseOptions,
  UnreleaseResult,
  Error
> = (input) => functions.task.fromPromise(() => unrelease(input));

// =============================================================================
// CLI Adapters
// =============================================================================

/** Adapter: CliEvent -> ReleaseOptions */
const releaseCliAdapter: functions.handler.Adapter<
  functions.triggers.CliEvent,
  ReleaseOptions
> = (event) => {
  const typeArg = event.args[0] as string | undefined;
  const validTypes = ["patch", "minor", "major", "same"];

  if (typeArg === undefined || !validTypes.includes(typeArg)) {
    return primitives.results.fail(
      functions.handler.adaptError(
        `Usage: eser codebase release <patch|minor|major|same> [--dry-run] [--yes]`,
      ),
    );
  }

  return primitives.results.ok({
    type: typeArg as ReleaseOptions["type"],
    dryRun: event.flags["dry-run"] === true,
    yes: event.flags["yes"] === true,
  });
};

/** Adapter: CliEvent -> RereleaseOptions */
const rereleaseCliAdapter: functions.handler.Adapter<
  functions.triggers.CliEvent,
  RereleaseOptions
> = (event) =>
  primitives.results.ok({
    dryRun: event.flags["dry-run"] === true,
    yes: event.flags["yes"] === true,
  });

/** Adapter: CliEvent -> UnreleaseOptions */
const unreleaseCliAdapter: functions.handler.Adapter<
  functions.triggers.CliEvent,
  UnreleaseOptions
> = (event) =>
  primitives.results.ok({
    yes: event.flags["yes"] === true,
  });

// =============================================================================
// CLI ResponseMappers
// =============================================================================

/** ResponseMapper: formats ReleaseResult for CLI output. */
const releaseResponseMapper: functions.handler.ResponseMapper<
  ReleaseResult,
  Error | functions.handler.AdaptError,
  shellArgs.CliResult<void>
> = (result) => {
  if (primitives.results.isFail(result)) {
    const err = result.error;
    const message = err instanceof Error
      ? err.message
      : (err as functions.handler.AdaptError).message ?? String(err);
    tui.log.error(ctx, message);
    return primitives.results.fail({ exitCode: 1 });
  }

  const { value } = result;

  if (value.dryRun) {
    tui.log.warn(ctx, "[DRY RUN] Release preview:");
    tui.log.info(
      ctx,
      `  Version: ${value.previousVersion} -> ${value.version}`,
    );
    tui.log.info(
      ctx,
      `  Changelog: ${
        value.changelogGenerated ? "generated" : "no user-facing changes"
      }`,
    );
    tui.log.info(
      ctx,
      `  Tag: v${value.version} (would be created and pushed — starts the release pipeline)`,
    );
    tui.log.info(ctx, "  No changes were made.");
  } else {
    tui.log.success(ctx, `Released v${value.version}`);
    tui.log.info(
      ctx,
      `  Version: ${value.previousVersion} -> ${value.version}`,
    );
    tui.log.info(
      ctx,
      `  Changelog: ${
        value.changelogGenerated ? "updated" : "no user-facing changes"
      }`,
    );
    // The old "Committed: true / Pushed: true" booleans are gone: this branch
    // is only reached when every step succeeded, so they could never print
    // anything but true.
    tui.log.info(ctx, "  Commit: pushed to origin");
    tui.log.info(
      ctx,
      `  Tag: ${value.tag} pushed — release pipeline started.`,
    );
    tui.log.info(
      ctx,
      "  Watch: https://github.com/eser/stack/actions",
    );
  }

  return primitives.results.ok(undefined);
};

/** ResponseMapper: formats RereleaseResult for CLI output. */
const rereleaseResponseMapper: functions.handler.ResponseMapper<
  RereleaseResult,
  Error | functions.handler.AdaptError,
  shellArgs.CliResult<void>
> = (result) => {
  if (primitives.results.isFail(result)) {
    const err = result.error;
    const message = err instanceof Error
      ? err.message
      : (err as functions.handler.AdaptError).message ?? String(err);
    tui.log.error(ctx, message);
    return primitives.results.fail({ exitCode: 1 });
  }

  const { value } = result;

  if (value.dryRun) {
    tui.log.warn(
      ctx,
      `[DRY RUN] Would delete and recreate tag ${value.tag} at HEAD (re-fires the release pipeline)`,
    );
  } else {
    tui.log.success(ctx, `Re-created tag ${value.tag} at HEAD`);
    tui.log.info(ctx, "Tag push re-fired the release pipeline.");
    tui.log.info(
      ctx,
      "Watch: https://github.com/eser/stack/actions",
    );
  }

  return primitives.results.ok(undefined);
};

/** ResponseMapper: formats UnreleaseResult for CLI output. */
const unreleaseResponseMapper: functions.handler.ResponseMapper<
  UnreleaseResult,
  Error | functions.handler.AdaptError,
  shellArgs.CliResult<void>
> = (result) => {
  if (primitives.results.isFail(result)) {
    const err = result.error;
    const message = err instanceof Error
      ? err.message
      : (err as functions.handler.AdaptError).message ?? String(err);
    tui.log.error(ctx, message);
    return primitives.results.fail({ exitCode: 1 });
  }

  const { value } = result;

  if (value.deleted) {
    tui.log.success(
      ctx,
      `Deleted tag ${value.tag} (local + remote).`,
    );
  }

  if (value.releaseDeleted) {
    tui.log.success(ctx, `Deleted GitHub Release ${value.tag}.`);
  } else {
    tui.log.warn(
      ctx,
      `GitHub Release not deleted (no release for ${value.tag}, or gh CLI unavailable).`,
    );
  }

  tui.log.info(
    ctx,
    `The release commit remains in history. Run "eser codebase rerelease" to ` +
      `re-push the tag once the version is publishable again — but only if ` +
      `nothing was published: npm and JSR both refuse a re-published version.`,
  );

  return primitives.results.ok(undefined);
};

// =============================================================================
// CLI Triggers
// =============================================================================

/** Runnable CLI trigger for release. */
export const handleReleaseCli: (
  event: functions.triggers.CliEvent,
) => Promise<shellArgs.CliResult<void>> = functions.handler.createTrigger({
  handler: releaseHandler,
  adaptInput: releaseCliAdapter,
  adaptOutput: releaseResponseMapper,
});

/** Runnable CLI trigger for rerelease. */
export const handleRereleaseCli: (
  event: functions.triggers.CliEvent,
) => Promise<shellArgs.CliResult<void>> = functions.handler.createTrigger({
  handler: rereleaseHandler,
  adaptInput: rereleaseCliAdapter,
  adaptOutput: rereleaseResponseMapper,
});

/** Runnable CLI trigger for unrelease. */
export const handleUnreleaseCli: (
  event: functions.triggers.CliEvent,
) => Promise<shellArgs.CliResult<void>> = functions.handler.createTrigger({
  handler: unreleaseHandler,
  adaptInput: unreleaseCliAdapter,
  adaptOutput: unreleaseResponseMapper,
});

// =============================================================================
// CLI Entry Points
// =============================================================================

/** CLI entry point for release (default export via main). */
export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const parsed = cliParseArgs.parseArgs(
    (cliArgs ?? []) as string[],
    {
      boolean: ["dry-run", "yes"],
      alias: { n: "dry-run", y: "yes" },
    },
  );

  // Interactive confirmation for release (when not --yes and not --dry-run)
  const typeArg = parsed._[0] as string | undefined;
  const dryRun = parsed["dry-run"] === true;
  const yes = parsed["yes"] === true;

  if (
    typeArg !== undefined && !dryRun && !yes &&
    ["patch", "minor", "major", "same"].includes(typeArg)
  ) {
    // Preview version
    const previousVersion = (await readVersionFile()) ?? "0.0.0";

    // Name the tag in the prompt — it is the step that actually publishes. The
    // bump goes through FFI and can fail on a machine without the native lib,
    // and a wrong number here would misdescribe what is about to be pushed, so
    // fall back to number-free wording rather than guessing.
    // bumpVersion returns the Go FormatSemver shape, which is ALWAYS
    // v-prefixed ("v4.3.1"), while readVersionFile returns the bare VERSION
    // file contents ("4.3.0"). Normalising here is what keeps the prompt from
    // reading "push tag vv4.3.1" on every bump.
    let nextVersion: string | undefined;
    try {
      const bumped = typeArg === "same"
        ? previousVersion
        : await bumpVersion(previousVersion, typeArg as VersionCommand);
      nextVersion = bumped.replace(/^v/, "");
    } catch {
      nextVersion = undefined;
    }

    tui.log.info(ctx, `Current version: ${previousVersion}`);
    tui.log.info(ctx, `Bump type: ${typeArg}`);
    tui.log.info(
      ctx,
      nextVersion !== undefined
        ? `This will bump the version, generate the changelog, commit, push, and push tag v${nextVersion} — the tag push starts the release pipeline.`
        : "This will bump the version, generate the changelog, commit, push, and push the release tag — the tag push starts the release pipeline.",
    );
    await out.flush();

    const proceed = await confirmPrompt("Proceed?");
    if (!proceed) {
      tui.log.warn(ctx, "Aborted.");
      return primitives.results.ok(undefined);
    }

    // User confirmed — add --yes so the handler doesn't throw on unpushed commits prompt
    parsed["yes"] = true;
  }

  const event = toCliEvent("release", parsed);
  return await handleReleaseCli(event);
};

/** CLI entry point for rerelease. */
export const rereleaseMain = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const parsed = cliParseArgs.parseArgs(
    (cliArgs ?? []) as string[],
    {
      boolean: ["dry-run", "yes"],
      alias: { n: "dry-run", y: "yes" },
    },
  );

  const dryRun = parsed["dry-run"] === true;
  const yes = parsed["yes"] === true;

  if (!dryRun && !yes) {
    const version = (await readVersionFile()) ?? "0.0.0";

    const proceed = await confirmPrompt(
      `Delete and recreate tag v${version} at HEAD? This re-fires the release pipeline.`,
    );
    if (!proceed) {
      tui.log.warn(ctx, "Aborted.");
      return primitives.results.ok(undefined);
    }

    parsed["yes"] = true;
  }

  const event = toCliEvent("rerelease", parsed);
  return await handleRereleaseCli(event);
};

/** CLI entry point for unrelease. */
export const unreleaseMain = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const parsed = cliParseArgs.parseArgs(
    (cliArgs ?? []) as string[],
    {
      boolean: ["yes"],
      alias: { y: "yes" },
    },
  );

  if (parsed["yes"] !== true) {
    const version = (await readVersionFile()) ?? "0.0.0";

    const proceed = await confirmPrompt(
      `Delete tag v${version} and its GitHub Release? The release commit stays in history.`,
    );
    if (!proceed) {
      tui.log.warn(ctx, "Aborted.");
      return primitives.results.ok(undefined);
    }

    // unrelease() still throws without this; the prompt is the interactive
    // path, the throw stays as the backstop for non-interactive callers.
    parsed["yes"] = true;
  }

  const event = toCliEvent("unrelease", parsed);
  return await handleUnreleaseCli(event);
};

if (import.meta.main) {
  runCliMain(
    await main(standards.crossRuntime.runtime.process.args as string[]),
    out,
  );
}
