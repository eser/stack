// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `noskills purge`: removes noskills content from the project. It asks about
 * each category, or takes every category with `--force`, and moves what it
 * removes into the purge history (state/purge-history.ts) unless
 * `--no-history` is passed. `noskills purge restore` (purge-restore.ts) puts
 * it back.
 *
 * @module
 */

import * as yaml from "@eemeli/yaml";
import * as results from "@eserstack/primitives/results";
import type * as shellArgs from "@eserstack/shell/args";
import * as tui from "@eserstack/shell/tui";
import * as persistence from "../state/persistence.ts";
import * as purgeHistory from "../state/purge-history.ts";
import * as mode from "../output/mode.ts";
import * as cmd from "../output/cmd.ts";
import * as hookCommands from "../sync/hook-commands.ts";
import * as codexAdapter from "../sync/adapters/codex.ts";
import * as purgeRestore from "./purge-restore.ts";
import * as crossRuntime from "@eserstack/standards/cross-runtime";

// =============================================================================
// Types
// =============================================================================

type TuiCtx = tui.TuiContext;

type Category = purgeHistory.PurgeCategory;

type CategoryDetection = {
  readonly id: Category;
  /** Purge has something of this category to take. */
  readonly exists: boolean;
  /**
   * The question purge asks before taking the category, or null when it does
   * not ask: the manifest section goes with any category the user confirms.
   */
  readonly message: string | null;
};

/** What purging one path, or one edit of a shared file, did. */
type StepOutcome = {
  readonly removed: boolean;
  readonly error: string | null;
};

/** What purging one category did. */
type CategoryOutcome = {
  readonly id: Category;
  /** Purge took at least part of the category. */
  readonly removed: boolean;
  readonly errors: readonly string[];
};

const ABSENT: StepOutcome = { removed: false, error: null };
const REMOVED: StepOutcome = { removed: true, error: null };

/** How many items a confirmation question names before it counts the rest. */
const SHOWN_ITEMS = 6;

// =============================================================================
// Main
// =============================================================================

/** The flags purge takes, besides the mode flags. */
const PURGE_FLAGS: ReadonlySet<string> = new Set(["--force", "--no-history"]);

/**
 * Runs `noskills purge`, or `noskills purge restore` when the first argument
 * that is not a flag is `restore`. `root` is the project; the CLI leaves it
 * out and uses the working directory.
 */
