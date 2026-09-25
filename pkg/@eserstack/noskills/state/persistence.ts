// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * State persistence — read/write runtime state under `.eser/.state/` and
 * noskills config inside `.eser/manifest.yml` (comment-preserving YAML).
 *
 * Runtime state lives under a single umbrella with three siblings:
 *   - `.eser/.state/progresses/` — workflow state machine (state.json,
 *     per-spec state, iterations, logs, flags)
 *   - `.eser/.state/sessions/`   — ephemeral runtime session bindings
 *   - `.eser/.state/events/`     — append-only JSONL audit trail
 *
 * @module
 */

import * as yaml from "yaml";
import * as schema from "./schema.ts";
import { NotFoundError, runtime } from "@eserstack/standards/cross-runtime";

// =============================================================================
// Atomic writes
// =============================================================================

/**
 * Distinguishes "there is no file" from "the file is unreadable or corrupt".
 *
 * The cross-runtime fs port already normalises the per-runtime variants into
 * `NotFoundError`, so the class check is the reliable one. Deno's raw
 * `NotFound` name and the Node `ENOENT` code are kept as a fallback for any
 * error that reaches here without passing through the port.
 */
const isNotFoundError = (error: unknown): boolean => {
  if (error instanceof NotFoundError) {
    return true;
  }

  if (error === null || typeof error !== "object") {
    return false;
  }

  const candidate = error as { name?: unknown; code?: unknown };

  return candidate.name === "NotFound" || candidate.code === "ENOENT";
};

/** Corrupt-state warnings are latched per path: one per file, not per read. */
const warnedCorruptPaths = new Set<string>();

/**
 * Reports a state file that exists but could not be parsed.
 *
 * Absent and corrupt were previously indistinguishable: every reader caught
 * everything and returned `createInitialState()`, so a truncated file presented
 * as a brand-new project and the work it held was gone without a word. The
 * return value stays the initial state — callers depend on these reads not
 * throwing — but the operator now learns the file is there and unreadable,
 * which is the difference between "nothing to restore" and "restore this".
 */
const warnCorruptState = (filePath: string, error: unknown): void => {
  if (warnedCorruptPaths.has(filePath)) {
    return;
  }

  warnedCorruptPaths.add(filePath);

  const reason = error instanceof Error ? error.message : String(error);

  try {
    // deno-lint-ignore no-console
    console.error(
      `noskills: WARNING — ${filePath} exists but could not be read (${reason}). ` +
        "Treating it as empty; the previous contents are still on disk and " +
        "have NOT been overwritten yet.",
    );
  } catch {
    // stderr is gone; nothing further to try.
  }
};

/**
 * Writes `contents` to `filePath` via a temporary file in the same directory,
 * then renames it into place.
 *
 * Every writer here used to be a plain `writeTextFile`, which truncates first
 * and then writes: a crash, a full disk or a killed process between those two
 * steps leaves a truncated file. Since every reader treats a parse failure as
 * "no state" and returns `createInitialState()`, a torn file did not surface as
 * corruption — it presented as a fresh project, and the work in it was gone.
 *
 * Rename is only atomic within a filesystem, so the temporary file must be a
 * sibling of the target rather than in a system temp directory.
 */
const writeTextFileAtomic = async (
  filePath: string,
  contents: string,
): Promise<void> => {
  const separator = filePath.lastIndexOf("/");
  const dirPath = separator === -1 ? "." : filePath.slice(0, separator);
  const tempPath = `${dirPath}/.${
    filePath.slice(separator + 1)
  }.${crypto.randomUUID()}.tmp`;

  try {
    await runtime.fs.writeTextFile(tempPath, contents);
    await runtime.fs.rename(tempPath, filePath);
  } catch (error) {
    // Never leave the temporary behind: these live beside real state files and
    // a stray one would be picked up by directory listings.
    try {
      await runtime.fs.remove(tempPath);
    } catch {
      // Already gone, or never created.
    }

    throw error;
  }
};

// =============================================================================
// Paths
// =============================================================================

