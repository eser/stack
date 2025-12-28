// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as logging from "@eser/standards/logging";
import type {
  Category,
  ConfigureOptions,
  Filter,
  LoggerConfig,
  LoggerRegistryState,
  Sink,
} from "./types.ts";
import {
  categoryKey,
  findMatchingConfigs,
  normalizeCategory,
} from "./category.ts";
import { setCategoryPrefixStorage, setContextStorage } from "./context.ts";

/**
 * External callback to clear logger cache (set by logger.ts to avoid circular imports).
 */
let clearLoggerCacheCallback: (() => void) | null = null;

/**
 * Registers a callback to clear the logger cache (called from logger.ts).
 */
export const registerLoggerCacheClear = (callback: () => void): void => {
  clearLoggerCacheCallback = callback;
};

/**
 * Global registry state for loggers.
 */
let registryState: LoggerRegistryState | null = null;

/**
 * Cached logger instances by category key.
 */
const loggerCache = new Map<
  string,
  { sinks: Sink[]; filters: Filter[]; lowestLevel: logging.Severity }
>();

/**
 * Gets the current registry state.
 * Returns null if not configured.
 */
export const getRegistryState = (): LoggerRegistryState | null => {
  return registryState;
};

/**
 * Checks if the logging system is configured.
 */
export const isConfigured = (): boolean => {
  return registryState !== null;
};

/**
 * Configures the logging system with sinks, filters, and loggers.
 *
 * @example
 * await configure({
 *   sinks: {
 *     console: getConsoleSink({ formatter: ansiColorFormatter() }),
 *     file: getStreamSink(fileStream),
 *   },
 *   filters: {
 *     production: getLevelFilter(logging.Severities.Warning),
 *   },
 *   loggers: [
 *     { category: ["myapp"], lowestLevel: logging.Severities.Debug, sinks: ["console"] },
 *     { category: ["myapp", "db"], sinks: ["console", "file"], filters: ["production"] },
 *   ],
 * });
 */
export const configure = async (
  options: ConfigureOptions,
): Promise<void> => {
  // Reset if requested or if no previous state
  if (options.reset || registryState === null) {
    await reset();
  }

  // Create new state
  registryState = {
    sinks: new Map(Object.entries(options.sinks)),
    filters: new Map(Object.entries(options.filters ?? {})),
    loggers: new Map(),
    contextLocalStorage: options.contextLocalStorage,
  };

  // Register logger configs
  for (const loggerConfig of options.loggers) {
    const normalized = normalizeCategory(loggerConfig.category);
    const key = categoryKey(normalized);
    registryState.loggers.set(key, {
      ...loggerConfig,
      category: normalized,
    });
  }

  // Set custom context storage if provided
  if (options.contextLocalStorage) {
    setContextStorage(options.contextLocalStorage);
  }

  // Clear logger cache
  loggerCache.clear();
};

/**
 * Synchronous version of configure.
 */
export const configureSync = (options: ConfigureOptions): void => {
  // Reset if requested or if no previous state
  if (options.reset || registryState === null) {
    resetSync();
  }

  // Create new state
  registryState = {
    sinks: new Map(Object.entries(options.sinks)),
    filters: new Map(Object.entries(options.filters ?? {})),
    loggers: new Map(),
    contextLocalStorage: options.contextLocalStorage,
  };

  // Register logger configs
  for (const loggerConfig of options.loggers) {
    const normalized = normalizeCategory(loggerConfig.category);
    const key = categoryKey(normalized);
    registryState.loggers.set(key, {
      ...loggerConfig,
      category: normalized,
    });
  }

  // Set custom context storage if provided
  if (options.contextLocalStorage) {
    setContextStorage(options.contextLocalStorage);
  }

  // Clear logger cache
  loggerCache.clear();
};

/**
 * Resets the logging configuration and disposes of sinks.
 */
export const reset = async (): Promise<void> => {
  // Dispose sinks if they have a dispose method
  if (registryState) {
    for (const sink of registryState.sinks.values()) {
      // deno-lint-ignore no-explicit-any
      const disposable = sink as any;
      if (typeof disposable.dispose === "function") {
        await disposable.dispose();
      } else if (typeof disposable[Symbol.asyncDispose] === "function") {
        await disposable[Symbol.asyncDispose]();
      }
    }
  }

  registryState = null;
  loggerCache.clear();
  clearLoggerCacheCallback?.();
  setContextStorage(undefined);
  setCategoryPrefixStorage(undefined);
};

/**
 * Synchronous version of reset.
 */