export const main = async (
  args?: readonly string[],
  root: string = crossRuntime.runtime.process.cwd(),
): Promise<shellArgs.CliResult<void>> => {
  const cleanArgs = mode.stripModeFlag(args);
  const positional = cleanArgs.filter((arg) => !arg.startsWith("-"));

  // Checked before any flag, so `purge --force restore` never purges.
  if (positional[0] === "restore") {
    const allArgs = args ?? [];
    const restoreAt = allArgs.indexOf("restore");

    return await purgeRestore.main(
      allArgs.filter((_, index) => index !== restoreAt),
      root,
    );
  }

  const currentMode = mode.detectMode(args);
  const ctx = tui.createTuiContext({
    target: currentMode === "agent" ? "non-interactive" : "interactive",
  });

  // A destructive command does not guess at arguments it does not know.
  const unknown = cleanArgs.filter((arg) =>
    !arg.startsWith("-") || !PURGE_FLAGS.has(arg)
  );
  if (unknown.length > 0) {
    tui.log.error(
      ctx,
      `purge: unknown argument "${
        unknown.join('", "')
      }"; purge takes --force and --no-history, or the restore subcommand`,
    );

    return results.fail({ exitCode: 1 });
  }

  const force = cleanArgs.includes("--force");
  const keepHistory = !cleanArgs.includes("--no-history");

  // Agent mode without --force: fail
  if (!force && currentMode === "agent") {
    tui.log.error(ctx, "Purge requires `--force` flag in agent mode.");

    return results.fail({ exitCode: 1 });
  }

  // Read before purge takes the noskills section out of the manifest, so the
  // restore hint names the command the project uses.
  await cmd.loadCommandPrefix(root);

  // Read once, before the specs move: the agent integration takes the Kiro
  // and OpenCode copies of each spec.
  const specNames = await listSpecNames(root);
  const detections = await detectCategories(root, specNames);
  const asked = detections.filter((d) => d.exists && d.message !== null);
  let selected: readonly Category[];
  const kept: Category[] = [];

  if (force) {
    // --force takes every category without asking
    selected = detections.filter((d) => d.exists).map((d) => d.id);

    if (selected.length === 0) {
      tui.log.info(ctx, "Nothing to remove.");

      return results.ok(undefined);
    }
  } else {
    if (asked.length === 0) {
      tui.log.info(ctx, "Nothing to remove.");

      return results.ok(undefined);
    }

    // Collect all answers first
    const confirmed: Category[] = [];

    for (const cat of asked) {
      // Prompts are asked one at a time, and a cancel stops before the next.
      // deno-lint-ignore no-await-in-loop
      const answer = await tui.confirm(ctx, { message: cat.message ?? "" });

      if (tui.isCancel(answer)) {
        tui.log.info(ctx, "Aborted.");

        return results.ok(undefined);
      }

      (answer === true ? confirmed : kept).push(cat.id);
    }

    if (confirmed.length === 0) {
      tui.log.info(ctx, "Nothing selected for removal.");

      return results.ok(undefined);
    }

    // The manifest section goes with any category the user confirmed.
    const manifest = detections.find((d) => d.id === "manifest");
    selected = manifest?.exists === true
      ? [...confirmed, "manifest"]
      : confirmed;
  }

  const entryId = keepHistory
    ? await purgeHistory.newEntryId(root, Date.now())
    : null;

  if (force) {
    tui.log.step(ctx, "Purging noskills content...");
  }

  // The categories cover separate paths, so they are purged concurrently; the
  // log lines still follow the order the user confirmed them in.
  const outcomes = await Promise.all(
    selected.map((id) => purgeCategory(root, id, entryId, specNames)),
  );

  reportOutcomes(ctx, outcomes, kept);

  const failed = outcomes.some((o) => o.errors.length > 0);
  const summary = force
    ? "Purge complete."
    : `Purge complete (${
      countRemoved(outcomes, asked)
    } of ${asked.length} categories removed).`;

  if (failed) {
    tui.log.warn(ctx, `${summary} Some content could not be removed.`);
  } else {
    tui.log.success(ctx, summary);
  }

  if (entryId !== null) {
    await finishHistoryEntry(ctx, root, entryId, outcomes);
  } else if (outcomes.some((o) => o.removed)) {
    await reportNoHistory(ctx, root);
  }

  return failed ? results.fail({ exitCode: 1 }) : results.ok(undefined);
};

/** How many of the categories purge asked about were removed in full. */
const countRemoved = (
  outcomes: readonly CategoryOutcome[],
  asked: readonly CategoryDetection[],
): number => {
  const askedIds = new Set(asked.map((d) => d.id));

  return outcomes.filter((o) =>
    askedIds.has(o.id) && o.removed && o.errors.length === 0
  ).length;
};

// =============================================================================
// Reporting
// =============================================================================

const categoryLabel = (id: Category): string => {
  const labels: Record<Category, string> = {
    concerns: "concerns",
    specs: "specs",
    rules: "rules",
    manifest: "the noskills section of `manifest.yml`",
    "agent-integration": "agent integration",
  };

  return labels[id];
};

const reportOutcomes = (
  ctx: TuiCtx,
  outcomes: readonly CategoryOutcome[],
  kept: readonly Category[],
): void => {
  for (const outcome of outcomes) {
    const label = categoryLabel(outcome.id);

    if (outcome.removed) {
      tui.log.step(ctx, `  Removed ${label}`);
    }

    for (const error of outcome.errors) {
      tui.log.error(ctx, `Could not remove ${label}: ${error}`);
    }
  }

  for (const id of kept) {
    tui.log.step(ctx, `  Kept ${categoryLabel(id)}`);
  }
};

/**
 * Tells the user where the copy is and drops the oldest entries beyond the
 * limit; an entry that holds nothing is removed instead.
 */
