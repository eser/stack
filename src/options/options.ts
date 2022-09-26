import { loadEnv, type LoadEnvOptions, type LoadEnvResult } from "./env.ts";

// interface definitions
interface BaseOptions {
  envName: string;
}

type Options<T> = BaseOptions & Partial<T>;

interface WrappedEnv {
  readString: <T extends string>(
    key: string,
    defaultValue?: T,
  ) => T | undefined;
  readEnum: <T extends string>(
    key: string,
    values: T[],
    defaultValue?: T,
  ) => T | undefined;
  readInt: <T extends number>(key: string, defaultValue?: T) => T | undefined;
  readBool: <T extends boolean>(key: string, defaultValue?: T) => T | undefined;
}

// public functions
const wrapEnv = (env: LoadEnvResult): WrappedEnv => {
  return {
    readString: <T extends string>(
      key: string,
      defaultValue?: T,
    ): T | undefined => {
      return env[key] as T ?? defaultValue;
    },
    readEnum: <T extends string>(
      key: string,
      values: T[],
      defaultValue?: T,
    ): T | undefined => {
      if (env[key] === undefined) {
        return defaultValue;
      }

      if (values.includes(env[key] as T)) {
        return env[key] as T;
      }

      return defaultValue;
    },
    readInt: <T extends number>(
      key: string,
      defaultValue?: T,
    ): T | undefined => {
      if (env[key] === undefined) {
        return defaultValue;
      }

      return parseInt(env[key], 10) as T;
    },
    readBool: <T extends boolean>(
      key: string,
      defaultValue?: T,
    ): T | undefined => {
      if (env[key] === undefined) {
        return defaultValue;
      }

      if (["1", "true", true].includes(env[key].trim().toLowerCase())) {
        return true as T;
      }

      return false as T;
    },
  };
};

const loadOptions = async <T>(
  loader: (
    wrappedEnv: WrappedEnv,
    options: Options<T>,
  ) => Promise<Options<T> | void> | Options<T> | void,
  options?: LoadEnvOptions,
): Promise<Options<T>> => {
  const env = await loadEnv(options);
  const wrappedEnv = wrapEnv(env);

  // @ts-ignore FIXME: why does this not work?
  const newOptions: Options<T> = {
    envName: env.name,
  };

  const result = await loader(wrappedEnv, newOptions);

  return result ?? newOptions;
};

export { type LoadEnvOptions, loadOptions, type Options };
