// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Release orchestration — bump version, generate changelog, commit, and push.
 *
 * Provides three commands:
 * - **release** — full release flow (bump, changelog, commit, push)
 * - **rerelease** — delete and recreate the current version tag
 * - **unrelease** — delete the current version tag
 *
 * Library usage:
 * ```typescript
 * import * as release from "@eser/codebase/release";
 *
 * const result = await release.release({ type: "patch" });
 * console.log(result.version); // "4.1.4"
 * ```
 *
 * CLI usage:
 *   deno run --allow-all ./release.ts patch [--dry-run] [--yes]
 *   deno run --allow-all ./release.ts --rerelease [--dry-run]
 *   deno run --allow-all ./release.ts --unrelease [--yes]
 *
 * @module
 */

import * as cliParseArgs from "@std/cli/parse-args";
import * as primitives from "@eser/primitives";
import * as standards from "@eser/standards";
import * as functions from "@eser/functions";
import type * as shellArgs from "@eser/shell/args";
import * as shellExec from "@eser/shell/exec";
import * as span from "@eser/streams/span";

import { readVersionFile } from "./versions.ts";
import { createCliOutput, runCliMain, toCliEvent } from "./cli-support.ts";

const out = createCliOutput();

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
  /** Whether a changelog entry was generated. */
  readonly changelogGenerated: boolean;
  /** Whether changes were committed. */
  readonly committed: boolean;
  /** Whether the commit was pushed. */
  readonly pushed: boolean;
  /** Whether this was a dry run. */
  readonly dryRun: boolean;
};

/**
 * Options for the rerelease command.
 */
export type RereleaseOptions = {
  /** Preview changes without executing (default: false). */
  readonly dryRun?: boolean;
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

/** Stage specific files and create a commit. */
const gitAddAndCommit = async (
  message: string,
  files: ReadonlyArray<string>,
): Promise<void> => {
  for (const file of files) {
    await shellExec.exec`git add ${file}`.spawn();
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

// =============================================================================
// Prompt helper
// =============================================================================

/**
 * Ask a yes/no question on stderr/stdin.
 * Returns true only if the user types "y" or "Y".
 */
const confirm = async (question: string): Promise<boolean> => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const buf = new Uint8Array(256);

  // Use Deno.stderr / Deno.stdin directly — @eser/standards/runtime does not
  // expose interactive I/O, and this is a CLI-only concern.
  await Deno.stderr.write(encoder.encode(`${question} [y/N] `));
  const n = await Deno.stdin.read(buf);
  const answer = decoder.decode(buf.subarray(0, n ?? 0)).trim();
  return answer === "y" || answer === "Y";
};

// =============================================================================
// Pure logic — release
// =============================================================================

/**
 * Perform a full release: bump version, generate changelog, commit, push.
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
  if (type !== "same") {
    // Import versions dynamically to avoid circular deps at module scope
    const versionsModule = await import("./versions.ts");
    await versionsModule.versions(type, { dryRun });
  }

  // 5. Read new version
  const version = (await readVersionFile()) ?? previousVersion;

  // 6. Generate changelog
  let changelogGenerated = false;
  try {
    const changelogModule = await import("./changelog-gen.ts");
    await changelogModule.generateChangelog({ dryRun });
    changelogGenerated = true;
  } catch {
    // No user-facing changes — that's fine, continue without changelog entry
    changelogGenerated = false;
  }

  // 7-10. Format, stage, commit, push
  let committed = false;
  let pushed = false;

  if (!dryRun) {
    // Format changelog
    if (changelogGenerated) {
      await shellExec.exec`deno fmt CHANGELOG.md`.noThrow().spawn();
    }

    // Stage and commit
    const filesToStage = [
      "VERSION",
      "CHANGELOG.md",
      "pkg/*/deno.json",
      "pkg/*/package.json",
      "package.json",
    ];
    const commitMessage = `chore(codebase): release v${version}`;
    await gitAddAndCommit(commitMessage, filesToStage);
    committed = true;

    // Push
    await gitPushHead();
    pushed = true;
  }

  return {
    version,
    previousVersion,
    changelogGenerated,
    committed,
    pushed,
    dryRun,
  };
};

