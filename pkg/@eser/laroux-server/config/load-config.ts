// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Configuration Loader
 * Loads and merges configuration from multiple sources:
 * 1. Built-in defaults (from defaults.ts - single source of truth)
 * 2. User config file (laroux.config.ts)
 * 3. CLI options (passed in by caller)
 */

import { current } from "@eser/standards/runtime";
import * as logging from "@eser/logging";
import { deepMerge } from "@eser/fp/deep-merge";
import { toFileUrl } from "@std/path/to-file-url";
import type { AppConfig, LogLevel, UserConfig } from "@eser/laroux/config";
import { DEFAULT_CONFIG } from "@eser/laroux/config";

// Re-export types for convenience
export type { AppConfig, LogLevel };

const configLogger = logging.logger.getLogger(["laroux-server", "config"]);

/**
 * Convert a filesystem path to a proper file:// URL using @std/path.
 * Handles both Unix and Windows paths correctly.
 */
function pathToFileUrl(filePath: string): string {
  // Ensure the path is absolute
  const absolutePath = current.path.isAbsolute(filePath)
    ? filePath
    : current.path.resolve(filePath);

  // Use @std/path's toFileUrl for cross-platform file:// URL generation
  return toFileUrl(absolutePath).href;
}

/**
 * Load user configuration file if it exists
 */
async function loadUserConfig(
  projectRoot: string,
): Promise<UserConfig | null> {
  const configPath = current.path.join(projectRoot, "laroux.config.ts");

  if (await current.fs.exists(configPath)) {
    try {
      // Dynamic import the config file using proper file:// URL
      const fileUrl = pathToFileUrl(configPath);
      const mod = await import(fileUrl);
      return mod.default ?? {};
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      configLogger.warn(`Failed to load laroux.config.ts: ${message}`);
      return null;
    }
  }

  return null;
}

/**
 * Load complete configuration from all sources
 */
export async function loadConfig(projectRoot?: string): Promise<AppConfig> {
  const root = projectRoot ?? current.process.cwd();

  // Load user config and merge with defaults
  const userConfig = await loadUserConfig(root);

  // Return with project root
  return {
    projectRoot: root,
    ...deepMerge(DEFAULT_CONFIG, userConfig),
  };
}
