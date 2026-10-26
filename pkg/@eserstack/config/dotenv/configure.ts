// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type { env } from "./base.ts";
import * as loader from "./loader.ts";
import type { LoaderOptions } from "./loader.ts";
import * as reader from "./reader.ts";
import type { EnvReader } from "./reader.ts";

/** An object that holds the environment name under the `env` symbol. */
export type BaseEnvVariables = {
  [env]: string;
};

/** The environment name plus any other values. */
export type EnvVariables = BaseEnvVariables & Record<string, unknown>;

/**
 * Fills `target` from the environment through `reader`. It may return the
 * filled object, a new one, or nothing to keep `target`.
 */
export type ConfigureFn<T = EnvVariables> = (
  reader: EnvReader,
  target: T,
) => T | void | Promise<T | void>;

/**
 * Loads the environment with `load()` and passes a reader for it to
 * `configureFn`, which builds an options object.
 *
 * @param configureFn - Reads values and fills or returns the object
 * @param target - The object passed to `configureFn`
 * @param options - Options for `load()`
 * @returns What `configureFn` returned, or `target` when it returned nothing
 * @throws {EnvFileTooLargeError} When an `.env` file exceeds the size limit
 *
 * @example
 * ```typescript
 * import * as dotenv from "@eserstack/config/dotenv";
 *
 * const options = await dotenv.configure(
 *   (reader, acc) => ({ ...acc, port: reader.readInt("PORT", 8080) }),
 *   { port: 0 },
 * );
 * ```
 */
export const configure = async <T>(
  configureFn: ConfigureFn<T>,
  target?: Partial<T>,
  options?: LoaderOptions,
): Promise<T | undefined> => {
  const envMap = await loader.load(options);
  const envReader = reader.createEnvReader(envMap);

  const result = await configureFn(envReader, target as T);

  if (result === undefined || result === null) {
    return target as T | undefined;
  }

  return result as T;
};
