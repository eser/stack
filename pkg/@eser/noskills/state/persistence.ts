// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * State persistence — read/write .eser/.state/state.json and noskills
 * config inside .eser/manifest.yml (comment-preserving YAML).
 *
 * @module
 */

import * as yaml from "yaml";
import * as schema from "./schema.ts";
import { runtime } from "@eser/standards/cross-runtime";

// =============================================================================
// Paths
// =============================================================================

const ESER_DIR: string = ".eser";
const STATE_DIR: string = `${ESER_DIR}/.state`;
const STATE_FILE: string = `${STATE_DIR}/state.json`;
const MANIFEST_FILE: string = `${ESER_DIR}/manifest.yml`;
const CONCERNS_DIR: string = `${ESER_DIR}/concerns`;
const RULES_DIR: string = `${ESER_DIR}/rules`;
const SPECS_DIR: string = `${ESER_DIR}/specs`;
const WORKFLOWS_DIR: string = `${ESER_DIR}/workflows`;

const SPEC_STATES_DIR: string = `${STATE_DIR}/specs`;
const ACTIVE_FILE: string = `${STATE_DIR}/active.json`;

export const paths: {
  readonly eserDir: string;
  readonly stateDir: string;
  readonly stateFile: string;
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
  readonly eserGitignore: string;
} = {
  eserDir: ESER_DIR,
  stateDir: STATE_DIR,
  stateFile: STATE_FILE,
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
  eserGitignore: `${ESER_DIR}/.gitignore`,
};

// =============================================================================
// State File
// =============================================================================

export const readState = async (root: string): Promise<schema.StateFile> => {
  const filePath = `${root}/${STATE_FILE}`;

  try {
    const content = await runtime.fs.readTextFile(filePath);

    return JSON.parse(content) as schema.StateFile;
  } catch {
    return schema.createInitialState();
  }
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

/** Parse --spec=<name> from command args. Returns null if not provided. */
export const parseSpecFlag = (
  args?: readonly string[],
): string | null => {
  if (args === undefined) return null;
  for (const arg of args) {
    if (arg.startsWith("--spec=")) {
      return arg.slice("--spec=".length);
    }
  }
  return null;
};

/**
 * Require --spec=<name> flag on spec-specific commands.
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
        "Error: --spec=<name> is required. Use `noskills spec list` to see available specs.",
    };
  }
  return { ok: true, spec };
};

export const writeState = async (
  root: string,
  state: schema.StateFile,
): Promise<void> => {
  const dirPath = `${root}/${STATE_DIR}`;
  const filePath = `${root}/${STATE_FILE}`;

  await runtime.fs.mkdir(dirPath, { recursive: true });
  await runtime.fs.writeTextFile(
    filePath,
    JSON.stringify(state, null, 2) + "\n",
  );
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
// Per-Spec State Files (.eser/.state/specs/<name>.json)
// =============================================================================

export const readSpecState = async (
  root: string,
  specName: string,
): Promise<schema.StateFile> => {
  const filePath = `${root}/${paths.specStateFile(specName)}`;

  try {
    const content = await runtime.fs.readTextFile(filePath);

    return JSON.parse(content) as schema.StateFile;
  } catch {
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

  await runtime.fs.mkdir(dirPath, { recursive: true });
  await runtime.fs.writeTextFile(
    filePath,
    JSON.stringify(state, null, 2) + "\n",
  );
};

/** List all spec names that have state files. */
export const listSpecStates = async (
  root: string,
): Promise<readonly { name: string; state: schema.StateFile }[]> => {
  const dirPath = `${root}/${SPEC_STATES_DIR}`;
  const results: { name: string; state: schema.StateFile }[] = [];

  try {
    for await (const entry of runtime.fs.readDir(dirPath)) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        const name = entry.name.replace(/\.json$/, "");
        const content = await runtime.fs.readTextFile(
          `${dirPath}/${entry.name}`,
        );
        results.push({
          name,
          state: JSON.parse(content) as schema.StateFile,
        });
      }
    }
  } catch {
    // No spec states yet
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
  await runtime.fs.writeTextFile(filePath, doc.toString());
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
  await runtime.fs.writeTextFile(
    filePath,
    JSON.stringify(concern, null, 2) + "\n",
  );
};

export const listConcerns = async (
  root: string,
): Promise<readonly schema.ConcernDefinition[]> => {
  const dirPath = `${root}/${CONCERNS_DIR}`;
  const concerns: schema.ConcernDefinition[] = [];

  try {
    for await (const entry of runtime.fs.readDir(dirPath)) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        const content = await runtime.fs.readTextFile(
          `${dirPath}/${entry.name}`,
        );
        concerns.push(JSON.parse(content) as schema.ConcernDefinition);
      }
    }
  } catch {
    // Directory doesn't exist yet
  }

  return concerns;
};

// =============================================================================
// Directory Scaffolding
// =============================================================================

export const scaffoldEserDir = async (root: string): Promise<void> => {
  const dirs = [
    ESER_DIR,
    STATE_DIR,
    SPEC_STATES_DIR,
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
    await runtime.fs.writeTextFile(
      gitignorePath,
      "# eser toolchain runtime state — not tracked by git\n.state/\n",
    );
  }
};

// =============================================================================
// State + Spec State (write both atomically)
// =============================================================================

/** Write main state AND the per-spec state file for the active spec. */
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
