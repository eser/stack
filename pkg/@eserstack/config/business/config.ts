// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export type ConfigValues = Record<string, unknown>;

export type ConfigSource =
  | "system_env"
  | "env_file"
  | `env_file:${string}`
  | "json_file"
  | `json_file:${string}`
  | `json_string:${string}`;

export type ConfigOptions = {
  readonly caseInsensitive?: boolean;
};

export type Loader = {
  load(sources: ConfigSource[], opts?: ConfigOptions): Promise<ConfigValues>;
};

export const loadWith = (
  loader: Loader,
  sources: ConfigSource[],
  opts?: ConfigOptions,
): Promise<ConfigValues> => loader.load(sources, opts);
