// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The purge history: `noskills purge` moves what it removes into an entry
 * under `.eser/.state/purge-history/entry_id/`, and `noskills purge restore`
 * copies it back.
 *
 * An entry holds one folder per category. Each folder keeps the removed paths
 * at the place they had in the project, so `.eser/concerns/open-source.json`
 * is kept as `entry_id/concerns/.eser/concerns/open-source.json`, and restore
 * copies every file under the folder back to that place. The manifest
 * category holds the noskills section of `.eser/manifest.yml` as
 * `manifest/noskills.yml`. An `agent-integration` folder with no files still
 * records that purge took noskills' part out of the files it shares with the
 * user, which restore puts back by running sync.
 *
 * Purge keeps the newest {@link PURGE_HISTORY_LIMIT} entries.
 *
 * @module
 */

import * as yaml from "@eemeli/yaml";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as persistence from "./persistence.ts";

// =============================================================================
// Categories
// =============================================================================

/** A kind of noskills content that purge removes and restore puts back. */
export type PurgeCategory =
  | "concerns"
  | "specs"
  | "rules"
  | "manifest"
  | "agent-integration";

/**
 * Every category, in the order restore puts them back: sync, which restores
 * the agent integration, reads the rules and the manifest restored before it.
 */
export const PURGE_CATEGORIES: readonly PurgeCategory[] = [
  "concerns",
  "specs",
  "rules",
  "manifest",
  "agent-integration",
];

/** True when `name` is a purge category. */
export const isPurgeCategory = (name: string): name is PurgeCategory =>
  (PURGE_CATEGORIES as readonly string[]).includes(name);

/**
 * How many entries the history keeps; purge drops the oldest beyond this.
 * An entry can hold every spec of the project, so the history stays at a few
 * purges instead of growing with each one.
 */
export const PURGE_HISTORY_LIMIT = 5;

/**
 * The files sync writes for the agent tools that only noskills uses, which
 * purge removes whole. The files sync shares with the user (CLAUDE.md,
 * AGENTS.md, the hook settings and the MCP configs) keep the user's content,
 * so purge takes only noskills' part out of them and restore puts that part
 * back by running sync.
 */
export const AGENT_INTEGRATION_FILES: readonly string[] = [
  ".claude/agents/noskills-executor.md",
  ".claude/agents/noskills-verifier.md",
  ".codex/agents/noskills-executor.toml",
  ".codex/agents/noskills-verifier.toml",
  ".cursorrules",
  ".windsurfrules",
  ".github/copilot-instructions.md",
  ".github/agents/noskills-executor.agent.md",
  ".github/agents/noskills-verifier.agent.md",
  ".github/hooks/noskills.json",
  ".kiro/agents/noskills-executor.json",
  ".kiro/agents/noskills-verifier.json",
  ".kiro/hooks/noskills.json",
  ".kiro/steering/conventions.md",
  ".kiro/steering/noskills-coaching.md",
  ".kiro/steering/noskills-protocol.md",
  ".kiro/steering/noskills-rules.md",
  ".opencode/agents/noskills-executor.md",
  ".opencode/agents/noskills-verifier.md",
  ".opencode/plugins/noskills.ts",
];

/**
 * The copies of one noskills spec that sync writes for Kiro (its three spec
 * files) and OpenCode (a skill), which purge removes with the agent
 * integration.
 */
export const specMirrorFiles = (specName: string): readonly string[] => [
  `.kiro/specs/${specName}/requirements.md`,
  `.kiro/specs/${specName}/design.md`,
  `.kiro/specs/${specName}/tasks.md`,
  `.opencode/skills/${specName}.md`,
];

/**
 * The project paths purge moves for each category. The manifest category has
 * none: purge edits `.eser/manifest.yml` and keeps only the noskills section.
 * The agent integration also takes the {@link specMirrorFiles} of each spec.
 */
export const CATEGORY_PATHS: Readonly<
  Record<PurgeCategory, readonly string[]>
