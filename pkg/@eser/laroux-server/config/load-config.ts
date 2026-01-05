// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Configuration Loader
 * Loads and merges configuration from multiple sources:
 * 1. Built-in defaults (from defaults.ts - single source of truth)
 * 2. User config file (laroux.config.ts)
 * 3. CLI options (passed in by caller)
 */

import { runtime } from "@eser/standards/runtime";
import * as logging from "@eser/logging";
import { deepMerge } from "@eser/fp/deep-merge";
import type { AppConfig, LogLevel, UserConfig } from "@eser/laroux/config";
import { DEFAULT_CONFIG } from "@eser/laroux/config";

// Re-export types for convenience
export type { AppConfig, LogLevel };

const configLogger = logging.logger.getLogger(["laroux-server", "config"]);

/**
 * Load user configuration file if it exists
 */
async function loadUserConfig(
  projectRoot: string,
): Promise<UserConfig | null> {
  const configPath = runtime.path.join(projectRoot, "laroux.config.ts");

  if (await runtime.fs.exists(configPath)) {
    try {
      // Dynamic import the config file
      const mod = await import(`file://${configPath}`);
      return mod.default ?? {};
    } catch (error) {
      configLogger.warn(`Failed to load laroux.config.ts: ${error.message}`);
      return null;
    }
  }

  return null;
}

/**
 * Load complete configuration from all sources
 */
export async function loadConfig(projectRoot?: string): Promise<AppConfig> {
  const root = projectRoot ?? Deno.cwd();

  // Load user config and merge with defaults
  const userConfig = await loadUserConfig(root);

  // Return with project root
  return {
    projectRoot: root,
    ...deepMerge(DEFAULT_CONFIG, userConfig),
  };
}
