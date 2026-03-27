// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Environment Configuration Module
 * Loads and validates environment variables from .env files
 */

import { runtime } from "@eser/standards/cross-runtime";
import * as logging from "@eser/logging";

const envLogger = logging.logger.getLogger(["laroux-server", "env"]);

/**
 * Environment configuration schema
 * All environment variables that the application uses
 */
export interface EnvConfig {
  // Server
  PORT: number;
  NODE_ENV: "development" | "production" | "test";

  // Feature flags
  ENABLE_RATE_LIMITING: boolean;

  // Logging
  LOG_LEVEL: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
}

/**
 * Default values for environment variables
 */
const DEFAULTS: Partial<EnvConfig> = {
  PORT: 8000,
  NODE_ENV: "development",
  ENABLE_RATE_LIMITING: true,
  LOG_LEVEL: "info",
};

/**
 * Parse a .env file content into key-value pairs
 */
function parseEnvFile(content: string): Record<string, string> {
  const result: Record<string, string> = {};

  for (const line of content.split("\n")) {
    // Skip empty lines and comments
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    // Find the first = sign
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, eqIndex).trim();
    let value = trimmed.slice(eqIndex + 1).trim();

    // Remove surrounding quotes
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

/**
 * Load environment variables from .env files
 * Order of precedence (later overrides earlier):
 * 1. .env (base)
 * 2. .env.local (local overrides, not committed)
 * 3. .env.{mode} (mode-specific, e.g., .env.production)
 * 4. .env.{mode}.local (mode-specific local overrides)
 * 5. System environment variables (highest priority)
 */
export async function loadEnvFiles(projectRoot: string): Promise<void> {
  const mode = runtime.env.get("NODE_ENV") ??
    "development";

  const envFiles = [
    ".env",
    ".env.local",
    `.env.${mode}`,
    `.env.${mode}.local`,
  ];

  for (const filename of envFiles) {
    const filepath = runtime.path.resolve(projectRoot, filename);

    if (await runtime.fs.exists(filepath)) {
      try {
        const content = await runtime.fs.readTextFile(filepath);
        const vars = parseEnvFile(content);

        // Set variables that aren't already set
        for (const [key, value] of Object.entries(vars)) {
          if (!runtime.env.has(key)) {
            runtime.env.set(key, value);
          }
        }
      } catch (error) {
        envLogger.warn(`Failed to load ${filename}:`, { error });
      }
    }
  }
}

/**
 * Get a typed environment configuration
 * Uses runtime.env with fallbacks to defaults
 */
export function getEnvConfig(): EnvConfig {
  const getEnv = (key: string): string | undefined => runtime.env.get(key);

  const getEnvNumber = (key: string, defaultValue: number): number => {
    const value = getEnv(key);
    if (value === undefined) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  };

  const getEnvBoolean = (key: string, defaultValue: boolean): boolean => {
    const value = getEnv(key);
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === "true" || value === "1";
  };

  return {
    PORT: getEnvNumber("PORT", DEFAULTS.PORT!),
    NODE_ENV:
      (getEnv("NODE_ENV") ?? DEFAULTS.NODE_ENV!) as EnvConfig["NODE_ENV"],
    ENABLE_RATE_LIMITING: getEnvBoolean(
      "ENABLE_RATE_LIMITING",
      DEFAULTS.ENABLE_RATE_LIMITING!,
    ),
    LOG_LEVEL: (getEnv("LOG_LEVEL") ??
      DEFAULTS.LOG_LEVEL!) as EnvConfig["LOG_LEVEL"],
  };
}

// Singleton for cached config
let cachedConfig: EnvConfig | null = null;

/**
 * Initialize and get environment configuration
 * Loads .env files on first call, returns cached config on subsequent calls
 */
export async function initEnvConfig(
  projectRoot: string,
): Promise<EnvConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  await loadEnvFiles(projectRoot);
  cachedConfig = getEnvConfig();

  return cachedConfig;
}

/**
 * Get cached environment config (must call initEnvConfig first)
 */
export function getCachedEnvConfig(): EnvConfig {
  if (!cachedConfig) {
    // Fall back to reading from current.env directly
    cachedConfig = getEnvConfig();
  }
  return cachedConfig;
}
