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
import * as standardsRuntime from "@eser/standards/runtime";
import * as shellArgs from "@eser/shell/args";
import { createTag, pushTag } from "./git.ts";
import { readVersionFile } from "./versions.ts";

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

/**
 * CLI main function for standalone usage.
 */
export const main = async (
  cliArgs?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const args = cliParseArgs.parseArgs(
    (cliArgs ?? standardsRuntime.runtime.process.args) as string[],
    {
      boolean: ["dry-run", "help"],
      alias: { h: "help", n: "dry-run" },
    },
  );

  if (args.help) {
    console.log(
      `Usage: release-tag.ts [--dry-run]

Reads the VERSION file and creates + pushes a git tag.

Options:
  --dry-run   Show what would happen without creating/pushing the tag
  --help      Show this help message`,
    );
    return results.ok(undefined);
  }

  const dryRun = args["dry-run"] === true;
  const result = await pushReleaseTag({ dryRun });

  console.log(
    `${result.dryRun ? "[DRY RUN] " : ""}Tag: ${result.tag}`,
  );

  if (!result.dryRun) {
    console.log(`  Created tag ${result.tag}`);
    console.log(`  Pushed tag ${result.tag} to ${result.remote}`);
  }

  console.log(
    `\n${
      result.dryRun ? "[DRY RUN] Would create and push" : "Done:"
    } ${result.tag}`,
  );

  return results.ok(undefined);
};

if (import.meta.main) {
  const result = await main();
  results.match(result, {
    ok: () => {},
    fail: (error) => {
      if (error.message !== undefined) {
        console.error(error.message);
      }
      standardsRuntime.runtime.process.setExitCode(error.exitCode);
    },
  });
}
