// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills purge restore`: lists the purge history and copies the chosen
 * categories of an entry back into the project.
 *
 * The entry stays in the history, so a restore can be run again. A category
 * whose content already exists in the project is left alone unless
 * `--overwrite` is passed. The agent integration comes back through sync,
 * which sets the tools up from the noskills section of the manifest.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import type * as shellArgs from "@eserstack/shell/args";
import * as tui from "@eserstack/shell/tui";
import * as persistence from "../state/persistence.ts";
import * as purgeHistory from "../state/purge-history.ts";
import * as syncEngine from "../sync/engine.ts";
import * as mode from "../output/mode.ts";
import * as cmd from "../output/cmd.ts";

// =============================================================================
// Types
// =============================================================================

type Category = purgeHistory.PurgeCategory;

/** What `noskills purge restore` was asked to do. */
export type RestoreRequest = {
  /** An entry id, "latest" for the newest entry, or null to list entries. */
  readonly entry: string | null;
  /** The categories to restore, or null for every category the entry kept. */
  readonly categories: readonly Category[] | null;
  readonly overwrite: boolean;
};

/** Arguments `noskills purge restore` does not accept. */
export class RestoreArgsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RestoreArgsError";
  }
}

/** What restoring one category did. */
export type CategoryRestore =
  & { readonly category: Category }
  & (
    | (purgeHistory.RestoreOutcome & {
      /** The tools sync set up, for the agent integration. */
      readonly synced?: readonly string[];
    })
    | { readonly status: "failed"; readonly message: string }
  );

/** The usage line, without the command prefix. */
const USAGE = "purge restore [entry_id|latest] [category ...] [--overwrite]";

/** How many conflicting paths a refusal names before it counts the rest. */
const SHOWN_CONFLICTS = 5;

// =============================================================================
// Arguments (pure)
// =============================================================================

/** Reads the arguments that follow `purge restore`, without mode flags. */
export const parseRestoreArgs = (
  args: readonly string[],
): results.Result<RestoreRequest, RestoreArgsError> => {
  let overwrite = false;
  const positional: string[] = [];

  for (const arg of args) {
    if (arg === "--overwrite") {
      overwrite = true;
    } else if (arg.startsWith("-")) {
      return results.fail(
        new RestoreArgsError(
          `purge restore: unknown flag "${arg}"; the only flag is --overwrite`,
        ),
      );
    } else {
      positional.push(arg);
    }
  }

  const [entry, ...names] = positional;

  if (entry === undefined) {
    return results.ok({ entry: null, categories: null, overwrite });
  }

  const unknown = names.filter((name) => !purgeHistory.isPurgeCategory(name));

  if (unknown.length > 0) {
    return results.fail(
      new RestoreArgsError(
        `purge restore: unknown category "${
          unknown.join('", "')
        }"; the categories are ${purgeHistory.PURGE_CATEGORIES.join(", ")}`,
      ),
    );
  }

  return results.ok({
    entry,
    categories: names.length === 0
      ? null
      : [...new Set(names as readonly Category[])],
    overwrite,
  });
};

/**
 * The entry `id` names: an entry id, or "latest" for the newest. `entries` is
 * newest first, as `purgeHistory.listEntries` returns it.
 */
export const findEntry = (
  entries: readonly purgeHistory.HistoryEntry[],
  id: string,
): purgeHistory.HistoryEntry | null =>
  id === "latest"
    ? entries[0] ?? null
    : entries.find((entry) => entry.id === id) ?? null;

// =============================================================================
// Main
// =============================================================================

/**
 * Runs `noskills purge restore` in the project at `root`. Without an entry it
 * lists the history, and in an interactive terminal asks which entry and
 * which categories to restore.
 */