// =============================================================================
// Pure logic — rerelease
// =============================================================================

/**
 * Delete the current version tag and recreate it.
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
    // Push an empty commit with the release message format — triggers the
    // pipeline's existing commit message detection. Pure git, no GitHub API.
    const msg = `chore(codebase): release v${version}`;
    await shellExec.exec`git commit --allow-empty -m ${msg}`.spawn();
    await shellExec.exec`git push origin HEAD`.spawn();
  }

  return { version, tag, dryRun };
};

// =============================================================================
// Pure logic — unrelease
// =============================================================================

/**
 * Delete the current version tag (local + remote).
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
      `This will delete tag ${tag} locally and remotely. Re-run with --yes to confirm.`,
    );
  }

  await gitDeleteTag(tag);

  return { version, tag, deleted: true };
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
    out.writeln(span.red("✗"), span.text(" " + message));
    return primitives.results.fail({ exitCode: 1 });
  }

  const { value } = result;

  if (value.dryRun) {
    out.writeln(
      span.yellow("⚠"),
      span.text(" [DRY RUN] Release preview:"),
    );
    out.writeln(
      span.blue("ℹ"),
      span.text(
        `   Version: ${value.previousVersion} -> ${value.version}`,
      ),
    );
    out.writeln(
      span.blue("ℹ"),
      span.text(
        `   Changelog: ${
          value.changelogGenerated ? "generated" : "no user-facing changes"
        }`,
      ),
    );
    out.writeln(
      span.blue("ℹ"),
      span.text("   No changes were made."),
    );
  } else {
    out.writeln(
      span.green("✓"),
      span.text(` Released v${value.version}`),
    );
    out.writeln(
      span.blue("ℹ"),
      span.text(
        `   Version: ${value.previousVersion} -> ${value.version}`,
      ),
    );
    out.writeln(
      span.blue("ℹ"),
      span.text(
        `   Changelog: ${
          value.changelogGenerated ? "updated" : "no user-facing changes"
        }`,
      ),
    );
    out.writeln(
      span.blue("ℹ"),
      span.text(`   Committed: ${value.committed}`),
    );
    out.writeln(
      span.blue("ℹ"),
      span.text(`   Pushed: ${value.pushed}`),
    );
    out.writeln(
      span.blue("ℹ"),
      span.text("   CI will validate, tag, and publish."),
    );
    out.writeln(
      span.blue("ℹ"),
      span.text("   Watch: https://github.com/eser/stack/actions"),
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
    out.writeln(span.red("✗"), span.text(" " + message));
    return primitives.results.fail({ exitCode: 1 });
  }

  const { value } = result;

  if (value.dryRun) {
    out.writeln(
      span.yellow("⚠"),
      span.text(
        ` [DRY RUN] Would delete and recreate tag ${value.tag}`,
      ),
    );
  } else {
    out.writeln(
      span.green("✓"),
      span.text(` Re-tagged ${value.tag}`),
    );
    out.writeln(
      span.blue("ℹ"),
      span.text(" CI will validate and publish."),
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
    out.writeln(span.red("✗"), span.text(" " + message));
    return primitives.results.fail({ exitCode: 1 });
  }

  const { value } = result;

  if (value.deleted) {
    out.writeln(
      span.green("✓"),
      span.text(` Deleted tag v${value.version} (local + remote).`),
    );
  }

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
    out.writeln(
      span.blue("ℹ"),
      span.text(` Current version: ${previousVersion}`),
    );
    out.writeln(span.blue("ℹ"), span.text(` Bump type: ${typeArg}`));
    out.writeln(
      span.blue("ℹ"),
      span.text(
        " This will bump version, generate changelog, commit, and push.",
      ),
    );
    await out.flush();

    const proceed = await confirm("Proceed?");
    if (!proceed) {
      out.writeln(span.yellow("⚠"), span.text(" Aborted."));
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
      boolean: ["dry-run"],
      alias: { n: "dry-run" },
    },
  );
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
  const event = toCliEvent("unrelease", parsed);
  return await handleUnreleaseCli(event);
};

if (import.meta.main) {
  runCliMain(
    await main(standards.runtime.current.process.args as string[]),
    out,
  );
}