const ESER_DIR: string = ".eser";
const STATE_DIR: string = `${ESER_DIR}/.state`;
const PROGRESSES_DIR: string = `${STATE_DIR}/progresses`;
const STATE_FILE: string = `${PROGRESSES_DIR}/state.json`;
const ASK_TOKEN_FILE: string = `${PROGRESSES_DIR}/ask-token.json`;
const MANIFEST_FILE: string = `${ESER_DIR}/manifest.yml`;
const CONCERNS_DIR: string = `${ESER_DIR}/concerns`;
const RULES_DIR: string = `${ESER_DIR}/rules`;
const SPECS_DIR: string = `${ESER_DIR}/specs`;
const WORKFLOWS_DIR: string = `${ESER_DIR}/workflows`;

const SPEC_STATES_DIR: string = `${PROGRESSES_DIR}/specs`;
const ACTIVE_FILE: string = `${PROGRESSES_DIR}/active.json`;
const SESSIONS_DIR: string = `${STATE_DIR}/sessions`;
const EVENTS_DIR: string = `${STATE_DIR}/events`;
const EVENTS_FILE: string = `${EVENTS_DIR}/events.jsonl`;
const LEDGER_DIR: string = `${PROGRESSES_DIR}/ledger`;

export const paths: {
  readonly eserDir: string;
  readonly stateDir: string;
  readonly progressesDir: string;
  readonly stateFile: string;
  readonly askTokenFile: string;
  readonly manifestFile: string;
  readonly concernsDir: string;
  readonly rulesDir: string;
  readonly specsDir: string;
  readonly workflowsDir: string;
  readonly specStatesDir: string;
  readonly activeFile: string;
  readonly specDir: (specName: string) => string;
  readonly specFile: (specName: string) => string;
  readonly specStateFile: (specName: string) => string;
  readonly concernFile: (concernId: string) => string;
  readonly sessionsDir: string;
  readonly sessionFile: (sessionId: string) => string;
  readonly eventsDir: string;
  readonly eventsFile: string;
  readonly ledgerDir: string;
  readonly ledgerRunDir: (spec: string) => string;
  readonly ledgerFile: (spec: string) => string;
  readonly ledgerSummaryFile: (spec: string) => string;
  readonly eserGitignore: string;
} = {
  eserDir: ESER_DIR,
  stateDir: STATE_DIR,
  progressesDir: PROGRESSES_DIR,
  stateFile: STATE_FILE,
  askTokenFile: ASK_TOKEN_FILE,
  manifestFile: MANIFEST_FILE,
  concernsDir: CONCERNS_DIR,
  rulesDir: RULES_DIR,
  specsDir: SPECS_DIR,
  workflowsDir: WORKFLOWS_DIR,
  specStatesDir: SPEC_STATES_DIR,
  activeFile: ACTIVE_FILE,

  specDir: (specName: string): string => `${SPECS_DIR}/${specName}`,
  specFile: (specName: string): string => `${SPECS_DIR}/${specName}/spec.md`,
  specStateFile: (specName: string): string =>
    `${SPEC_STATES_DIR}/${specName}.json`,
  concernFile: (concernId: string): string =>
    `${CONCERNS_DIR}/${concernId}.json`,
  sessionsDir: SESSIONS_DIR,
  sessionFile: (sessionId: string): string =>
    `${SESSIONS_DIR}/${sessionId}.json`,
  eventsDir: EVENTS_DIR,
  eventsFile: EVENTS_FILE,
  ledgerDir: LEDGER_DIR,
  ledgerRunDir: (spec: string): string => `${LEDGER_DIR}/${spec}`,
  ledgerFile: (spec: string): string => `${LEDGER_DIR}/${spec}/ledger.jsonl`,
  ledgerSummaryFile: (spec: string): string =>
    `${LEDGER_DIR}/${spec}/summary.json`,
  eserGitignore: `${ESER_DIR}/.gitignore`,
};

// =============================================================================
// State File
// =============================================================================

