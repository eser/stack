// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The host facts the Go side resolves the base directories from.
 *
 * The WASM build of the bridge runs as wasip1, without the host's platform,
 * home directory or environment, so every request that resolves a directory
 * carries them. Go owns the rules (`pkg/ajan/cachefx`); this module only reads
 * the values. Not exported from the package.
 *
 * @module
 */

import * as standardsCrossRuntime from "@eserstack/standards/cross-runtime";

const runtime = standardsCrossRuntime.runtime;

/** The environment variables the base directory rules of cachefx read. */
const HOST_ENV_NAMES: readonly string[] = [
  "XDG_CACHE_HOME",
  "XDG_DATA_HOME",
  "XDG_CONFIG_HOME",
  "LOCALAPPDATA",
  "APPDATA",
];

/** The `host` field of the cache bridge requests. */
export interface HostFacts {
  readonly platform: string;
  readonly home: string;
  readonly env: Readonly<Record<string, string>>;
}

/** Reads the host facts of this process. */
export const currentHost = (): HostFacts => {
  const env: Record<string, string> = {};
  for (const name of HOST_ENV_NAMES) {
    const value = runtime.env.get(name);
    if (value !== undefined) {
      env[name] = value;
    }
  }

  return {
    platform: standardsCrossRuntime.getPlatform(),
    home: standardsCrossRuntime.getHomedir(),
    env,
  };
};
