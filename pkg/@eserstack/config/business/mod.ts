// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export {
  type ConfigOptions,
  type ConfigSource,
  type ConfigValues,
  type Loader,
  loadWith,
} from "./config.ts";
export {
  CONFIG_LOAD_FAILED,
  CONFIG_PARSE_ENV_FILE_FAILED,
  CONFIG_PARSE_JSON_FILE_FAILED,
  CONFIG_PARSE_JSON_STRING_FAILED,
  ConfigError,
} from "./errors.ts";