export const readState = async (root: string): Promise<schema.StateFile> => {
  // Transparently migrate pre-umbrella layouts on the first state-touching
  // call. Fast no-op path when no legacy markers exist.
  await migrateLegacyLayout(root);

  const filePath = `${root}/${STATE_FILE}`;

  try {
    const content = await runtime.fs.readTextFile(filePath);
    const parsed = JSON.parse(content) as schema.StateFile;

    return normalizeStateShape(parsed);
  } catch (error) {
    // Absent is ordinary: an uninitialised project has no state file. A file
    // that exists and will not parse is not ordinary, and used to look
    // identical from here.
    if (!isNotFoundError(error)) {
      warnCorruptState(filePath, error);
    }

    return schema.createInitialState();
  }
};

/**
 * Backward-compat normalization for state files written by older versions.
 * Currently handles:
 *   - `discovery.userContext`: legacy `string` → new `readonly string[]`
 *     (null/undefined are preserved as undefined; arrays pass through).
 */
const normalizeStateShape = (state: schema.StateFile): schema.StateFile => {
  const discovery = state.discovery as Record<string, unknown> | undefined;
  if (discovery === undefined || discovery === null) {
    return state;
  }

  const rawUserContext = discovery["userContext"];
  let normalizedUserContext: readonly string[] | undefined;

  if (typeof rawUserContext === "string") {
    normalizedUserContext = rawUserContext.length > 0 ? [rawUserContext] : [];
  } else if (Array.isArray(rawUserContext)) {
    normalizedUserContext = rawUserContext as readonly string[];
  } else {
    // null, undefined, or any unexpected shape → undefined
    normalizedUserContext = undefined;
  }

  // Only rewrite when we actually changed something or the field was set.
  if (rawUserContext === normalizedUserContext) {
    return state;
  }

  const nextDiscovery: Record<string, unknown> = { ...discovery };
  if (normalizedUserContext === undefined) {
    delete nextDiscovery["userContext"];
  } else {
    nextDiscovery["userContext"] = normalizedUserContext;
  }

  return {
    ...state,
    discovery: nextDiscovery as unknown as schema.DiscoveryState,
  };
};

/**
 * Resolve state for a specific spec, or the active state if no spec given.
 * Used by commands that support --spec flag.
 */
export const resolveState = async (
  root: string,
  specName?: string | null,
): Promise<schema.StateFile> => {
  if (specName === null || specName === undefined) {
    return readState(root);
  }

  // Check if spec exists
  const specDir = `${root}/${paths.specDir(specName)}`;
  try {
    await runtime.fs.stat(specDir);
  } catch {
    throw new Error(
      `Spec '${specName}' not found. Run \`noskills spec list\` to see available specs.`,
    );
  }

  // Try per-spec state first, fall back to active state if matching
  const specState = await readSpecState(root, specName);
  if (specState.spec === specName) {
    return specState;
  }

  // Check if active state matches
  const activeState = await readState(root);
  if (activeState.spec === specName) {
    return activeState;
  }

  // Return the per-spec state even if spec field is null (freshly created)
  return { ...specState, spec: specName };
};

/**
 * Check if old --spec= format was used (for deprecation warnings).
 */
export const usesOldSpecFlag = (
  args?: readonly string[],
): boolean => {
  if (args === undefined) return false;
  return args.some((a) => a.startsWith("--spec="));
};

/**
 * Parse spec name from args. Supports:
 * - New positional format (spec name passed directly by spec.ts dispatcher)
 * - Old --spec=<name> format (backward compat with deprecation warning)
 */
export const parseSpecFlag = (
  args?: readonly string[],
): string | null => {
  if (args === undefined) return null;
  for (const arg of args) {
    if (arg.startsWith("--spec=")) {
      // Backward compat — still works but deprecated
      return arg.slice("--spec=".length);
    }
  }
  return null;
};

/**
 * Require spec name on spec-specific commands.
 * Returns the spec name if present, or an error message string if missing.
 */
export const requireSpecFlag = (
  args?: readonly string[],
): { ok: true; spec: string } | { ok: false; error: string } => {
  const spec = parseSpecFlag(args);
  if (spec === null || spec.length === 0) {
    return {
      ok: false,
      error:
        "Error: spec name is required. Use `noskills spec <name> <command>` format.",
    };
  }
  return { ok: true, spec };
};

