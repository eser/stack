// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Dynamic command prefix resolver.
 *
 * Every piece of noskills that generates user-facing text must use this
 * instead of hardcoding "npx eser noskills". The prefix comes from
 * `manifest.yml` → `noskills.command`, with runtime detection fallback.
 *
 * @module
 */

const DEFAULT_CMD = "npx eser noskills";

/**
 * Build a full command string from the prefix and subcommand.
 * Example: cmd("next", config) → "eser nos next"
 */
export const cmd = (
  subcommand: string,
  config?: { command?: string } | null,
): string => {
  const prefix = config?.command ?? DEFAULT_CMD;

  return `${prefix} ${subcommand}`;
};

/**
 * Get just the prefix without a subcommand.
 */
export const cmdPrefix = (
  config?: { command?: string } | null,
): string => {
  return config?.command ?? DEFAULT_CMD;
};