> = {
  concerns: [persistence.paths.concernsDir],
  specs: [persistence.paths.specsDir, persistence.paths.progressesDir],
  rules: [persistence.paths.rulesDir],
  manifest: [],
  "agent-integration": AGENT_INTEGRATION_FILES,
};

/** Where an entry keeps the noskills section, relative to the entry. */
const MANIFEST_SECTION_FILE = "manifest/noskills.yml";

/**
 * How purge and restore write `.eser/manifest.yml` and the kept section: the
 * user's `[a, b]` lists stay unpadded and long lines stay unwrapped, so only
 * the noskills section changes.
 */
export const MANIFEST_YAML_OPTIONS: yaml.ToStringOptions = {
  flowCollectionPadding: false,
  lineWidth: 0,
};

// =============================================================================
// Types
// =============================================================================

/** One purge: its id, which is the UTC time of the purge, and what it kept. */
export type HistoryEntry = {
  readonly id: string;
  readonly categories: readonly PurgeCategory[];
};

/** What restoring one category did. */
export type RestoreOutcome =
  | {
    readonly status: "restored";
    /** The project paths written. */
    readonly paths: readonly string[];
    /** Symbolic links in the entry, which restore does not follow or copy. */
    readonly skipped: readonly string[];
  }
  | {
    readonly status: "refused";
    /** The project paths that already exist and would be replaced. */
    readonly conflicts: readonly string[];
  };

/** Options for restoring a category. */
export type RestoreOptions = {
  /** Replace content that already exists in the project. */
  readonly overwrite: boolean;
};

/** A history entry that could not be written, read or restored. */
export class PurgeHistoryError extends Error {
  /** The entry the operation worked on. */
  readonly entryId: string;

  constructor(entryId: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "PurgeHistoryError";
    this.entryId = entryId;
  }
}

/**
 * The message of `error` followed by the messages of its causes, for the
 * purge and restore output: a {@link PurgeHistoryError} names the step and
 * its cause says what the file system refused.
 */
export const describeError = (error: unknown): string => {
  const messages: string[] = [];
  let current: unknown = error;

  // The depth bound stops a cause chain that loops back on itself.
  while (current !== undefined && current !== null && messages.length < 5) {
    messages.push(current instanceof Error ? current.message : String(current));
    current = current instanceof Error ? current.cause : undefined;
  }

  return messages.join(": ");
};

// =============================================================================
// Entry ids (pure)
// =============================================================================

// The UTC time of the purge to the millisecond, then "-2", "-3" and on for
// purges in the same millisecond; the first purge has no suffix.
const ENTRY_ID_PATTERN =
  /^(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)(?:-([2-9]|[1-9]\d+))?$/;

/** True when `name` has the form of an entry id. */
export const isEntryId = (name: string): boolean => ENTRY_ID_PATTERN.test(name);

/**
 * The id of a purge at `now` (milliseconds since the epoch): its UTC time with
 * ":" and "." written as "-", since Windows refuses ":" in file names. When an
 * id in `taken` already has that time, the id gets the first free suffix from
 * "-2" on.
 */
export const entryIdFor = (
  now: number,
  taken: ReadonlySet<string>,
): string => {
  const base = new Date(now).toISOString().replaceAll(":", "-").replace(
    ".",
    "-",
  );
  let id = base;

  for (let suffix = 2; taken.has(id); suffix++) {
    id = `${base}-${suffix}`;
  }

  return id;
};

const entryIdParts = (id: string): readonly [string, number] => {
  const match = ENTRY_ID_PATTERN.exec(id);
  if (match === null) return [id, 0];

  return [match[1]!, Number(match[2] ?? "1")];
};

/** Orders entry ids from the oldest purge to the newest. */
export const compareEntryIds = (a: string, b: string): number => {
  const [timeA, suffixA] = entryIdParts(a);
  const [timeB, suffixB] = entryIdParts(b);

  if (timeA !== timeB) return timeA < timeB ? -1 : 1;

  return suffixA - suffixB;
};