export const writeState = async (
  root: string,
  state: schema.StateFile,
): Promise<void> => {
  const dirPath = `${root}/${PROGRESSES_DIR}`;
  const filePath = `${root}/${STATE_FILE}`;

  await runtime.fs.mkdir(dirPath, { recursive: true });
  await writeTextFileAtomic(filePath, JSON.stringify(state, null, 2) + "\n");
};

// =============================================================================
// Active Spec
// =============================================================================

export type ActiveSpecIndex = {
  readonly activeSpec: string | null;
};

/** Read active spec name from state.json's "spec" field. */
export const readActiveSpec = async (
  root: string,
): Promise<string | null> => {
  const state = await readState(root);

  return state.spec;
};

/**
 * Set active spec by loading per-spec state into main state.json.
 * @deprecated Use writeState directly. Kept for backward compatibility.
 */
export const writeActiveSpec = async (
  _root: string,
  _specName: string | null,
): Promise<void> => {
  // No-op: active spec is determined by state.json's "spec" field.
  // The spec switch command handles loading per-spec state directly.
};

// =============================================================================
// Per-Spec State Files (.eser/.state/progresses/specs/<name>.json)
// =============================================================================

export const readSpecState = async (
  root: string,
  specName: string,
): Promise<schema.StateFile> => {
  const filePath = `${root}/${paths.specStateFile(specName)}`;

  try {
    const content = await runtime.fs.readTextFile(filePath);
    const parsed = JSON.parse(content) as schema.StateFile;

    return normalizeStateShape(parsed);
  } catch (error) {
    // Absent is ordinary: an uninitialised project has no state file. A file
    // that exists and will not parse is not ordinary, and used to look
    // identical from here.
    if (!isNotFoundError(error)) {
      warnCorruptState(filePath, error);
    }

    return schema.createInitialState();
  }
};

export const writeSpecState = async (
  root: string,
  specName: string,
  state: schema.StateFile,
): Promise<void> => {
  const dirPath = `${root}/${SPEC_STATES_DIR}`;
  const filePath = `${root}/${paths.specStateFile(specName)}`;

  // Snapshot the prior on-disk state before overwriting, for decision capture.
  // readSpecState never throws (returns the initial state on miss/parse error).
  let prev: schema.StateFile;
  try {
    prev = await readSpecState(root, specName);
  } catch {
    prev = schema.createInitialState();
  }

  await runtime.fs.mkdir(dirPath, { recursive: true });
  await writeTextFileAtomic(filePath, JSON.stringify(state, null, 2) + "\n");

  // Additive, fault-isolated decision-ledger capture. Runs AFTER the canonical
  // write so it can never prevent or corrupt state persistence; any failure is
  // swallowed and never surfaced to the run. The dynamic import keeps the ledger
  // module out of the static graph, so it cannot introduce an import cycle.
  try {
    const ledger = await import("./decision-ledger.ts");
    await ledger.captureTransition(root, prev, state);
  } catch {
    // best effort — capture must never break the run
  }
};

/** List all spec names that have state files. */
export const listSpecStates = async (
  root: string,
): Promise<readonly { name: string; state: schema.StateFile }[]> => {
  const dirPath = `${root}/${SPEC_STATES_DIR}`;
  const results: { name: string; state: schema.StateFile }[] = [];

  try {
    for await (const entry of runtime.fs.readDir(dirPath)) {
      if (!entry.isFile || !entry.name.endsWith(".json")) {
        continue;
      }

      const filePath = `${dirPath}/${entry.name}`;

      // Per file, not per directory. The try used to wrap the whole loop, so a
      // single unreadable spec state aborted the walk and returned the specs
      // enumerated before it -- a silently truncated list, with the remaining
      // specs looking as though they did not exist.
      try {
        const content = await runtime.fs.readTextFile(filePath);

        results.push({
          name: entry.name.replace(/\.json$/, ""),
          state: JSON.parse(content) as schema.StateFile,
        });
      } catch (error) {
        warnCorruptState(filePath, error);
      }
    }
  } catch {
    // The directory itself is absent: no specs have been created yet.
  }

  return results;
};

// =============================================================================
// Config (noskills section inside .eser/manifest.yml)
// =============================================================================

