// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Update contributor list in README.md using the GitHub API.
 *
 * Fetches contributors via `gh api`, generates an HTML table, and replaces the
 * content between `<!-- CONTRIBUTORS:START -->` and `<!-- CONTRIBUTORS:END -->`
 * markers in the README.
 *
 * Can be used as a library or as a standalone script.
 *
 * Library usage:
 * ```typescript
 * import * as ghContributors from "@eser/codebase/gh-contributors";
 *
 * const result = await ghContributors.updateContributors({ columnsPerRow: 8 });
 * console.log(result.contributorCount); // 12
 * ```
 *
 * CLI usage:
 *   eser codebase gh contributors [--columns <n>] [--readme <path>] [--commit]
 *
 * @module
 */

import * as cliParseArgs from "@std/cli/parse-args";
import * as stdPath from "@std/path";
import * as primitives from "@eser/primitives";
import * as standards from "@eser/standards";
import * as functions from "@eser/functions";
import type * as shellArgs from "@eser/shell/args";
import * as shell from "@eser/shell";
import * as tui from "@eser/shell/tui";
import { createCliContext, runCliMain, toCliEvent } from "./cli-support.ts";

const { ctx, output: out } = createCliContext();

// --- Types ---

/**
 * A GitHub contributor returned by the API.
 */
export type Contributor = {
  readonly login: string;
  readonly avatar_url: string;
  readonly html_url: string;
  readonly contributions: number;
};

/**
 * Options for updating the contributor list.
 */
export type UpdateContributorsOptions = {
  /** Path to README.md (default: "README.md") */
  readonly readmePath?: string;
  /** Number of columns per row in the table (default: 8) */
  readonly columnsPerRow?: number;
  /** Auto-commit and push changes (default: false) */
  readonly commit?: boolean;
};

/**
 * Result of updating the contributor list.
 */
export type UpdateContributorsResult = {
  /** Number of contributors found */
  readonly contributorCount: number;
  /** Path to the README that was updated */
  readonly readmePath: string;
  /** Whether the README was modified */
  readonly updated: boolean;
  /** Whether changes were committed */
  readonly committed: boolean;
};

// --- Pure logic ---

const START_MARKER = "<!-- CONTRIBUTORS:START -->";
const END_MARKER = "<!-- CONTRIBUTORS:END -->";

/**
 * Gets the current repository owner and name via `gh repo view`.
 *
 * @returns Object with owner and name fields
 * @throws If not in a GitHub repository or gh CLI is unavailable
 */
export const getRepoInfo = async (): Promise<
  { readonly owner: string; readonly name: string }
> => {
  const json = await shell.exec
    .exec`gh repo view --json owner,name`.text();
  const parsed = JSON.parse(json) as {
    owner: { login: string };
    name: string;
  };
  return { owner: parsed.owner.login, name: parsed.name };
};

/**
 * Fetches all contributors for a repository via the GitHub API.
 *
 * @param owner - Repository owner
 * @param repo - Repository name
 * @returns Array of contributors sorted by contribution count
 */
export const fetchContributors = async (
  owner: string,
  repo: string,
): Promise<Contributor[]> => {
  const json = await shell.exec
    .exec`gh api repos/${owner}/${repo}/contributors --paginate`.text();
  const contributors = JSON.parse(json) as Contributor[];
  return contributors.filter((c) => !c.login.includes("[bot]"));
};

/**
 * Generates an HTML table of contributors.
 *
 * @param contributors - Array of contributors
 * @param columnsPerRow - Number of columns per row (default: 8)
 * @returns HTML table string
 */
export const generateContributorMarkdown = (
  contributors: readonly Contributor[],
  columnsPerRow = 8,
): string => {
  if (contributors.length === 0) {
    return `${START_MARKER}\n${END_MARKER}`;
  }

  const rows: string[] = [];

  for (let i = 0; i < contributors.length; i += columnsPerRow) {
    const chunk = contributors.slice(i, i + columnsPerRow);
    const cells = chunk.map(
      (c) =>
        `    <td align="center"><a href="${c.html_url}"><img src="${c.avatar_url}?s=80" width="80" /><br /><sub>${c.login}</sub></a></td>`,
    );
    rows.push(`  <tr>\n${cells.join("\n")}\n  </tr>`);
  }

  return `${START_MARKER}\n<table>\n${
    rows.join("\n")
  }\n</table>\n${END_MARKER}`;
};

/**
 * Replaces the contributor section in a README string.
 *
 * @param readmeContent - Current README content
 * @param markdown - New contributor markdown to insert
 * @returns Object with updated content and whether it changed
 * @throws If contributor markers are not found in the README
 */
