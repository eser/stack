import { env } from "./base.ts";
import { load, type LoaderOptions } from "./loader.ts";
import { createEnvReader, type EnvReader } from "./reader.ts";

// interface definitions
export type Promisable<T> = PromiseLike<T> | T;

export interface BaseEnvVariables {
  [env]: string;
}

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