/** The ids to drop, oldest first, so that the newest `limit` remain. */
export const entriesBeyondLimit = (
  ids: readonly string[],
  limit: number,
): readonly string[] => {
  const oldestFirst = [...ids].sort(compareEntryIds);

  return oldestFirst.slice(0, Math.max(0, oldestFirst.length - limit));
};

/** The project-relative folder of an entry. */
export const entryPath = (entryId: string): string =>
  `${persistence.paths.purgeHistoryDir}/${entryId}`;

// =============================================================================
// File system helpers
// =============================================================================

/**
 * True when something is at `path`. A symbolic link counts even when its
 * target is gone, so purge moves it like any other entry.
 */
export const pathExists = async (path: string): Promise<boolean> => {
  try {
    await crossRuntime.runtime.fs.lstat(path);

    return true;
  } catch (error) {
    if (error instanceof crossRuntime.NotFoundError) return false;

    throw error;
  }
};

const listEntryIds = async (root: string): Promise<string[]> => {
  const ids: string[] = [];

  try {
    for await (
      const entry of crossRuntime.runtime.fs.readDir(
        `${root}/${persistence.paths.purgeHistoryDir}`,
      )
    ) {
      if (entry.isDirectory && isEntryId(entry.name)) {
        ids.push(entry.name);
      }
    }
  } catch (error) {
    // No purge has kept anything in this project yet.
    if (error instanceof crossRuntime.NotFoundError) return [];

    throw error;
  }

  return ids;
};

const keptCategories = async (
  root: string,
  entryId: string,
): Promise<readonly PurgeCategory[]> => {
  const dir = `${root}/${entryPath(entryId)}`;
  const kept = await Promise.all(
    PURGE_CATEGORIES.map((category) =>
      pathExists(
        category === "manifest"
          ? `${dir}/${MANIFEST_SECTION_FILE}`
          : `${dir}/${category}`,
      )
    ),
  );

  return PURGE_CATEGORIES.filter((_, index) => kept[index] === true);
};

// =============================================================================
// Listing and pruning
// =============================================================================

/** The entries in the history, newest first, with the categories each kept. */
export const listEntries = async (
  root: string,
): Promise<readonly HistoryEntry[]> => {
  const ids = await listEntryIds(root);
  const entries = await Promise.all(
    ids.map(async (id) => ({
      id,
      categories: await keptCategories(root, id),
    })),
  );

  return entries.sort((a, b) => compareEntryIds(b.id, a.id));
};

/** A free id for a purge at `now`. Nothing is created until purge keeps a path. */
export const newEntryId = async (root: string, now: number): Promise<string> =>
  entryIdFor(now, new Set(await listEntryIds(root)));

/** Removes the oldest entries so that `limit` remain, and returns their ids. */
export const pruneHistory = async (
  root: string,
  limit: number,
): Promise<readonly string[]> => {
  const dropped = entriesBeyondLimit(await listEntryIds(root), limit);

  await Promise.all(
    dropped.map((id) =>
      crossRuntime.runtime.fs.remove(`${root}/${entryPath(id)}`, {
        recursive: true,
      })
    ),
  );

  return dropped;
};

/** Removes one entry and everything it holds. */
export const dropEntry = async (
  root: string,
  entryId: string,
): Promise<void> => {
  await crossRuntime.runtime.fs.remove(`${root}/${entryPath(entryId)}`, {
    recursive: true,
  });
};

// =============================================================================
// Keeping (purge)
// =============================================================================

/**
 * Moves the project path `path` into the entry, under `category`. The entry
 * is inside the project's `.eser/`, so the rename stays on one file system and
 * copies nothing.
 */
export const keepPath = async (
  root: string,
  entryId: string,
  category: PurgeCategory,
  path: string,
): Promise<void> => {
  const destination = `${root}/${entryPath(entryId)}/${category}/${path}`;

  try {
    await crossRuntime.runtime.fs.mkdir(
      crossRuntime.runtime.path.dirname(destination),
      { recursive: true },
    );
    await crossRuntime.runtime.fs.rename(`${root}/${path}`, destination);
  } catch (error) {
    throw new PurgeHistoryError(
      entryId,
      `keep ${path} in purge history entry ${entryId}`,
      { cause: error },
    );
  }
};

