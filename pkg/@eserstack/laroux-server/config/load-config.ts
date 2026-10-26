// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Configuration Loader
 * Loads and merges configuration from multiple sources:
 * 1. Built-in defaults (from defaults.ts - single source of truth)
 * 2. User config file (laroux.config.ts)
 * 3. CLI options (passed in by caller)
 */

import { runtime } from "@eserstack/standards/cross-runtime";
import * as logging from "@eserstack/logging";
import * as deepMerge from "@eserstack/fp/deep-merge";
import * as nodeUrl from "node:url";
import type { AppConfig, LogLevel, UserConfig } from "@eserstack/laroux/config";
import * as config from "@eserstack/laroux/config";

// Re-export types for convenience
export type { AppConfig, LogLevel };

// The types AppConfig is made of, so the config this module returns is
// documented in full
export type {
  FontDefinition,
  FontDisplay,
  FontProvider,
  FontStyle,
  FontWeight,
  ImageFormat,
  ImageOutputFormat,
  ImagePlaceholder,
  ResolvedBrowserShimsConfig,
  ResolvedBuildConfig,
  ResolvedCriticalCssConfig,
  ResolvedCriticalCssViewport,
  ResolvedImageConfig,
  ResolvedImageQuality,
  ResolvedInternalConfig,
  ResolvedModeConfig,
  ResolvedServerConfig,
  ResolvedSSRConfig,
  SSRMode,
  SSRStreamMode,
} from "@eserstack/laroux/config";

const configLogger = logging.logger.getLogger(["laroux-server", "config"]);

/**
 * Convert a filesystem path to a proper file:// URL with `pathToFileURL` from
 * `node:url`, which handles both Unix and Windows paths.
 */
function pathToFileUrl(filePath: string): string {
  // Ensure the path is absolute
  const absolutePath = runtime.path.isAbsolute(filePath)
    ? filePath
    : runtime.path.resolve(filePath);

  return nodeUrl.pathToFileURL(absolutePath).href;
}

/**
 * Load user configuration file if it exists
 */
async function loadUserConfig(projectRoot: string): Promise<UserConfig | null> {
  const configPath = runtime.path.join(projectRoot, "laroux.config.ts");

  if (await runtime.fs.exists(configPath)) {
    try {
      // Dynamic import the config file using proper file:// URL
      const fileUrl = pathToFileUrl(configPath);
      const mod = await import(fileUrl);
      return mod.default ?? {};
    } catch (error) {
      configLogger
        .with({ error })
        .warn(`load ${configPath}; using the default configuration`);
      return null;
    }
  }

  return null;
}

/**
 * Load complete configuration from all sources
 */
export async function loadConfig(projectRoot?: string): Promise<AppConfig> {
  const root = projectRoot ?? runtime.process.cwd();

  // Load user config and merge with defaults
  const userConfig = await loadUserConfig(root);

  // Return with project root
  return {
    ...deepMerge.deepMerge(config.DEFAULT_CONFIG, userConfig),
    projectRoot: root,
  };
}