const finishHistoryEntry = async (
  ctx: TuiCtx,
  root: string,
  entryId: string,
  outcomes: readonly CategoryOutcome[],
): Promise<void> => {
  if (!outcomes.some((o) => o.removed)) {
    try {
      await purgeHistory.dropEntry(root, entryId);
    } catch {
      // Nothing was moved into the entry, so at most an empty folder is left
      // behind; the failures above are what the user needs to see.
    }

    return;
  }

  tui.log.info(
    ctx,
    `A copy is in ${purgeHistory.entryPath(entryId)}/. Restore it with: ${
      cmd.cmd(`purge restore ${entryId}`)
    }`,
  );

  try {
    const dropped = await purgeHistory.pruneHistory(
      root,
      purgeHistory.PURGE_HISTORY_LIMIT,
    );

    for (const id of dropped) {
      tui.log.step(
        ctx,
        `  Dropped the oldest purge history entry ${id} (the history keeps ${purgeHistory.PURGE_HISTORY_LIMIT})`,
      );
    }
  } catch (error) {
    tui.log.warn(
      ctx,
      `Could not drop the oldest purge history entries: ${
        purgeHistory.describeError(error)
      }. Remove the oldest folders in ${persistence.paths.purgeHistoryDir}/ yourself.`,
    );
  }
};

/**
 * With `--no-history` nothing of this purge is kept; entries of earlier purges
 * still hold copies, which a user removing content from disk wants to know.
 */
const reportNoHistory = async (ctx: TuiCtx, root: string): Promise<void> => {
  tui.log.info(ctx, "No copy kept (--no-history).");

  try {
    const earlier = await purgeHistory.listEntries(root);

    if (earlier.length > 0) {
      tui.log.info(
        ctx,
        `${persistence.paths.purgeHistoryDir}/ still holds ${earlier.length} earlier ${
          earlier.length === 1 ? "entry" : "entries"
        }; delete that folder to remove those copies too.`,
      );
    }
  } catch {
    // The hint is extra; the purge itself is done and reported.
  }
};

// =============================================================================
// Files noskills shares with the user
// =============================================================================

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value instanceof Object && !Array.isArray(value);

/**
 * A file that holds noskills' part next to the user's own content. `strip`
 * returns the text without noskills' part ("" when nothing else is left), or
 * null when the file holds no noskills part; it throws on a file it cannot
 * parse. Purge writes the stripped text back, and restore puts noskills' part
 * back by running sync.
 */
type SharedFile = {
  readonly file: string;
  readonly strip: (content: string) => string | null;
};

const SECTION_START = "<!-- noskills:start -->";
const SECTION_END = "<!-- noskills:end -->";

/** CLAUDE.md and AGENTS.md: the section between the noskills markers. */
const withoutMarkedSection = (content: string): string | null => {
  const startIdx = content.indexOf(SECTION_START);
  if (startIdx === -1) return null;
  const endIdx = content.indexOf(SECTION_END, startIdx);
  if (endIdx === -1) return null;

  const rest = content.slice(0, startIdx).trimEnd() + "\n" +
    content.slice(endIdx + SECTION_END.length).trimStart();

  return rest.trim() === "" ? "" : rest.trimEnd() + "\n";
};

/** `.codex/config.toml`: the `[mcp_servers.noskills]` table. */
const withoutMcpTable = (content: string): string | null => {
  const rest = codexAdapter.withoutNoskillsMcpTable(content);
  if (rest === content) return null;

  return rest.trim() === "" ? "" : rest.trimEnd() + "\n";
};

/** True when a settings file's `hooks` hold a handler that runs noskills. */
const holdsNoskillsHook = (hooks: unknown): boolean =>
  isRecord(hooks) &&
  Object.values(hooks).some((groups) =>
    Array.isArray(groups) &&
    groups.some((group: unknown) =>
      isRecord(group) && Array.isArray(group["hooks"]) &&
      group["hooks"].some((handler: unknown) =>
        isRecord(handler) &&
        hookCommands.isNoskillsHookCommand(handler["command"])
      )
    )
  );

/**
 * A Claude Code or Codex settings file without noskills' hooks; the user's
 * hooks stay, and the `hooks` key goes when nothing is left in it.
 */
