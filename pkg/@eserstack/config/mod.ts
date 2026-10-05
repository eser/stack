// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Configuration loading: `load()` reads `.env` files, JSON files and the
 * process environment through the Go library, later sources overriding
 * earlier ones. The `.env` loader written in TypeScript is in the
 * `@eserstack/config/dotenv` entry point, and `Config`, `Source` and
 * `Provider` describe configuration keys and where their values come from.
 *
 * @example
 * ```typescript
 * import * as config from "@eserstack/config";
 *
 * const values = await config.load(["env_file", "system_env"]);
 * ```
 *
 * @module
 */

export {
  type ConfigItem,
  type ConfigItemMeta,
  type ContainerReadable,
  type Provider,
  type RequestContext,
  type Source,
  type SourceState,
} from "./primitives.ts";
export { Config, type ConfigState, createConfigState } from "./config.ts";
export {
  createDotenvSourceState,
  DotenvSource,
  type DotenvSourceState,
} from "./dotenv-source.ts";

// FFI-backed config value loader
export {
  CONFIG_LOAD_FAILED,
  CONFIG_PARSE_ENV_FILE_FAILED,
  CONFIG_PARSE_JSON_FILE_FAILED,
  CONFIG_PARSE_JSON_STRING_FAILED,
  ConfigError,
  type ConfigOptions,
  type ConfigSource,
  type ConfigValues,
  type Loader,
  loadWith,
} from "./business/mod.ts";
export { ffiLoader } from "./adapters/ffi/mod.ts";

import * as business from "./business/config.ts";
import * as ffiAdapter from "./adapters/ffi/mod.ts";

/**
 * Loads configuration values from the given sources through the Go library.
 * Later sources override earlier ones.
 *
 * @param sources - The sources to read, in order
 * @param opts - Loading options
 * @returns The loaded values, by key
 * @throws {ConfigError} When a source cannot be read or parsed, or the Go
 *   library is not available
 *
 * @example
 * ```typescript
 * import * as config from "@eserstack/config";
 *
 * const values = await config.load(["env_file", "system_env"]);
 * ```
 */
export const load = (
  sources: business.ConfigSource[],
  opts?: business.ConfigOptions,
): Promise<business.ConfigValues> =>
  business.loadWith(ffiAdapter.ffiLoader, sources, opts);
