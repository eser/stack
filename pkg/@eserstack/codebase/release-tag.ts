// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Release tag management — reads VERSION file, creates and pushes git tags.
 *
 * Can be used as a library or as a standalone script.
 *
 * Library usage:
 * ```typescript
 * import * as releaseTag from "@eserstack/codebase/release-tag";
 *
 * const result = await releaseTag.pushReleaseTag({ dryRun: true });
 * console.log(result.tag); // "v4.0.43"
 * ```
 *
 * CLI usage:
 *   deno run --allow-all ./release-tag.ts [--dry-run]
 *
 * @module
 */

import * as cliParseArgs from "@std/cli/parse-args";
import * as primitives from "@eserstack/primitives";
import * as standards from "@eserstack/standards";
import * as functions from "@eserstack/functions";
import type * as shellArgs from "@eserstack/shell/args";
import * as tui from "@eserstack/shell/tui";
import { createTag, pushTag } from "./git.ts";
import { readVersionFile } from "./versions.ts";
import { createCliContext, runCliMain, toCliEvent } from "./cli-support.ts";

const { ctx, output: out } = createCliContext();

/**
 * Options for pushing a release tag.
 */
export type PushReleaseTagOptions = {
  /** Root directory containing the VERSION file (default: ".") */
  readonly root?: string;
  /** Git remote to push to (default: "origin") */
  readonly remote?: string;
  /** Tag prefix (default: "v") */
  readonly tagPrefix?: string;
  /** Tag message template. Use {tag} and {version} placeholders. (default: "Release {tag}") */
  readonly messageTemplate?: string;
  /** Preview without creating/pushing (default: false) */
  readonly dryRun?: boolean;
};

/**
 * Result of pushing a release tag.
 */
export type PushReleaseTagResult = {
  /** The version read from VERSION file */
  readonly version: string;
  /** The full tag name (e.g., "v4.0.43") */
  readonly tag: string;
  /** The remote the tag was pushed to */
  readonly remote: string;
  /** Whether this was a dry run */
  readonly dryRun: boolean;
};

/**
 * Reads the VERSION file, creates an annotated git tag, and pushes it.
 *
 * @param options - Options for the operation
 * @returns Result describing the tag that was created
 * @throws If the VERSION file is missing or contains an invalid version
 */
export const pushReleaseTag = async (
  options: PushReleaseTagOptions = {},
): Promise<PushReleaseTagResult> => {
  const {
    root = ".",
    remote = "origin",
    tagPrefix = "v",
    messageTemplate = "Release {tag}",
    dryRun = false,
  } = options;

  const version = await readVersionFile({ root });
  if (version === undefined || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(
      `Invalid or missing version in VERSION file: "${version}"`,
    );
  }

  const tag = `${tagPrefix}${version}`;
  const message = messageTemplate
    .replace("{tag}", tag)
    .replace("{version}", version);

  if (!dryRun) {
    await createTag(tag, message);
    await pushTag(remote, tag);
  }

  return { version, tag, remote, dryRun };
};

// --- Handler ---

/** Handler: wraps pushReleaseTag as a Task via fromPromise. */
export const pushReleaseTagHandler: functions.handler.Handler<
  PushReleaseTagOptions,
  PushReleaseTagResult,
  Error
> = (input) => functions.task.fromPromise(() => pushReleaseTag(input));

// --- CLI Adapter ---

/** Adapter: functions.triggers.CliEvent → PushReleaseTagOptions (extracts --dry-run flag). */
const cliAdapter: functions.handler.Adapter<
  functions.triggers.CliEvent,
  PushReleaseTagOptions
> = (
  event,
) => primitives.results.ok({ dryRun: event.flags["dry-run"] === true });

// --- CLI ResponseMapper ---

/** ResponseMapper: formats PushReleaseTagResult for CLI output. */
const cliResponseMapper: functions.handler.ResponseMapper<
  PushReleaseTagResult,
  Error | functions.handler.AdaptError,
  shellArgs.CliResult<void>
> = (result) => {
  if (primitives.results.isFail(result)) {
    const message = result.error instanceof Error
      ? result.error.message
      : String(result.error);
    tui.log.error(ctx, message);
    return primitives.results.fail({ exitCode: 1 });
  }

  const { value } = result;

  if (value.dryRun) {
    tui.log.warn(
      ctx,
      `[DRY RUN] Would create and push tag ${value.tag}`,
    );
  } else {
    tui.log.success(ctx, `Created tag ${value.tag}`);
    tui.log.info(ctx, `Pushed tag ${value.tag} to ${value.remote}`);
  }

  return primitives.results.ok(undefined);
};

// --- CLI Trigger ---

/** Runnable CLI trigger for release-tag. */
export const handleCli: (
  event: functions.triggers.CliEvent,
) => Promise<shellArgs.CliResult<void>> = functions.handler.createTrigger({
  handler: pushReleaseTagHandler,
  adaptInput: cliAdapter,
  adaptOutput: cliResponseMapper,
});

/** CLI entry point for dispatcher compatibility. */
export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const parsed = cliParseArgs.parseArgs(
    (cliArgs ?? []) as string[],
    { boolean: ["dry-run"], alias: { n: "dry-run" } },
  );
  const event = toCliEvent("release-tag", parsed);
  return await handleCli(event);
};

if (import.meta.main) {
  runCliMain(
    await main(standards.crossRuntime.runtime.process.args as string[]),
    out,
  );
}
