// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as ffi from "@eserstack/ajan/ffi";
import type { ConfigOptions, ConfigSource, ConfigValues, Loader } from "../../business/config.ts";
import {
  CONFIG_LOAD_FAILED,
  CONFIG_PARSE_ENV_FILE_FAILED,
  CONFIG_PARSE_JSON_FILE_FAILED,
  CONFIG_PARSE_JSON_STRING_FAILED,
  ConfigError,
} from "../../business/errors.ts";

let _lib: ffi.FFILibrary | null = null;
let _libPromise: Promise<void> | null = null;

const ensureLib = (): Promise<void> => {
  if (_libPromise === null) {
    _libPromise = ffi
      .loadEserAjan()
      .then((lib) => {
        _lib = lib;
      })
      .catch(() => {
        // Native library and WASM fallback both unavailable.
        // callers will receive CONFIG_LOAD_FAILED via getLib() === null check.
      });
  }
  return _libPromise;
};

const getLib = (): ffi.FFILibrary | null => _lib;

const mapErrorCode = (msg: string): string => {
  if (msg.includes("failed to parse env file")) return CONFIG_PARSE_ENV_FILE_FAILED;
  if (msg.includes("failed to parse JSON file")) return CONFIG_PARSE_JSON_FILE_FAILED;
  if (msg.includes("failed to parse JSON string")) return CONFIG_PARSE_JSON_STRING_FAILED;
  return CONFIG_LOAD_FAILED;
};

export const ffiLoader: Loader = {
  async load(sources: ConfigSource[], opts?: ConfigOptions): Promise<ConfigValues> {
    await ensureLib();
    const lib = getLib();
    if (lib === null) {
      throw new ConfigError("native library unavailable", CONFIG_LOAD_FAILED);
    }
    const raw = lib.symbols.EserAjanConfigLoad(
      JSON.stringify({ sources, ...(opts ?? {}) }),
    );
    const result = JSON.parse(raw) as { values?: Record<string, unknown>; error?: string };
    if (result.error) {
      throw new ConfigError(result.error, mapErrorCode(result.error));
    }
    return result.values ?? {};
  },
};