export const replaceContributorSection = (
  readmeContent: string,
  markdown: string,
): { readonly content: string; readonly changed: boolean } => {
  const startIdx = readmeContent.indexOf(START_MARKER);
  const endIdx = readmeContent.indexOf(END_MARKER);

  if (startIdx === -1 || endIdx === -1) {
    throw new Error(
      `Could not find contributor markers in README. ` +
        `Add '${START_MARKER}' and '${END_MARKER}' markers to the file.`,
    );
  }

  const before = readmeContent.slice(0, startIdx);
  const after = readmeContent.slice(endIdx + END_MARKER.length);
  const newContent = `${before}${markdown}${after}`;

  return { content: newContent, changed: newContent !== readmeContent };
};

// --- Main function ---

/**
 * Updates the contributor list in the README.
 *
 * @param options - Options for the operation
 * @returns Result describing what was done
 */
export const updateContributors = async (
  options: UpdateContributorsOptions = {},
): Promise<UpdateContributorsResult> => {
  const {
    readmePath = "README.md",
    columnsPerRow = 8,
    commit: shouldCommit = false,
  } = options;

  const resolvedPath = stdPath.resolve(readmePath);

  // Get repo info
  const repoInfo = await getRepoInfo();

  // Fetch contributors
  const contributors = await fetchContributors(repoInfo.owner, repoInfo.name);

  // Generate markdown
  const markdown = generateContributorMarkdown(contributors, columnsPerRow);

  // Read README and replace section
  const currentContent = await standards.crossRuntime.runtime.fs.readTextFile(
    resolvedPath,
  );
  const { content: newContent, changed } = replaceContributorSection(
    currentContent,
    markdown,
  );

  let committed = false;

  if (changed) {
    await standards.crossRuntime.runtime.fs.writeTextFile(
      resolvedPath,
      newContent,
    );

    if (shouldCommit) {
      await shell.exec.exec`git add ${resolvedPath}`.spawn();
      await shell.exec
        .exec`git -c user.name=${"github-actions[bot]"} -c user.email=${"github-actions[bot]@users.noreply.github.com"} commit -m ${"docs: update contributors list"}`
        .spawn();
      await shell.exec.exec`git push`.spawn();
      committed = true;
    }
  }

  return {
    contributorCount: contributors.length,
    readmePath: resolvedPath,
    updated: changed,
    committed,
  };
};

// --- Handler ---

/** Handler: wraps updateContributors as a Task via fromPromise. */
export const updateContributorsHandler: functions.handler.Handler<
  UpdateContributorsOptions,
  UpdateContributorsResult,
  Error
> = (input) => functions.task.fromPromise(() => updateContributors(input));

// --- CLI Adapter ---

/** Adapter: functions.triggers.CliEvent -> UpdateContributorsOptions. */
const cliAdapter: functions.handler.Adapter<
  functions.triggers.CliEvent,
  UpdateContributorsOptions
> = (event) => {
  const columnsRaw = event.flags["columns"] as string | undefined;
  const columns = columnsRaw !== undefined ? Number(columnsRaw) : undefined;

  return primitives.results.ok({
    readmePath: (event.flags["readme"] as string | undefined) ?? undefined,
    columnsPerRow: columns,
    commit: event.flags["commit"] === true,
  });
};

// --- CLI ResponseMapper ---

/** ResponseMapper: formats UpdateContributorsResult for CLI output. */
const cliResponseMapper: functions.handler.ResponseMapper<
  UpdateContributorsResult,
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

  if (!value.updated) {
    tui.log.info(
      ctx,
      `No changes — ${value.contributorCount} contributors already up to date.`,
    );
  } else if (value.committed) {
    tui.log.success(
      ctx,
      `Updated ${value.contributorCount} contributors and committed changes.`,
    );
  } else {
    tui.log.success(
      ctx,
      `Updated ${value.contributorCount} contributors in ${value.readmePath}.`,
    );
  }

  return primitives.results.ok(undefined);
};

// --- CLI Trigger ---

/** Runnable CLI trigger for gh-contributors. */
export const handleCli: (
  event: functions.triggers.CliEvent,
) => Promise<shellArgs.CliResult<void>> = functions.handler.createTrigger({
  handler: updateContributorsHandler,
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
      string: ["columns", "readme"],
      boolean: ["commit"],
      alias: { h: "help" },
    },
  );

  if (parsed["help"]) {
    console.log("eser codebase gh contributors — Update contributor list\n");
    console.log("Options:");
    console.log(
      "  --columns <n>    Number of columns per row (default: 8)",
    );
    console.log(
      "  --readme <path>  Path to README.md (default: README.md)",
    );
    console.log("  --commit         Auto-commit and push changes");
    console.log("  --help, -h       Show this help");
    return primitives.results.ok(undefined);
  }

  const event = toCliEvent("gh-contributors", parsed);
  return await handleCli(event);
};

if (import.meta.main) {
  runCliMain(
    await main(standards.crossRuntime.runtime.process.args as string[]),
    out,
  );
}