export const readManifest = async (
  root: string,
): Promise<schema.NosManifest | null> => {
  const filePath = `${root}/${MANIFEST_FILE}`;

  try {
    const content = await runtime.fs.readTextFile(filePath);
    const parsed = yaml.parse(content) as Record<string, unknown>;

    if (parsed?.["noskills"] === undefined) {
      return null;
    }

    return parsed["noskills"] as schema.NosManifest;
  } catch {
    return null;
  }
};

export const writeManifest = async (
  root: string,
  config: schema.NosManifest,
): Promise<void> => {
  const filePath = `${root}/${MANIFEST_FILE}`;

  // Comment-preserving: parse existing document, update only the noskills key
  let doc: yaml.Document;

  try {
    const content = await runtime.fs.readTextFile(filePath);
    doc = yaml.parseDocument(content);
  } catch {
    doc = new yaml.Document({});
  }

  const node = doc.createNode(config);
  node.commentBefore =
    " noskills orchestrator — inline comments in this section won't be preserved on next write";
  doc.set("noskills", node);
  await writeTextFileAtomic(filePath, doc.toString());
};

// =============================================================================
// Concern Files
// =============================================================================

export const readConcern = async (
  root: string,
  concernId: string,
): Promise<schema.ConcernDefinition | null> => {
  const filePath = `${root}/${paths.concernFile(concernId)}`;

  try {
    const content = await runtime.fs.readTextFile(filePath);

    return JSON.parse(content) as schema.ConcernDefinition;
  } catch {
    return null;
  }
};

export const writeConcern = async (
  root: string,
  concern: schema.ConcernDefinition,
): Promise<void> => {
  const dirPath = `${root}/${CONCERNS_DIR}`;
  const filePath = `${root}/${paths.concernFile(concern.id)}`;

  await runtime.fs.mkdir(dirPath, { recursive: true });
  await writeTextFileAtomic(filePath, JSON.stringify(concern, null, 2) + "\n");
};

export const listConcerns = async (
  root: string,
): Promise<readonly schema.ConcernDefinition[]> => {
  const dirPath = `${root}/${CONCERNS_DIR}`;
  const concerns: schema.ConcernDefinition[] = [];

  try {
    for await (const entry of runtime.fs.readDir(dirPath)) {
      if (!entry.isFile || !entry.name.endsWith(".json")) {
        continue;
      }

      const filePath = `${dirPath}/${entry.name}`;

      // Per file, not per directory -- see listSpecStates. One malformed
      // concern used to hide every concern after it.
      try {
        const content = await runtime.fs.readTextFile(filePath);

        concerns.push(JSON.parse(content) as schema.ConcernDefinition);
      } catch (error) {
        warnCorruptState(filePath, error);
      }
    }
  } catch {
    // The directory itself is absent: no concerns have been defined yet.
  }

  return concerns;
};

// =============================================================================
// Legacy Layout Migration
// =============================================================================

/**
 * One-shot migration from the pre-umbrella layout to the unified
 * `.eser/.state/{progresses,sessions,events}/` layout.
 *
 * Detects legacy by statting `.eser/.state/state.json`: in the new layout this
 * path is never a file (the file moved to `.eser/.state/progresses/state.json`),
 * so a file here is an unambiguous legacy marker.
 *
 * Migration is idempotent — a fast-path stat rules out the no-op case without
 * touching the filesystem further. The progresses move uses a two-phase rename
 * via a sibling temp dir so an interrupted migration leaves a recoverable
 * state rather than a half-moved directory.
 *
 * Returns true if migration ran, false if nothing to do.
 */