export const main = async (
  args: readonly string[],
  root: string,
): Promise<shellArgs.CliResult<void>> => {
  const currentMode = mode.detectMode(args);
  const interactive = currentMode === "human" &&
    mode.detectInteraction(args) === "interactive";
  const ctx = tui.createTuiContext({
    target: interactive ? "interactive" : "non-interactive",
  });

  const parsed = parseRestoreArgs(mode.stripModeFlag(args));

  if (results.isFail(parsed)) {
    tui.log.error(ctx, parsed.error.message);

    return results.fail({ exitCode: 1 });
  }

  const request = parsed.value;
  await cmd.loadCommandPrefix(root);
  const entries = await purgeHistory.listEntries(root);

  if (request.entry === null) {
    return await listOrPick(ctx, root, entries, request, interactive);
  }

  const entry = findEntry(entries, request.entry);

  if (entry === null) {
    tui.log.error(
      ctx,
      entries.length === 0
        ? `purge restore: no purge history entry "${request.entry}"; ${persistence.paths.purgeHistoryDir}/ holds no entries`
        : `purge restore: no purge history entry "${request.entry}"; the entries are ${
          entries.map((e) => e.id).join(", ")
        }, or use "latest"`,
    );

    return results.fail({ exitCode: 1 });
  }

  const missing = (request.categories ?? []).filter((category) =>
    !entry.categories.includes(category)
  );

  if (missing.length > 0) {
    tui.log.error(
      ctx,
      `purge restore: entry ${entry.id} holds no ${
        missing.join(", ")
      }; it holds ${entry.categories.join(", ")}`,
    );

    return results.fail({ exitCode: 1 });
  }

  return await restoreAndReport(
    ctx,
    root,
    entry.id,
    request.categories ?? entry.categories,
    request.overwrite,
  );
};

const listOrPick = async (
  ctx: tui.TuiContext,
  root: string,
  entries: readonly purgeHistory.HistoryEntry[],
  request: RestoreRequest,
  interactive: boolean,
): Promise<shellArgs.CliResult<void>> => {
  if (entries.length === 0) {
    tui.log.info(
      ctx,
      `No purge history: ${persistence.paths.purgeHistoryDir}/ holds no entries.`,
    );

    return results.ok(undefined);
  }

  tui.log.info(ctx, "Purge history, newest first:");
  for (const entry of entries) {
    const kept = entry.categories.length === 0
      ? "nothing kept"
      : entry.categories.join(", ");
    tui.log.step(ctx, `  ${entry.id}  ${kept}`);
  }

  if (!interactive) {
    tui.log.info(ctx, `Restore with: ${cmd.cmd(USAGE)}`);

    return results.ok(undefined);
  }

  const entry = await tui.select(ctx, {
    message: "Which purge do you want to restore?",
    options: entries.map((entry, index) => ({
      value: entry,
      label: entry.id,
      hint: index === 0 ? "latest" : undefined,
    })),
  });

  if (tui.isCancel(entry)) {
    tui.log.info(ctx, "Aborted.");

    return results.ok(undefined);
  }

  const categories = await tui.multiselect(ctx, {
    message: "Which categories? (space to toggle, enter to confirm)",
    options: entry.categories.map((category) => ({
      value: category,
      label: category,
    })),
    initialValues: entry.categories,
  });

  if (tui.isCancel(categories)) {
    tui.log.info(ctx, "Aborted.");

    return results.ok(undefined);
  }

  return await restoreAndReport(
    ctx,
    root,
    entry.id,
    categories,
    request.overwrite,
  );
};

// =============================================================================
// Restoring
// =============================================================================

/**
 * Restores `categories` of the entry one after another, in
 * `PURGE_CATEGORIES` order, and returns what each did. A refused or failed
 * category does not stop the others.
 */
export const restoreCategories = async (
  root: string,
  entryId: string,
  categories: readonly Category[],
  overwrite: boolean,
): Promise<readonly CategoryRestore[]> => {
  const chosen = new Set(categories);
  const outcomes: CategoryRestore[] = [];

  for (const category of purgeHistory.PURGE_CATEGORIES) {
    if (!chosen.has(category)) continue;

    // In order: sync, which restores the agent integration, reads the rules
    // and the manifest restored before it.
    // deno-lint-ignore no-await-in-loop
    outcomes.push(await restoreCategory(root, entryId, category, overwrite));
  }

  return outcomes;
};

const restoreCategory = async (
  root: string,
  entryId: string,
  category: Category,
  overwrite: boolean,
): Promise<CategoryRestore> => {
  try {
    switch (category) {
      case "concerns":
      case "specs":
      case "rules":
        return {
          category,
          ...(await purgeHistory.restorePaths(root, entryId, category, {
            overwrite,
          })),
        };
      case "manifest":
        return {
          category,
          ...(await purgeHistory.restoreManifestSection(root, entryId, {
            overwrite,
          })),
        };
      case "agent-integration":
        return await restoreAgentIntegration(root, entryId, overwrite);
      default: {
        const unreachable: never = category;
        throw new Error(`purge restore: unhandled category ${unreachable}`);
      }
    }
  } catch (error) {
    return {
      category,
      status: "failed",
      message: purgeHistory.describeError(error),
    };
  }
};

