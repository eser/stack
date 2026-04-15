// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Optional config file loader for `.eser/manifest.yml` files.
 *
 * The workflow engine does not require file-based configuration —
 * workflows can be constructed programmatically via the builder.
 * This loader provides convenience for file-based usage.
 *
 * @example
 * ```typescript
 * import * as workflowLoader from "@eserstack/workflows/loader";
 *
 * // Load from directory
 * const config = await workflowLoader.loadFromFile(".");
 *
 * // Parse YAML directly
 * const config2 = workflowLoader.parseConfig(yamlString);
 * ```
 *
 * @module
 */

import * as yaml from "yaml";
import * as configManifest from "@eserstack/config/manifest";
import type { WorkflowsConfig } from "./types.ts";

/**
 * Validate a parsed configuration object.
 *
 * Checks structural invariants: `workflows` must be an array where every
 * entry has a non-empty `id`, at least one `on` event, and at least one
 * valid step.
 *
 * @param config - The configuration to validate
 * @throws {Error} Descriptive error naming the invalid workflow/step
 */
export const validateConfig = (config: WorkflowsConfig): void => {
  const workflows = config.workflows;

  if (!Array.isArray(workflows)) {
    throw new Error(
      "Invalid config: 'workflows' must be an array",
    );
  }

  for (let i = 0; i < workflows.length; i++) {
    const wf = workflows[i];
    const label = wf?.id !== undefined && wf.id !== ""
      ? `workflow '${wf.id}'`
      : `workflow at index ${i}`;

    if (typeof wf?.id !== "string" || wf.id === "") {
      throw new Error(
        `Invalid config: ${label} must have a non-empty 'id' string`,
      );
    }

    if (!Array.isArray(wf.on) || wf.on.length === 0) {
      throw new Error(
        `Invalid config: ${label} must have a non-empty 'on' array`,
      );
    }

    if (!Array.isArray(wf.steps) || wf.steps.length === 0) {
      throw new Error(
        `Invalid config: ${label} must have a non-empty 'steps' array`,
      );
    }

    for (let j = 0; j < wf.steps.length; j++) {
      const step = wf.steps[j];

      if (typeof step === "string") {
        continue;
      }

      if (
        typeof step !== "object" || step === null || Array.isArray(step)
      ) {
        throw new Error(
          `Invalid config: ${label}, step ${j} must be a string or an object with exactly one key`,
        );
      }

      const keys = Object.keys(step);
      if (keys.length !== 1) {
        throw new Error(
          `Invalid config: ${label}, step ${j} must be an object with exactly one key (got ${keys.length})`,
        );
      }
    }
  }
};

/**
 * Parse a YAML string into a WorkflowsConfig.
 *
 * @param content - YAML content
 * @returns Parsed configuration
 */
export const parseConfig = (content: string): WorkflowsConfig => {
  const raw = yaml.parse(content) as Record<string, unknown>;

  const config: WorkflowsConfig = {
    stack: raw["stack"] as string[] | undefined,
    workflows: (raw["workflows"] as WorkflowsConfig["workflows"]) ?? [],
    scripts: raw["scripts"] as WorkflowsConfig["scripts"] | undefined,
  };

  validateConfig(config);

  return config;
};

/**
 * Load workflow configuration from a directory.
 *
 * Looks for `.eser/manifest.yml` or `.eser/manifest.yaml` in the specified directory.
 *
 * @param dir - Directory to load config from
 * @returns Parsed configuration or null if no config file exists
 */
export const loadFromFile = async (
  dir: string,
): Promise<WorkflowsConfig | null> => {
  const raw = await configManifest.loadManifest(dir);
  if (raw === null) return null;

  const config: WorkflowsConfig = {
    stack: raw["stack"] as string[] | undefined,
    workflows: (raw["workflows"] as WorkflowsConfig["workflows"]) ?? [],
    scripts: raw["scripts"] as WorkflowsConfig["scripts"] | undefined,
  };

  validateConfig(config);
  return config;
};

/**
 * Get the config filenames that the loader searches for.
 */
export const getConfigFilenames = (): readonly string[] =>
  configManifest.MANIFEST_FILENAMES;