const withoutNoskillsHooks = (
  settings: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | null => {
  if (!holdsNoskillsHook(settings["hooks"])) return null;

  const userHooks = hookCommands.userHookGroups(settings["hooks"]);
  const { hooks: _hooks, ...rest } = settings;

  return Object.keys(userHooks).length === 0
    ? rest
    : { ...settings, hooks: userHooks };
};

/** An MCP config without the `noskills` server under `serversKey`. */
const withoutMcpServer = (serversKey: string) =>
(
  config: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> | null => {
  const servers = config[serversKey];
  if (!isRecord(servers) || !("noskills" in servers)) return null;

  const { noskills: _noskills, ...others } = servers;
  const { [serversKey]: _servers, ...rest } = config;

  return Object.keys(others).length === 0
    ? rest
    : { ...config, [serversKey]: others };
};

/** Applies `edit` to a JSON object file; "" when no key is left. */
const jsonStrip = (
  edit: (
    doc: Readonly<Record<string, unknown>>,
  ) => Readonly<Record<string, unknown>> | null,
) =>
(content: string): string | null => {
  const doc = JSON.parse(content) as unknown;
  if (!isRecord(doc)) return null;

  const rest = edit(doc);
  if (rest === null) return null;

  return Object.keys(rest).length === 0
    ? ""
    : JSON.stringify(rest, null, 2) + "\n";
};

const SHARED_FILES: readonly SharedFile[] = [
  { file: "CLAUDE.md", strip: withoutMarkedSection },
  { file: "AGENTS.md", strip: withoutMarkedSection },
  { file: ".claude/settings.json", strip: jsonStrip(withoutNoskillsHooks) },
  { file: ".codex/hooks.json", strip: jsonStrip(withoutNoskillsHooks) },
  { file: ".codex/config.toml", strip: withoutMcpTable },
  {
    file: ".copilot/mcp.json",
    strip: jsonStrip(withoutMcpServer("mcpServers")),
  },
  {
    file: ".kiro/settings/mcp.json",
    strip: jsonStrip(withoutMcpServer("mcpServers")),
  },
  { file: "opencode.json", strip: jsonStrip(withoutMcpServer("mcp")) },
];

const readOptionalText = async (path: string): Promise<string | null> => {
  try {
    return await crossRuntime.runtime.fs.readTextFile(path);
  } catch (error) {
    if (error instanceof crossRuntime.NotFoundError) return null;

    throw error;
  }
};

/** True when the shared file holds noskills' part it can take out. */
const holdsNoskillsPart = async (
  root: string,
  shared: SharedFile,
): Promise<boolean> => {
  try {
    const content = await readOptionalText(`${root}/${shared.file}`);

    return content !== null && shared.strip(content) !== null;
  } catch {
    // Unreadable or not parseable: detection offers nothing for this file,
    // and purge reports it when it tries to edit the file.
    return false;
  }
};

/** Takes noskills' part out of a shared file; a file left empty goes. */
const stripSharedFile = async (
  root: string,
  shared: SharedFile,
): Promise<StepOutcome> => {
  const path = `${root}/${shared.file}`;

  try {
    const content = await readOptionalText(path);
    if (content === null) return ABSENT;

    const rest = shared.strip(content);
    if (rest === null) return ABSENT;

    if (rest === "") {
      await crossRuntime.runtime.fs.remove(path);
    } else {
      await crossRuntime.runtime.fs.writeTextFile(path, rest);
    }

    return REMOVED;
  } catch (error) {
    return {
      removed: false,
      error: `${shared.file}: ${
        purgeHistory.describeError(error)
      }; take noskills' part out of it yourself`,
    };
  }
};

// =============================================================================
// Detection
// =============================================================================

/** The names of the spec folders in `.eser/specs/`. */
const listSpecNames = async (root: string): Promise<readonly string[]> => {
  const names: string[] = [];

  try {
    for await (
      const entry of crossRuntime.runtime.fs.readDir(
        `${root}/${persistence.paths.specsDir}`,
      )
    ) {
      if (entry.isDirectory) {
        names.push(entry.name);
      }
    }
  } catch {
    // No specs directory: no specs.
  }

  return names;
};

/** The project paths purge moves for the agent integration. */
const agentIntegrationPaths = (
  specNames: readonly string[],
): readonly string[] => [
  ...purgeHistory.AGENT_INTEGRATION_FILES,
  ...specNames.flatMap((name) => purgeHistory.specMirrorFiles(name)),
];

const detectCategories = async (
  root: string,
  specNames: readonly string[],
): Promise<readonly CategoryDetection[]> =>
  await Promise.all([
    detectConcerns(root),
    detectSpecs(root, specNames),
    detectRules(root),
    detectManifest(root),
    detectAgentIntegration(root, specNames),
  ]);

/** True when any of the paths is in the project. */
const hasAnyPath = async (
  root: string,
  paths: readonly string[],
): Promise<boolean> => {
  const found = await Promise.all(
    paths.map((path) => purgeHistory.pathExists(`${root}/${path}`)),
  );

  return found.includes(true);
};

const detectConcerns = async (root: string): Promise<CategoryDetection> => {
  const [concerns, exists] = await Promise.all([
    persistence.listConcerns(root),
    hasAnyPath(root, purgeHistory.CATEGORY_PATHS.concerns),
  ]);
  const names = concerns.map((c) => c.id).join(", ");

  return {
    id: "concerns",
    exists,
    message: concerns.length > 0 ? `Remove concerns? (${names})` : null,
  };
};

const detectSpecs = async (
  root: string,
  specNames: readonly string[],
): Promise<CategoryDetection> => {
  const [specStates, exists] = await Promise.all([
    persistence.listSpecStates(root),
    hasAnyPath(root, purgeHistory.CATEGORY_PATHS.specs),
  ]);
  // Spec folders without state files count too.
  const totalCount = Math.max(specStates.length, specNames.length);

  if (totalCount === 0) {
    // Only the workflow state is left, which `noskills init` writes before
    // any spec exists.
    return {
      id: "specs",
      exists,
      message: exists
        ? `Remove the workflow state? (${persistence.paths.progressesDir}/)`
        : null,
    };
  }

  const details = specStates.map((s) => `${s.name} ${s.state.phase}`).join(
    ", ",
  );
  const message = specStates.length > 0
    ? `Remove specs? (${totalCount} specs: ${details})`
    : `Remove specs? (${totalCount} spec directories)`;

  return { id: "specs", exists, message };
};

const detectRules = async (root: string): Promise<CategoryDetection> => {
  let count = 0;

  try {
    for await (
      const entry of crossRuntime.runtime.fs.readDir(
        `${root}/${persistence.paths.rulesDir}`,
      )
    ) {
      if (entry.isFile) {
        count++;
      }
    }
  } catch {
    // Directory doesn't exist
  }

  return {
    id: "rules",
    exists: await hasAnyPath(root, purgeHistory.CATEGORY_PATHS.rules),
    message: count > 0 ? `Remove rules? (${count} active rules)` : null,
  };
};

const detectManifest = async (root: string): Promise<CategoryDetection> => ({
  id: "manifest",
  exists: await persistence.isInitialized(root),
  message: null,
});

const detectAgentIntegration = async (
  root: string,
  specNames: readonly string[],
): Promise<CategoryDetection> => {
  const paths = agentIntegrationPaths(specNames);
  const [shared, files] = await Promise.all([
    Promise.all(SHARED_FILES.map((file) => holdsNoskillsPart(root, file))),
    Promise.all(
      paths.map((path) => purgeHistory.pathExists(`${root}/${path}`)),
    ),
  ]);

  const found = [
    ...SHARED_FILES.filter((_, i) => shared[i] === true).map((shared) =>
      `noskills' part of ${shared.file}`
    ),
    ...paths.filter((_, i) => files[i] === true),
  ];
  const shown = found.slice(0, SHOWN_ITEMS).join(", ");
  const more = found.length - SHOWN_ITEMS;

  return {
    id: "agent-integration",
    exists: found.length > 0,
    message: found.length > 0
      ? `Remove agent integration? (${shown}${
        more > 0 ? ` and ${more} more` : ""
      })`
      : null,
  };
};

// =============================================================================
// Purging one category
// =============================================================================

/**
 * Takes one category out of the project. With an entry id, paths move into
 * that purge history entry and the manifest section is copied there first;
 * with null they are deleted.
 */
const purgeCategory = async (
  root: string,
  id: Category,
  entryId: string | null,
  specNames: readonly string[],
): Promise<CategoryOutcome> => {
  switch (id) {
    case "concerns":
    case "specs":
    case "rules":
      return categoryOutcome(
        id,
        await takePaths(root, id, purgeHistory.CATEGORY_PATHS[id], entryId),
      );
    case "manifest":
      return await takeManifestSection(root, entryId);
    case "agent-integration":
      return await takeAgentIntegration(root, entryId, specNames);
    default: {
      const unreachable: never = id;
      throw new Error(`purge: unhandled category ${String(unreachable)}`);
    }
  }
};

const categoryOutcome = (
  id: Category,
  steps: readonly StepOutcome[],
): CategoryOutcome => ({
  id,
  removed: steps.some((step) => step.removed),
  errors: steps.flatMap((step) => step.error === null ? [] : [step.error]),
});

const takePath = async (
  root: string,
  id: Category,
  path: string,
  entryId: string | null,
): Promise<StepOutcome> => {
  try {
    if (!(await purgeHistory.pathExists(`${root}/${path}`))) {
      return ABSENT;
    }

    if (entryId === null) {
      await crossRuntime.runtime.fs.remove(`${root}/${path}`, {
        recursive: true,
      });
    } else {
      await purgeHistory.keepPath(root, entryId, id, path);
    }

    return REMOVED;
  } catch (error) {
    const hint = error instanceof purgeHistory.PurgeHistoryError
      ? "; pass --no-history to delete it without a copy"
      : "";

    return {
      removed: false,
      error: `${path}: ${purgeHistory.describeError(error)}${hint}`,
    };
  }
};

const takePaths = async (
  root: string,
  id: Category,
  paths: readonly string[],
  entryId: string | null,
): Promise<readonly StepOutcome[]> =>
  await Promise.all(paths.map((path) => takePath(root, id, path, entryId)));

const takeManifestSection = async (
  root: string,
  entryId: string | null,
): Promise<CategoryOutcome> => {
  const manifestFile = persistence.paths.manifestFile;
  const manifestPath = `${root}/${manifestFile}`;

  try {
    const doc = yaml.parseDocument(
      await crossRuntime.runtime.fs.readTextFile(manifestPath),
    );

    if (doc.errors.length > 0) {
      return categoryOutcome("manifest", [{
        removed: false,
        error: `${manifestFile} is not valid YAML (${
          doc.errors[0]?.message
        }); fix it, then purge again`,
      }]);
    }

    if (!doc.has("noskills")) {
      return categoryOutcome("manifest", [ABSENT]);
    }

    if (entryId !== null) {
      await purgeHistory.keepManifestSection(
        root,
        entryId,
        doc.get("noskills", true),
      );
    }

    doc.delete("noskills");
    await crossRuntime.runtime.fs.writeTextFile(
      manifestPath,
      doc.toString(purgeHistory.MANIFEST_YAML_OPTIONS),
    );

    return categoryOutcome("manifest", [REMOVED]);
  } catch (error) {
    if (error instanceof crossRuntime.NotFoundError) {
      return categoryOutcome("manifest", [ABSENT]);
    }

    return categoryOutcome("manifest", [{
      removed: false,
      error: `${manifestFile}: ${purgeHistory.describeError(error)}`,
    }]);
  }
};

/**
 * Removes the folders above `path` that purge left empty, up to the project
 * root, so a tool's folder does not stay behind with nothing in it.
 */
const removeEmptyParents = async (
  root: string,
  path: string,
): Promise<void> => {
  let dir = crossRuntime.runtime.path.dirname(path);

  while (dir !== "." && dir !== "" && dir !== "/") {
    try {
      // Without recursive, remove refuses a folder that still holds files.
      // Each folder is checked after the one inside it is gone.
      // deno-lint-ignore no-await-in-loop
      await crossRuntime.runtime.fs.remove(`${root}/${dir}`);
    } catch {
      // Not empty, or already gone: the folders above stay as they are.
      return;
    }

    dir = crossRuntime.runtime.path.dirname(dir);
  }
};

const takeAgentIntegration = async (
  root: string,
  entryId: string | null,
  specNames: readonly string[],
): Promise<CategoryOutcome> => {
  // The folder records the edits of the shared files, which leave nothing to
  // move, so restore knows to run sync. Without it, nothing is edited.
  if (entryId !== null) {
    try {
      await purgeHistory.markCategory(root, entryId, "agent-integration");
    } catch (error) {
      return categoryOutcome("agent-integration", [{
        removed: false,
        error: purgeHistory.describeError(error),
      }]);
    }
  }

  const paths = agentIntegrationPaths(specNames);
  const [moved, edited] = await Promise.all([
    takePaths(root, "agent-integration", paths, entryId),
    Promise.all(SHARED_FILES.map((shared) => stripSharedFile(root, shared))),
  ]);

  const touched = [
    ...paths.filter((_, i) => moved[i]?.removed === true),
    ...SHARED_FILES.filter((_, i) => edited[i]?.removed === true).map((
      shared,
    ) => shared.file),
  ];
  for (const path of touched) {
    // One path at a time: two files can share a folder, and the first check
    // must finish before the second decides whether that folder is empty.
    // deno-lint-ignore no-await-in-loop
    await removeEmptyParents(root, path);
  }

  return categoryOutcome("agent-integration", [...moved, ...edited]);
};
