// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Project configuration loading from .manifest.yml
 *
 * @module
 */

import * as configManifest from "@eser/config/manifest";
import type { ProjectConfig } from "./types.ts";

/**
 * Load project configuration from a directory
 *
 * Looks for .manifest.yml or .manifest.yaml in the specified directory.
 *
 * @param dir - Directory to load config from
 * @returns Project configuration or null if no config file exists
 */
export const loadProjectConfig = async (
  dir: string,
): Promise<ProjectConfig | null> => {
  const raw = await configManifest.loadManifest(dir);
  if (raw === null) return null;
  return raw as ProjectConfig;
};

/**
 * Get the config file path in a directory (if it exists)
 *
 * @param dir - Directory to check
 * @returns Path to config file or null if none exists
 */
export const getProjectConfigPath = async (
  dir: string,
): Promise<string | null> => {
  return await configManifest.getManifestPath(dir);
};