/**
 * Creates the category's folder in the entry, so the entry lists the
 * category even when purge edited files instead of moving them.
 */
export const markCategory = async (
  root: string,
  entryId: string,
  category: PurgeCategory,
): Promise<void> => {
  try {
    await crossRuntime.runtime.fs.mkdir(
      `${root}/${entryPath(entryId)}/${category}`,
      { recursive: true },
    );
  } catch (error) {
    throw new PurgeHistoryError(
      entryId,
      `record ${category} in purge history entry ${entryId}`,
      { cause: error },
    );
  }
};

/**
 * Writes the noskills section of the manifest (a YAML node, comments
 * included) into the entry.
 */
export const keepManifestSection = async (
  root: string,
  entryId: string,
  section: unknown,
): Promise<void> => {
  const file = `${root}/${entryPath(entryId)}/${MANIFEST_SECTION_FILE}`;

  try {
    await crossRuntime.runtime.fs.mkdir(
      crossRuntime.runtime.path.dirname(file),
      { recursive: true },
    );
    await crossRuntime.runtime.fs.writeTextFile(
      file,
      new yaml.Document({ noskills: section }).toString(
        MANIFEST_YAML_OPTIONS,
      ),
    );
  } catch (error) {
    throw new PurgeHistoryError(
      entryId,
      `keep the noskills section of ${persistence.paths.manifestFile} in purge history entry ${entryId}`,
      { cause: error },
    );
  }
};

// =============================================================================
// Restoring
// =============================================================================

type StoredFiles = {
  readonly files: readonly string[];
  /** Folders, so restore brings back the empty ones too. */
  readonly dirs: readonly string[];
  readonly links: readonly string[];
};

const NO_FILES: StoredFiles = { files: [], dirs: [], links: [] };

/**
 * The project paths of the files and folders an entry keeps under a category
 * folder, and of the symbolic links there, which restore does not copy. The
 * walk also finds the files whose names come from the specs, such as the Kiro
 * copies.
 */
const storedFiles = async (categoryDir: string): Promise<StoredFiles> => {
  // The entry has no folder for a category it did not keep.
  if (!(await pathExists(categoryDir))) return NO_FILES;

  const files: string[] = [];
  const dirs: string[] = [];
  const links: string[] = [];

  for await (const entry of crossRuntime.runtime.fs.walk(categoryDir)) {
    // Project paths use "/" on every platform.
    const path = crossRuntime.runtime.path.relative(categoryDir, entry.path)
      .replaceAll("\\", "/");
    const kind = entry.isSymlink
      ? links
      : entry.isDirectory
      ? dirs
      : entry.isFile
      ? files
      : links;
    kind.push(path);
  }

  return { files: files.sort(), dirs: dirs.sort(), links: links.sort() };
};

/**
 * Copies the files an entry keeps for a category that purge moved (concerns,
 * specs, rules or the agent integration files) back into the project. When
 * any of them exists in the project and `options.overwrite` is false, nothing
 * is written and the outcome lists those paths. The entry stays as it is.
 */
