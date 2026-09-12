// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { callJson } from "@eserstack/ajan/ffi/client";
import type {
  ConfigOptions,
  ConfigSource,
  ConfigValues,
  Loader,
} from "../../business/config.ts";
import {
  CONFIG_LOAD_FAILED,
  CONFIG_PARSE_ENV_FILE_FAILED,
  CONFIG_PARSE_JSON_FILE_FAILED,
  CONFIG_PARSE_JSON_STRING_FAILED,
  ConfigError,
} from "../../business/errors.ts";

const mapErrorCode = (msg: string): string => {
  if (msg.includes("failed to parse env file")) {
    return CONFIG_PARSE_ENV_FILE_FAILED;
  }
  if (msg.includes("failed to parse JSON file")) {
    return CONFIG_PARSE_JSON_FILE_FAILED;
  }
  if (msg.includes("failed to parse JSON string")) {
    return CONFIG_PARSE_JSON_STRING_FAILED;
  }
  return CONFIG_LOAD_FAILED;
};

export const ffiLoader: Loader = {
  async load(
    sources: ConfigSource[],
    opts?: ConfigOptions,
  ): Promise<ConfigValues> {
    const result = await callJson<{ values?: Record<string, unknown> }>(
      (lib) =>
        lib.symbols.EserAjanConfigLoad(
          JSON.stringify({ sources, ...(opts ?? {}) }),
        ),
      {
        onUnavailable: () =>
          new ConfigError("native library unavailable", CONFIG_LOAD_FAILED),
        onError: (msg) => new ConfigError(msg, mapErrorCode(msg)),
      },
    );

    return result.values ?? {};
  },
};
