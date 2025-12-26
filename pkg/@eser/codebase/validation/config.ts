// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Project configuration loading from .eser.yml
 *
 * @module
 */

import * as path from "@std/path";
import * as yaml from "@std/yaml";
import { NotFoundError, runtime } from "@eser/standards/runtime";
import type { ProjectConfig } from "./types.ts";

/** Config filenames to look for (in order of priority) */
const CONFIG_FILENAMES = [".eser.yml", ".eser.yaml"];

/**
 * Load project configuration from a directory
 *
 * Looks for .eser.yml or .eser.yaml in the specified directory.
 *
 * @param dir - Directory to load config from
 * @returns Project configuration or null if no config file exists
 */
export const loadProjectConfig = async (
  dir: string,
): Promise<ProjectConfig | null> => {
  for (const filename of CONFIG_FILENAMES) {
    const filepath = path.join(dir, filename);

    try {
      const content = await runtime.fs.readTextFile(filepath);
      const config = yaml.parse(content) as ProjectConfig;

      return config;
    } catch (error) {
      // File doesn't exist or can't be read - try next filename
      if (error instanceof NotFoundError) {
        continue;
      }
      throw error;
    }
  }

  return null;
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
  for (const filename of CONFIG_FILENAMES) {
    const filepath = path.join(dir, filename);

    try {
      await runtime.fs.stat(filepath);
      return filepath;
    } catch {
      continue;
    }
  }

  return null;
};