export const restorePaths = async (
  root: string,
  entryId: string,
  category: Exclude<PurgeCategory, "manifest">,
  options: RestoreOptions,
): Promise<RestoreOutcome> => {
  const categoryDir = `${root}/${entryPath(entryId)}/${category}`;

  try {
    const { files, dirs, links: skipped } = await storedFiles(categoryDir);

    const conflicts: string[] = [];
    if (!options.overwrite) {
      for (const path of files) {
        // One file at a time: a specs folder can hold hundreds of files, and
        // this keeps the open file handles to one.
        // deno-lint-ignore no-await-in-loop
        if (await pathExists(`${root}/${path}`)) {
          conflicts.push(path);
        }
      }
    }

    if (conflicts.length > 0) {
      return { status: "refused", conflicts };
    }

    for (const path of files) {
      const target = `${root}/${path}`;
      // One file at a time, for the reason above.
      // deno-lint-ignore no-await-in-loop
      await crossRuntime.runtime.fs.mkdir(
        crossRuntime.runtime.path.dirname(target),
        { recursive: true },
      );
      // deno-lint-ignore no-await-in-loop
      await crossRuntime.runtime.fs.copyFile(`${categoryDir}/${path}`, target);
    }

    // Folders that held no files, such as the concerns folder `noskills init`
    // creates before any concern is chosen. Parents come before children in
    // sorted order, and recursive mkdir accepts a folder that exists.
    for (const path of dirs) {
      // One folder at a time, for the reason above.
      // deno-lint-ignore no-await-in-loop
      await crossRuntime.runtime.fs.mkdir(`${root}/${path}`, {
        recursive: true,
      });
    }

    return { status: "restored", paths: files, skipped };
  } catch (error) {
    throw new PurgeHistoryError(
      entryId,
      `restore ${category} from purge history entry ${entryId}`,
      { cause: error },
    );
  }
};

/**
 * Puts the noskills section an entry keeps back into `.eser/manifest.yml`,
 * creating the file when the project has none. When the manifest already has
 * a noskills section and `options.overwrite` is false, nothing is written.
 */
export const restoreManifestSection = async (
  root: string,
  entryId: string,
  options: RestoreOptions,
): Promise<RestoreOutcome> => {
  const manifestFile = persistence.paths.manifestFile;
  const failure = (message: string, cause?: unknown): PurgeHistoryError =>
    new PurgeHistoryError(
      entryId,
      `restore manifest from purge history entry ${entryId}: ${message}`,
      cause === undefined ? undefined : { cause },
    );

  let stored: yaml.Document;
  try {
    stored = yaml.parseDocument(
      await crossRuntime.runtime.fs.readTextFile(
        `${root}/${entryPath(entryId)}/${MANIFEST_SECTION_FILE}`,
      ),
    );
  } catch (error) {
    throw failure(`read ${MANIFEST_SECTION_FILE}`, error);
  }

  const section = stored.get("noskills", true);
  if (stored.errors.length > 0 || !yaml.isMap(section)) {
    throw failure(
      `${MANIFEST_SECTION_FILE} holds no noskills mapping; run noskills init to write a new section`,
    );
  }

  let manifest: yaml.Document;
  try {
    manifest = yaml.parseDocument(
      await crossRuntime.runtime.fs.readTextFile(`${root}/${manifestFile}`),
    );
  } catch (error) {
    if (!(error instanceof crossRuntime.NotFoundError)) {
      throw failure(`read ${manifestFile}`, error);
    }
    manifest = new yaml.Document({});
  }

  if (
    manifest.errors.length > 0 ||
    (manifest.contents !== null && !yaml.isMap(manifest.contents))
  ) {
    throw failure(
      `${manifestFile} is not a YAML mapping; fix it, then run restore again`,
    );
  }

  if (manifest.has("noskills") && !options.overwrite) {
    return {
      status: "refused",
      conflicts: [`${manifestFile} (noskills section)`],
    };
  }

  // Purge leaves `{}` when the section was the only key; written as a block
  // map again, the restored section keeps the layout it had.
  if (yaml.isMap(manifest.contents) && manifest.contents.items.length === 0) {
    manifest.contents.flow = false;
  }
  manifest.set("noskills", section);

  try {
    await crossRuntime.runtime.fs.mkdir(
      `${root}/${persistence.paths.eserDir}`,
      {
        recursive: true,
      },
    );
    await crossRuntime.runtime.fs.writeTextFile(
      `${root}/${manifestFile}`,
      manifest.toString(MANIFEST_YAML_OPTIONS),
    );
  } catch (error) {
    throw failure(`write ${manifestFile}`, error);
  }

  return { status: "restored", paths: [manifestFile], skipped: [] };
};