export const migrateLegacyLayout = async (root: string): Promise<boolean> => {
  const legacyStateMarker = `${root}/${STATE_DIR}/state.json`;
  const legacySessionsDir = `${root}/${ESER_DIR}/.sessions`;
  const legacyEventsDir = `${root}/${ESER_DIR}/.events`;

  const hasLegacyState = await isFile(legacyStateMarker);
  const hasLegacySessions = await isDir(legacySessionsDir);
  const hasLegacyEvents = await isDir(legacyEventsDir);

  if (!hasLegacyState && !hasLegacySessions && !hasLegacyEvents) {
    return false;
  }

  // Abort on partial migration: new progresses/ already exists alongside
  // legacy state.json — don't auto-merge, surface the conflict.
  if (hasLegacyState) {
    const newProgressesDir = `${root}/${PROGRESSES_DIR}`;
    if (await isDir(newProgressesDir)) {
      throw new Error(
        `noskills: partial migration detected — both ${legacyStateMarker} ` +
          `(file) and ${newProgressesDir} (dir) exist. Resolve manually ` +
          `before continuing.`,
      );
    }
  }

  const stateDirPath = `${root}/${STATE_DIR}`;
  const tempProgressesPath = `${stateDirPath}/.progresses-tmp`;
  const finalProgressesPath = `${root}/${PROGRESSES_DIR}`;

  // Move legacy state sub-entries into progresses via two-phase rename.
  if (hasLegacyState) {
    await runtime.fs.mkdir(tempProgressesPath, { recursive: true });

    for await (const entry of runtime.fs.readDir(stateDirPath)) {
      // Skip the temp dir itself and any new-layout siblings that may already
      // exist (they are created separately below or by scaffoldEserDir).
      if (
        entry.name === ".progresses-tmp" ||
        entry.name === "progresses" ||
        entry.name === "sessions" ||
        entry.name === "events"
      ) {
        continue;
      }
      await runtime.fs.rename(
        `${stateDirPath}/${entry.name}`,
        `${tempProgressesPath}/${entry.name}`,
      );
    }

    await runtime.fs.rename(tempProgressesPath, finalProgressesPath);
  }

  // Move flat-layout siblings into the umbrella.
  if (hasLegacySessions) {
    await runtime.fs.mkdir(stateDirPath, { recursive: true });
    await runtime.fs.rename(legacySessionsDir, `${root}/${SESSIONS_DIR}`);
  }
  if (hasLegacyEvents) {
    await runtime.fs.mkdir(stateDirPath, { recursive: true });
    await runtime.fs.rename(legacyEventsDir, `${root}/${EVENTS_DIR}`);
  }

  // Rewrite .gitignore if it still carries the legacy three-entry form.
  const gitignorePath = `${root}/${paths.eserGitignore}`;
  try {
    const current = await runtime.fs.readTextFile(gitignorePath);
    if (current.includes(".sessions/") || current.includes(".events/")) {
      await writeTextFileAtomic(
        gitignorePath,
        "# eser toolchain runtime state — not tracked by git\n.state/\n",
      );
    }
  } catch {
    // no gitignore yet — scaffoldEserDir will create it
  }

  // One-time notice to stderr so JSON stdout remains clean.
  console.error(
    "noskills: migrated .eser/ runtime layout to .eser/.state/{progresses,sessions,events}/",
  );

  return true;
};

const isFile = async (path: string): Promise<boolean> => {
  try {
    const info = await runtime.fs.stat(path);
    return info.isFile === true;
  } catch {
    return false;
  }
};

const isDir = async (path: string): Promise<boolean> => {
  try {
    const info = await runtime.fs.stat(path);
    return info.isDirectory === true;
  } catch {
    return false;
  }
};

// =============================================================================
// Directory Scaffolding
// =============================================================================

export const scaffoldEserDir = async (root: string): Promise<void> => {
  // Migrate any legacy layout before creating the new one, so the scaffold
  // pass doesn't trip over stale siblings.
  await migrateLegacyLayout(root);

  const dirs = [
    ESER_DIR,
    STATE_DIR,
    PROGRESSES_DIR,
    SPEC_STATES_DIR,
    SESSIONS_DIR,
    EVENTS_DIR,
    CONCERNS_DIR,
    RULES_DIR,
    SPECS_DIR,
    WORKFLOWS_DIR,
  ];

  for (const dir of dirs) {
    await runtime.fs.mkdir(`${root}/${dir}`, {
      recursive: true,
    });
  }

  // .gitignore at .eser/ level — only create if missing
  const gitignorePath = `${root}/${paths.eserGitignore}`;

  try {
    await runtime.fs.stat(gitignorePath);
  } catch {
    await writeTextFileAtomic(
      gitignorePath,
      "# eser toolchain runtime state — not tracked by git\n.state/\n",
    );
  }
};

