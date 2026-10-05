// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as client from "@eserstack/ajan/ffi/client";
import type {
  ConfigOptions,
  ConfigSource,
  ConfigValues,
  Loader,
} from "../../business/config.ts";
import * as errors from "../../business/errors.ts";

const mapErrorCode = (msg: string): string => {
  if (msg.includes("failed to parse env file")) {
    return errors.CONFIG_PARSE_ENV_FILE_FAILED;
  }
  if (msg.includes("failed to parse JSON file")) {
    return errors.CONFIG_PARSE_JSON_FILE_FAILED;
  }
  if (msg.includes("failed to parse JSON string")) {
    return errors.CONFIG_PARSE_JSON_STRING_FAILED;
  }
  return errors.CONFIG_LOAD_FAILED;
};

// Arrow properties rather than method shorthand: deno lint's
// no-top-level-await reports an await inside an object method as top level.
/**
 * A `Loader` that reads configuration through the Go library. It throws a
 * `ConfigError` with `CONFIG_LOAD_FAILED` when the library is not available.
 */
export const ffiLoader: Loader = {
  load: async (
    sources: ConfigSource[],
    opts?: ConfigOptions,
  ): Promise<ConfigValues> => {
    const result = await client.callJson<{ values?: Record<string, unknown> }>(
      (lib) =>
        lib.symbols.EserAjanConfigLoad(
          JSON.stringify({ sources, ...(opts ?? {}) }),
        ),
      {
        onUnavailable: () =>
          new errors.ConfigError(
            "native library unavailable",
            errors.CONFIG_LOAD_FAILED,
          ),
        onError: (msg) => new errors.ConfigError(msg, mapErrorCode(msg)),
      },
    );

    return result.values ?? {};
  },
};
