// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * State persistence — read/write .nos/.state/state.json and .nos/config.json.
 *
 * @module
 */

import * as schema from "./schema.ts";

// =============================================================================
// Paths
// =============================================================================

const NOS_DIR: string = ".nos";
const STATE_DIR: string = `${NOS_DIR}/.state`;
const STATE_FILE: string = `${STATE_DIR}/state.json`;
const CONFIG_FILE: string = `${NOS_DIR}/config.json`;
const CONCERNS_DIR: string = `${NOS_DIR}/concerns`;
const RULES_DIR: string = `${NOS_DIR}/rules`;
const SPECS_DIR: string = `${NOS_DIR}/specs`;
const WORKFLOWS_DIR: string = `${NOS_DIR}/workflows`;

export const paths: {
  readonly nosDir: string;
  readonly stateDir: string;
  readonly stateFile: string;
  readonly configFile: string;
  readonly concernsDir: string;
  readonly rulesDir: string;
  readonly specsDir: string;
  readonly workflowsDir: string;
  readonly specDir: (specName: string) => string;
  readonly specFile: (specName: string) => string;
  readonly concernFile: (concernId: string) => string;
  readonly nosGitignore: string;
} = {
  nosDir: NOS_DIR,
  stateDir: STATE_DIR,
  stateFile: STATE_FILE,
  configFile: CONFIG_FILE,
  concernsDir: CONCERNS_DIR,
  rulesDir: RULES_DIR,
  specsDir: SPECS_DIR,
  workflowsDir: WORKFLOWS_DIR,

  specDir: (specName: string): string => `${SPECS_DIR}/${specName}`,
  specFile: (specName: string): string => `${SPECS_DIR}/${specName}/spec.md`,
  concernFile: (concernId: string): string =>
    `${CONCERNS_DIR}/${concernId}.json`,
  nosGitignore: `${NOS_DIR}/.gitignore`,
};

// =============================================================================
// State File
// =============================================================================

export const readState = async (root: string): Promise<schema.StateFile> => {
  const filePath = `${root}/${STATE_FILE}`;

  try {
    const content = await Deno.readTextFile(filePath);

    return JSON.parse(content) as schema.StateFile;
  } catch {
    return schema.createInitialState();
  }
};

export const writeState = async (
  root: string,
  state: schema.StateFile,
): Promise<void> => {
  const dirPath = `${root}/${STATE_DIR}`;
  const filePath = `${root}/${STATE_FILE}`;

  await Deno.mkdir(dirPath, { recursive: true });
  await Deno.writeTextFile(filePath, JSON.stringify(state, null, 2) + "\n");
};

// =============================================================================
// Config File
// =============================================================================

export const readConfig = async (
  root: string,
): Promise<schema.NosConfig | null> => {
  const filePath = `${root}/${CONFIG_FILE}`;

  try {
    const content = await Deno.readTextFile(filePath);

    return JSON.parse(content) as schema.NosConfig;
  } catch {
    return null;
  }
};

export const writeConfig = async (
  root: string,
  config: schema.NosConfig,
): Promise<void> => {
  const filePath = `${root}/${CONFIG_FILE}`;

  await Deno.writeTextFile(filePath, JSON.stringify(config, null, 2) + "\n");
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
    const content = await Deno.readTextFile(filePath);

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

  await Deno.mkdir(dirPath, { recursive: true });
  await Deno.writeTextFile(filePath, JSON.stringify(concern, null, 2) + "\n");
};

export const listConcerns = async (
  root: string,
): Promise<readonly schema.ConcernDefinition[]> => {
  const dirPath = `${root}/${CONCERNS_DIR}`;
  const concerns: schema.ConcernDefinition[] = [];

  try {
    for await (const entry of Deno.readDir(dirPath)) {
      if (entry.isFile && entry.name.endsWith(".json")) {
        const content = await Deno.readTextFile(`${dirPath}/${entry.name}`);
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

export const scaffoldNosDir = async (root: string): Promise<void> => {
  const dirs = [
    NOS_DIR,
    STATE_DIR,
    CONCERNS_DIR,
    RULES_DIR,
    SPECS_DIR,
    WORKFLOWS_DIR,
  ];

  for (const dir of dirs) {
    await Deno.mkdir(`${root}/${dir}`, { recursive: true });
  }

  // .gitignore at .nos/ level to keep runtime state out of git
  await Deno.writeTextFile(
    `${root}/${paths.nosGitignore}`,
    "# noskills runtime state — not tracked by git\n.state/\n",
  );
};

// =============================================================================
// Existence Checks
// =============================================================================

export const isInitialized = async (root: string): Promise<boolean> => {
  try {
    await Deno.stat(`${root}/${CONFIG_FILE}`);

    return true;
  } catch {
    return false;
  }
};
