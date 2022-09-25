import { loadEnv, type LoadEnvOptions, type LoadEnvResult } from "./env.ts";

// interface definitions
interface BaseOptions {
  envName: string;
}

type Options<T> = BaseOptions & Partial<T>;

interface WrappedEnv {
  readString: (key: string, defaultValue?: string) => string | undefined;
  readEnum: (
    key: string,
    values: string[],
    defaultValue?: string,
  ) => string | undefined;
  readInt: (key: string, defaultValue?: number) => number | undefined;
  readBool: (key: string, defaultValue?: boolean) => boolean | undefined;
}

// public functions
const wrapEnv = (env: LoadEnvResult): WrappedEnv => {
  return {
    readString: (key: string, defaultValue?: string): string | undefined => {
      return env[key] ?? defaultValue;
    },
    readEnum: (
      key: string,
      values: string[],
      defaultValue?: string,
    ): string | undefined => {
      if (env[key] === undefined) {
        return defaultValue;
      }

      if (values.includes(env[key])) {
        return env[key];
      }

      return defaultValue;
    },
    readInt: (key: string, defaultValue?: number): number | undefined => {
      if (env[key] === undefined) {
        return defaultValue;
      }

      return parseInt(env[key], 10);
    },
    readBool: (key: string, defaultValue?: boolean): boolean | undefined => {
      if (env[key] === undefined) {
        return defaultValue;
      }

      if (["1", "true", true].includes(env[key].trim().toLowerCase())) {
        return true;
      }

      return false;
    },
  };
};

const loadOptions = async <T>(
  loader: (wrappedEnv: WrappedEnv, options: Options<T>) => Options<T>,
  options?: LoadEnvOptions,
): Promise<Options<T>> => {
  const env = await loadEnv(options);
  const wrappedEnv = wrapEnv(env);

  // @ts-ignore FIXME: why does this not work?
  const newOptions: Options<T> = {
    envName: env.name,
  };

  const result = loader(wrappedEnv, newOptions);

  return result ?? newOptions;
};

export { type LoadEnvOptions, loadOptions, type Options };
