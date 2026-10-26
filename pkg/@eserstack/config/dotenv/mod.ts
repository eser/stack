// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

export { defaultEnvValue, env, type EnvMap, envVars } from "./base.ts";
export {
  type BaseEnvVariables,
  configure,
  type ConfigureFn,
  type EnvVariables,
} from "./configure.ts";
export {
  DEFAULT_MAX_FILE_SIZE,
  EnvFileTooLargeError,
  load,
  type LoaderOptions,
  parseEnvFromFile,
  parseEnvString,
} from "./loader.ts";
export { createEnvReader, type EnvReader } from "./reader.ts";
