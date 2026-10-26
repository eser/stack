// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/** Loaded configuration values, by key. */
export type ConfigValues = Record<string, unknown>;

/**
 * Where to load values from: `system_env` for the process environment,
 * `env_file` and `json_file` for `.env` and `config.json`, `env_file:<path>` and
 * `json_file:<path>` for a given file, and `json_string:<json>` for inline
 * JSON.
 */
export type ConfigSource =
  | "system_env"
  | "env_file"
  | `env_file:${string}`
  | "json_file"
  | `json_file:${string}`
  | `json_string:${string}`;

/** Options for loading configuration. */
export type ConfigOptions = {
  /** Match keys without regard to case. */
  readonly caseInsensitive?: boolean;
};

/** Loads configuration values from a list of sources. */
export type Loader = {
  load(sources: ConfigSource[], opts?: ConfigOptions): Promise<ConfigValues>;
};

/**
 * Loads configuration values with the given loader.
 *
 * @param loader - The loader that reads the sources
 * @param sources - The sources to read, in order
 * @param opts - Loading options
 * @returns The loaded values, by key
 */
export const loadWith = (
  loader: Loader,
  sources: ConfigSource[],
  opts?: ConfigOptions,
): Promise<ConfigValues> => loader.load(sources, opts);