// =============================================================================
// State + Spec State (write both atomically)
// =============================================================================

/** Write main state AND the per-spec state file for the active spec. */
/**
 * Writes one state to both the global store and its per-spec file.
 *
 * Only for call sites that persist the SAME state to both. Several deliberately
 * do not, and routing them through here would be a bug rather than a cleanup:
 *
 *   - `done`, `wontfix`, `cancel` and the dashboard's complete action keep a
 *     terminal phase (COMPLETED / WONTFIX) in the per-spec file for history
 *     while returning the global store to IDLE. Writing one state to both would
 *     erase the record or leave the global store stuck in a terminal phase.
 *   - `reset` captures the spec name BEFORE `resetToIdle` clears it. This helper
 *     keys off `state.spec`, which is null by then, so it would silently skip
 *     the per-spec write and leave that file stale.
 *
 * The two writes are sequential, not transactional: a crash between them leaves
 * the per-spec file behind the global store. Each individual write is atomic
 * (see writeTextFileAtomic), so neither file can be torn, but they can disagree.
 * `resolveState` prefers the per-spec copy, which is the conservative side of
 * that race.
 */
export const writeStateAndSpec = async (
  root: string,
  state: schema.StateFile,
): Promise<void> => {
  await writeState(root, state);

  if (state.spec !== null) {
    await writeSpecState(root, state.spec, state);
  }
};

// =============================================================================
// Existence Checks
// =============================================================================

// =============================================================================
// Sessions
// =============================================================================

export type Session = {
  readonly id: string;
  readonly spec: string | null;
  readonly mode: "spec" | "free";
  readonly phase: string | null;
  readonly pid: number;
  readonly startedAt: string;
  readonly lastActiveAt: string;
  readonly tool: string;
  readonly projectRoot?: string;
};

const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

// Session ids become file names under SESSIONS_DIR. generateSessionId makes
// 8 hex chars; the allowed set is wider only so hand-picked ids keep working,
// and it excludes '.', '/' and '\' so no id can leave the directory.
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Reports whether an id is safe to use as a session file name. */
export const isValidSessionId = (sessionId: string): boolean =>
  SESSION_ID_PATTERN.test(sessionId);

const sessionPath = (root: string, sessionId: string): string => {
  if (!isValidSessionId(sessionId)) {
    throw new Error(`Invalid session id: ${JSON.stringify(sessionId)}`);
  }
  return `${root}/${SESSIONS_DIR}/${sessionId}.json`;
};

export const createSession = async (
  root: string,
  session: Session,
): Promise<void> => {
  const path = sessionPath(root, session.id);
  await runtime.fs.mkdir(`${root}/${SESSIONS_DIR}`, { recursive: true });
  await writeTextFileAtomic(
    path,
    JSON.stringify(session, null, 2) + "\n",
  );
};

export const readSession = async (
  root: string,
  sessionId: string,
): Promise<Session | null> => {
  if (!isValidSessionId(sessionId)) return null;
  try {
    const content = await runtime.fs.readTextFile(
      sessionPath(root, sessionId),
    );
    const session = JSON.parse(content) as Session;
    return session.id === sessionId ? session : null;
  } catch {
    return null;
  }
};

export const listSessions = async (
  root: string,
): Promise<readonly Session[]> => {
  const dir = `${root}/${SESSIONS_DIR}`;
  const sessions: Session[] = [];

  try {
    for await (const entry of runtime.fs.readDir(dir)) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        // The file name is the identity; a file whose embedded id disagrees
        // (or is not a valid id) is ignored rather than trusted.
        const fileId = entry.name.slice(0, -".json".length);
        if (!isValidSessionId(fileId)) continue;
        try {
          const content = await runtime.fs.readTextFile(
            `${dir}/${entry.name}`,
          );
          const session = JSON.parse(content) as Session;
          if (session.id !== fileId) continue;
          sessions.push(session);
        } catch {
          // corrupt file, skip
        }
      }
    }
  } catch {
    // no sessions dir
  }

  return sessions;
};

