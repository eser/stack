// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Release tag management — reads VERSION file, creates and pushes git tags.
 *
 * Can be used as a library or as a standalone script.
 *
 * Library usage:
 * ```typescript
 * import * as releaseTag from "@eser/codebase/release-tag";
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
import * as results from "@eser/primitives/results";
import { runtime } from "@eser/standards/runtime";
import * as handler from "@eser/functions/handler";
import type { CliEvent } from "@eser/functions/triggers";
import { fromPromise } from "@eser/functions/task";
import type * as shellArgs from "@eser/shell/args";
import * as fmt from "@eser/shell/formatting";
import { createTag, pushTag } from "./git.ts";
import { readVersionFile } from "./versions.ts";
import { runCliMain, toCliEvent } from "./cli-support.ts";

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
export const pushReleaseTagHandler: handler.Handler<
  PushReleaseTagOptions,
  PushReleaseTagResult,
  Error
> = (input) => fromPromise(() => pushReleaseTag(input));

// --- CLI Adapter ---

/** Adapter: CliEvent → PushReleaseTagOptions (extracts --dry-run flag). */
const cliAdapter: handler.Adapter<CliEvent, PushReleaseTagOptions> = (
  event,
) => results.ok({ dryRun: event.flags["dry-run"] === true });

// --- CLI ResponseMapper ---

/** ResponseMapper: formats PushReleaseTagResult for CLI output. */
const cliResponseMapper: handler.ResponseMapper<
  PushReleaseTagResult,
  Error | handler.AdaptError,
  shellArgs.CliResult<void>
> = (result) => {
  if (results.isFail(result)) {
    fmt.printError(
      result.error instanceof Error
        ? result.error.message
        : String(result.error),
    );
    return results.fail({ exitCode: 1 });
  }

  const { value } = result;

  if (value.dryRun) {
    fmt.printWarning(`[DRY RUN] Would create and push tag ${value.tag}`);
  } else {
    fmt.printSuccess(`Created tag ${value.tag}`);
    fmt.printInfo(`Pushed tag ${value.tag} to ${value.remote}`);
  }

  return results.ok(undefined);
};

// --- CLI Trigger ---

/** Runnable CLI trigger for release-tag. */
export const handleCli: (
  event: CliEvent,
) => Promise<shellArgs.CliResult<void>> = handler.createTrigger({
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
  runCliMain(await main(runtime.process.args as string[]));
}