export const resetSync = (): void => {
  // Dispose sinks if they have a disposeSync method
  if (registryState) {
    for (const sink of registryState.sinks.values()) {
      // deno-lint-ignore no-explicit-any
      const disposable = sink as any;
      if (typeof disposable.disposeSync === "function") {
        disposable.disposeSync();
      } else if (typeof disposable[Symbol.dispose] === "function") {
        disposable[Symbol.dispose]();
      }
    }
  }

  registryState = null;
  loggerCache.clear();
  clearLoggerCacheCallback?.();
  setContextStorage(undefined);
  setCategoryPrefixStorage(undefined);
};

/**
 * Gets the effective configuration for a category (sinks, filters, level).
 * This resolves inheritance from parent categories.
 */
export const getEffectiveConfig = (
  category: Category,
): { sinks: Sink[]; filters: Filter[]; lowestLevel: logging.Severity } => {
  const key = categoryKey(category);

  // Check cache
  const cached = loggerCache.get(key);
  if (cached) {
    return cached;
  }

  // Default config
  const result: {
    sinks: Sink[];
    filters: Filter[];
    lowestLevel: logging.Severity;
  } = {
    sinks: [],
    filters: [],
    lowestLevel: logging.Severities.Info,
  };

  if (!registryState) {
    return result;
  }

  // Find matching configs (sorted by specificity, most specific first)
  const matchingConfigs = findMatchingConfigs(category, registryState.loggers);

  // Track which sinks to use
  const sinkNames = new Set<string>();
  const filterNames = new Set<string>();
  let levelSet = false;

  for (const config of matchingConfigs) {
    // Handle sinks
    if (config.sinks && config.sinks.length > 0) {
      if (config.parentSinks === "override") {
        // Override: only use this config's sinks
        sinkNames.clear();
      }
      for (const sinkName of config.sinks) {
        sinkNames.add(sinkName);
      }
    }

    // Handle filters
    if (config.filters) {
      for (const filterName of config.filters) {
        filterNames.add(filterName);
      }
    }

    // Handle lowest level (use most specific)
    if (!levelSet && config.lowestLevel !== undefined) {
      result.lowestLevel = config.lowestLevel;
      levelSet = true;
    }
  }

  // Resolve sink names to actual sinks
  for (const sinkName of sinkNames) {
    const sink = registryState.sinks.get(sinkName);
    if (sink) {
      result.sinks.push(sink);
    }
  }

  // Resolve filter names to actual filters
  for (const filterName of filterNames) {
    const filter = registryState.filters.get(filterName);
    if (filter) {
      result.filters.push(filter);
    }
  }

  // Cache the result
  loggerCache.set(key, result);

  return result;
};

/**
 * Registers a sink by name (for dynamic sink registration).
 */
export const registerSink = (name: string, sink: Sink): void => {
  if (!registryState) {
    throw new Error("Logging not configured. Call configure() first.");
  }

  registryState.sinks.set(name, sink);
  loggerCache.clear(); // Clear cache to pick up new sink
};

/**
 * Unregisters a sink by name.
 */
export const unregisterSink = (name: string): void => {
  if (!registryState) {
    return;
  }

  registryState.sinks.delete(name);
  loggerCache.clear();
};

/**
 * Registers a filter by name.
 */
export const registerFilter = (name: string, filter: Filter): void => {
  if (!registryState) {
    throw new Error("Logging not configured. Call configure() first.");
  }

  registryState.filters.set(name, filter);
  loggerCache.clear();
};

/**
 * Unregisters a filter by name.
 */
export const unregisterFilter = (name: string): void => {
  if (!registryState) {
    return;
  }

  registryState.filters.delete(name);
  loggerCache.clear();
};

/**
 * Registers a logger configuration.
 */
export const registerLogger = (config: LoggerConfig): void => {
  if (!registryState) {
    throw new Error("Logging not configured. Call configure() first.");
  }

  const normalized = normalizeCategory(config.category);
  const key = categoryKey(normalized);
  registryState.loggers.set(key, { ...config, category: normalized });
  loggerCache.clear();
};

/**
 * Gets all registered sink names.
 */
export const getSinkNames = (): string[] => {
  if (!registryState) {
    return [];
  }

  return Array.from(registryState.sinks.keys());
};

/**
 * Gets all registered filter names.
 */
export const getFilterNames = (): string[] => {
  if (!registryState) {
    return [];
  }

  return Array.from(registryState.filters.keys());
};

/**
 * Gets all registered logger categories.
 */
export const getLoggerCategories = (): Category[] => {
  if (!registryState) {
    return [];
  }

  return Array.from(registryState.loggers.values()).map(
    (config) => normalizeCategory(config.category),
  );
};

// Re-export types
export type {
  ConfigureOptions,
  LoggerConfig,
  LoggerRegistryState,
} from "./types.ts";