export const deleteSession = async (
  root: string,
  sessionId: string,
): Promise<boolean> => {
  if (!isValidSessionId(sessionId)) return false;
  try {
    await runtime.fs.remove(sessionPath(root, sessionId));
    return true;
  } catch {
    return false;
  }
};

export const updateSessionPhase = async (
  root: string,
  sessionId: string,
  phase: string,
): Promise<void> => {
  const session = await readSession(root, sessionId);
  if (session === null) return;

  const updated: Session = {
    ...session,
    phase,
    lastActiveAt: new Date().toISOString(),
  };
  await writeTextFileAtomic(
    sessionPath(root, sessionId),
    JSON.stringify(updated, null, 2) + "\n",
  );
};

export const gcStaleSessions = async (
  root: string,
): Promise<readonly string[]> => {
  const sessions = await listSessions(root);
  const now = Date.now();
  const removed: string[] = [];

  for (const s of sessions) {
    const elapsed = now - new Date(s.lastActiveAt).getTime();
    if (elapsed > STALE_THRESHOLD_MS) {
      await deleteSession(root, s.id);
      removed.push(s.id);
    }
  }

  return removed;
};

export const isSessionStale = (session: Session): boolean => {
  const elapsed = Date.now() - new Date(session.lastActiveAt).getTime();
  return elapsed > STALE_THRESHOLD_MS;
};

export const generateSessionId = (): string => {
  // 8-char random hex
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
};

export const isInitialized = async (root: string): Promise<boolean> => {
  try {
    const content = await runtime.fs.readTextFile(
      `${root}/${MANIFEST_FILE}`,
    );
    const parsed = yaml.parse(content) as Record<string, unknown>;

    return parsed?.["noskills"] !== undefined;
  } catch {
    return false;
  }
};

// =============================================================================
// Project Root Discovery
// =============================================================================

/** Resolve parent directory (platform-safe). */
const parentDir = (dir: string): string => {
  // Handle both / and \ separators
  const sep = dir.includes("\\") ? "\\" : "/";
  const parts = dir.split(sep).filter(Boolean);
  if (parts.length <= 1) return dir.startsWith("/") ? "/" : dir;
  parts.pop();
  return (dir.startsWith("/") ? "/" : "") + parts.join(sep);
};

/**
 * Walk up directory tree to find the nearest directory containing .eser/.
 * Returns the path or null if not found.
 */
export const findProjectRoot = async (
  startDir: string,
): Promise<string | null> => {
  let dir = startDir;
  for (let depth = 0; depth < 100; depth++) {
    try {
      await runtime.fs.stat(`${dir}/${ESER_DIR}`);
      return dir;
    } catch {
      // not found here, try parent
    }
    const parent = parentDir(dir);
    if (parent === dir) return null; // filesystem root
    dir = parent;
  }
  return null;
};

/**
 * Resolve the noskills project root with priority:
 *   1. NOSKILLS_PROJECT_ROOT env var (set by session/manager)
 *   2. Walk up from cwd to find .eser/
 *   3. Fall back to cwd (for init command)
 *
 * Returns `{ root, found }` — found=false means .eser/ not found anywhere.
 */
export const resolveProjectRoot = async (): Promise<
  { root: string; found: boolean }
> => {
  const cwd = runtime.process.cwd();

  // 1. Explicit env var (set by session or manager)
  const envRoot = runtime.env.get("NOSKILLS_PROJECT_ROOT") ?? null;
  if (envRoot !== null) {
    try {
      await runtime.fs.stat(`${envRoot}/${ESER_DIR}`);
      return { root: envRoot, found: true };
    } catch {
      // env var set but .eser/ not there — fall through to walk-up
    }
  }

  // 2. Walk up from cwd
  const found = await findProjectRoot(cwd);
  if (found !== null) {
    return { root: found, found: true };
  }

  // 3. Env var exists but .eser/ not found
  if (envRoot !== null) {
    return { root: envRoot, found: false };
  }

  // 4. Nothing found — return cwd (for init command to use)
  return { root: cwd, found: false };
};