/**
 * Copies the agent files back, then runs sync for the tools the manifest
 * lists: sync writes the CLAUDE.md section and the hooks that purge took out
 * of files it shares with the user, and brings the copied files up to date.
 */
const restoreAgentIntegration = async (
  root: string,
  entryId: string,
  overwrite: boolean,
): Promise<CategoryRestore> => {
  const category = "agent-integration";
  const config = await persistence.readManifest(root);

  // readManifest casts hand-editable YAML to the type, so check the list.
  if (config === null || !Array.isArray(config.tools)) {
    return {
      category,
      status: "failed",
      message:
        `sync sets the agent integration up from the noskills section of ${persistence.paths.manifestFile}, and the project has none with a tools list; restore the manifest category too, or run noskills init`,
    };
  }

  const outcome = await purgeHistory.restorePaths(root, entryId, category, {
    overwrite,
  });

  if (outcome.status === "refused") {
    return { category, ...outcome };
  }

  const synced = await syncEngine.syncAll(root, config.tools, config);

  return {
    category,
    ...outcome,
    // syncAll also lists "hooks" when it set up Claude Code's hooks.
    synced: synced.filter((id) => (config.tools as string[]).includes(id)),
  };
};

// =============================================================================
// Reporting
// =============================================================================

const describeRestored = (outcome: CategoryRestore): string => {
  if (outcome.status !== "restored") return outcome.category;

  const files = `${outcome.paths.length} ${
    outcome.paths.length === 1 ? "file" : "files"
  }`;
  const synced = outcome.synced === undefined
    ? ""
    : outcome.synced.length === 0
    ? ", no tools to sync"
    : `, synced ${outcome.synced.join(", ")}`;

  return `${outcome.category} (${files}${synced})`;
};

const listPaths = (paths: readonly string[]): string => {
  const shown = paths.slice(0, SHOWN_CONFLICTS).join(", ");
  const rest = paths.length - SHOWN_CONFLICTS;

  return rest > 0 ? `${shown} and ${rest} more` : shown;
};

const restoreAndReport = async (
  ctx: tui.TuiContext,
  root: string,
  entryId: string,
  categories: readonly Category[],
  overwrite: boolean,
): Promise<shellArgs.CliResult<void>> => {
  const outcomes = await restoreCategories(
    root,
    entryId,
    categories,
    overwrite,
  );

  for (const outcome of outcomes) {
    switch (outcome.status) {
      case "restored":
        tui.log.step(ctx, `  Restored ${describeRestored(outcome)}`);
        if (outcome.skipped.length > 0) {
          tui.log.warn(
            ctx,
            `Did not copy symbolic links from the entry: ${
              listPaths(outcome.skipped)
            }`,
          );
        }
        break;
      case "refused":
        tui.log.warn(
          ctx,
          `Did not restore ${outcome.category}: ${
            listPaths(outcome.conflicts)
          } already ${
            outcome.conflicts.length === 1 ? "exists" : "exist"
          }. Run ${
            cmd.cmd(`purge restore ${entryId} ${outcome.category} --overwrite`)
          } to replace ${outcome.conflicts.length === 1 ? "it" : "them"}.`,
        );
        break;
      case "failed":
        tui.log.error(
          ctx,
          `Could not restore ${outcome.category}: ${outcome.message}`,
        );
        break;
      default: {
        const unreachable: never = outcome;
        throw new Error(
          `purge restore: unhandled outcome ${JSON.stringify(unreachable)}`,
        );
      }
    }
  }

  const incomplete = outcomes.some((outcome) => outcome.status !== "restored");

  if (incomplete) {
    tui.log.warn(ctx, `Restore from ${entryId} is incomplete.`);

    return results.fail({ exitCode: 1 });
  }

  tui.log.success(
    ctx,
    `Restored from ${entryId}. The entry stays in the purge history.`,
  );

  return results.ok(undefined);
};
