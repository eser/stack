// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { type Promisable } from "../standards/promises.ts";
import { env } from "./base.ts";
import { load, type LoaderOptions } from "./loader.ts";
import { createEnvReader, type EnvReader } from "./reader.ts";

// type definitions
export type BaseEnvVariables = {
  [env]: string;
};

export type EnvVariables = BaseEnvVariables & Record<string, unknown>;

export type ConfigureFn<T = EnvVariables> = (
  reader: EnvReader,
  target: T,
) => Promisable<T | void>;

// public functions
export const configure = async <T>(
  configureFn: ConfigureFn<T>,
  target?: Partial<T>,
  options?: LoaderOptions,
): Promise<T | undefined> => {
  const envMap = await load(options);
  const reader = createEnvReader(envMap);

  const result = await configureFn(reader, target as T);

  return result ?? Promise.resolve(target as T);
};
