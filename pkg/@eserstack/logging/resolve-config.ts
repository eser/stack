// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Which level, sinks and filters a category takes from the logger
 * configurations: Go's `logfx.ResolveCategoryConfig` through the bridge name
 * `logResolveConfig`, with this module's TypeScript copy as the kept fallback
 * for processes without the bridge (laroux builds with `ESER_AJAN=disabled`).
 *
 * Both answer indexes and names, not values: the sinks and filters are
 * JavaScript functions that stay here, and the caller reads a config's own
 * `lowestLevel` back from the index.
 *
 * @module
 */

import type * as bindings from "@eserstack/ajan/ffi/bindings";
import type { Category, LoggerConfig } from "./types.ts";
import * as category from "./category.ts";
import * as ffiClient from "./ffi-client.ts";

/** What a category takes from the logger configurations that match it. */
export type CategoryResolution = {
  /** The index of the config whose `lowestLevel` applies, or -1 for none. */
  readonly levelIndex: number;
  /** Sink names, each once, in the order they were gathered. */
  readonly sinks: readonly string[];
  /** Filter names, each once, in the order they were gathered. */
  readonly filters: readonly string[];
};

/** The configs as `logResolveConfig` takes them: names and a level flag. */
export const toWire = (
  configs: readonly LoggerConfig[],
): bindings.LogCategoryConfigWire[] =>
  configs.map((config) => ({
    category: category.normalizeCategory(config.category),
    hasLevel: config.lowestLevel !== undefined,
    ...(config.sinks !== undefined && { sinks: config.sinks }),
    ...(config.parentSinks !== undefined && {
      parentSinks: config.parentSinks,
    }),
    ...(config.filters !== undefined && { filters: config.filters }),
  }));

/**
 * The TypeScript resolution, the same rules as `logfx.ResolveCategoryConfig`:
 * the configs whose category is the category or an ancestor of it, read from
 * the most specific outward; the first that sets a level gives it, and sink
 * and filter names gather up to and including a config with sinks and
 * `parentSinks: "override"`, so its ancestors add no sinks or filters.
 */
export const resolveInTypeScript = (
  loggerCategory: Category,
  configs: readonly LoggerConfig[],
): CategoryResolution => {
  const matches = configs
    .map((config, index) => ({
      index,
      length: category.normalizeCategory(config.category).length,
    }))
    .filter(({ index }) =>
      category.isDescendantOrSelf(
        loggerCategory,
        category.normalizeCategory(configs[index]!.category),
      ),
    )
    .sort((a, b) => b.length - a.length);

  const sinks = new Set<string>();
  const filters = new Set<string>();
  let levelIndex = -1;
  let gathering = true;

  for (const { index } of matches) {
    const config = configs[index]!;

    if (levelIndex < 0 && config.lowestLevel !== undefined) {
      levelIndex = index;
    }

    if (!gathering) {
      continue;
    }

    for (const sinkName of config.sinks ?? []) {
      sinks.add(sinkName);
    }

    for (const filterName of config.filters ?? []) {
      filters.add(filterName);
    }

    if (
      config.sinks !== undefined &&
      config.sinks.length > 0 &&
      config.parentSinks === "override"
    ) {
      gathering = false;
    }
  }

  return { levelIndex, sinks: [...sinks], filters: [...filters] };
};

/** Asks Go, or answers null when the bridge did not answer. */
const resolveInGo = (
  loggerCategory: Category,
  configs: readonly LoggerConfig[],
): CategoryResolution | null => {
  // The first resolution loads the bridge synchronously; a process where it
  // cannot load keeps resolving in TypeScript.
  ffiClient.ensureLibSync();
  const lib = ffiClient.getLib();

  if (lib === null) {
    return null;
  }

  let answer: bindings.ResponseOf<"logResolveConfig">;
  try {
    answer = lib.call("logResolveConfig", {
      category: loggerCategory,
      loggers: toWire(configs),
    });
  } catch {
    // A bridge that fails the call (a WASM trap) must not fail the logger.
    return null;
  }

  if (
    (answer.error !== undefined && answer.error !== "") ||
    answer.levelIndex === undefined ||
    answer.sinks === undefined ||
    answer.filters === undefined
  ) {
    return null;
  }

  return {
    levelIndex: answer.levelIndex,
    sinks: answer.sinks,
    filters: answer.filters,
  };
};

/**
 * Resolves a category against the logger configurations, in Go when the
 * bridge loads and in TypeScript when it does not. Never throws.
 */
export const resolveCategoryConfig = (
  loggerCategory: Category,
  configs: readonly LoggerConfig[],
): CategoryResolution => {
  if (configs.length === 0) {
    return { levelIndex: -1, sinks: [], filters: [] };
  }

  return (
    resolveInGo(loggerCategory, configs) ??
    resolveInTypeScript(loggerCategory, configs)
  );
};
