import { loadEnv, type LoadEnvOptions, type LoadEnvResult } from "./env.ts";

// interface definitions
interface BaseOptions {
  envName: string;
}

type Options<T> = BaseOptions & T;

interface EnvReader {
  envName: string;
  readString<T extends string>(key: string, defaultValue: T): T;
  readString<T extends string>(key: string): T | undefined;
  readEnum<T extends string>(key: string, values: T[], defaultValue: T): T;
  readEnum<T extends string>(key: string, values: T[]): T | undefined;
  readInt<T extends number>(key: string, defaultValue: T): T;
  readInt<T extends number>(key: string): T | undefined;
  readBool<T extends boolean>(key: string, defaultValue: T): T;
  readBool<T extends boolean>(key: string): T | undefined;
}

type LoaderFn<T> = (
  envReader: EnvReader,
  options: Options<T>,
) => Promise<Options<T> | void> | Options<T> | void;

interface BuilderResult<T> {
  load: (loaderFn: LoaderFn<T>) => Promise<void>;
  build: () => Options<T>;
}

// public functions
const createEnvReader = (env: LoadEnvResult): EnvReader => {
  return {
    envName: env.name,
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

      const sanitizedValue = env[key].trim().toLowerCase();

      if (["1", "true", true].includes(sanitizedValue)) {
        return true as T;
      }

      return false as T;
    },
  };
};

const loadEnvAndCreateEnvReader = async (
  options?: LoadEnvOptions,
): Promise<[LoadEnvResult, EnvReader]> => {
  const env = await loadEnv(options);
  const envReader = createEnvReader(env);

  return [env, envReader];
};

const createBuilder = async <T>(
  options?: LoadEnvOptions,
): Promise<BuilderResult<T>> => {
  const [env, envReader] = await loadEnvAndCreateEnvReader(options);

  const newOptions: Options<T>[] = [
    // @ts-ignore FIXME: why does this not work?
    {
      envName: env.name,
    },
  ];

  return {
    load: async (loaderFn: LoaderFn<T>): Promise<void> => {
      const result = await loaderFn(envReader, newOptions[0]);

      if (result !== undefined) {
        newOptions[0] = result;
      }
    },

    build: (): Options<T> => {
      return newOptions[0];
    },
  };
};

const loadOptions = async <T>(
  loaderFn: LoaderFn<T>,
  options?: LoadEnvOptions,
): Promise<Options<T>> => {
  const [env, envReader] = await loadEnvAndCreateEnvReader(options);

  // @ts-ignore FIXME: why does this not work?
  const newOptions: Options<T> = {
    envName: env.name,
  };

  const result = await loaderFn(envReader, newOptions);

  return result ?? newOptions;
};

export {
  createBuilder,
  type LoadEnvOptions,
  type LoaderFn,
  loadOptions,
  type Options,
};
