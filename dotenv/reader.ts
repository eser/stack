// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { defaultEnvValue, env, type EnvMap } from "./base.ts";

// type definitions
export interface EnvReader {
  getCurrentEnv(): string;
  readString<T extends string>(key: string, defaultValue: T): T;
  readString<T extends string>(key: string): T | undefined;
  readEnum<T extends string>(key: string, values: Array<T>, defaultValue: T): T;
  readEnum<T extends string>(key: string, values: Array<T>): T | undefined;
  readInt<T extends number>(key: string, defaultValue: T): T;
  readInt<T extends number>(key: string): T | undefined;
  readBool<T extends boolean>(key: string, defaultValue: T): T;
  readBool<T extends boolean>(key: string): T | undefined;
}

// public functions
export const createEnvReader = (state: EnvMap): EnvReader => {
  return {
    getCurrentEnv: () => state.get(env) ?? defaultEnvValue,
    readString: <T extends string>(
      key: string,
      defaultValue?: T,
    ): T | undefined => {
      return state.get(key) as T ?? defaultValue;
    },
    readEnum: <T extends string>(
      key: string,
      values: Array<T>,
      defaultValue?: T,
    ): T | undefined => {
      const value = state.get(key);

      if (value === undefined) {
        return defaultValue;
      }

      if (values.includes(value as T)) {
        return value as T;
      }

      return defaultValue;
    },
    readInt: <T extends number>(
      key: string,
      defaultValue?: T,
    ): T | undefined => {
      const value = state.get(key);

      if (value === undefined) {
        return defaultValue;
      }

      return parseInt(value, 10) as T;
    },
    readBool: <T extends boolean>(
      key: string,
      defaultValue?: T,
    ): T | undefined => {
      const value = state.get(key);

      if (value === undefined) {
        return defaultValue;
      }

      const sanitizedValue = value.trim().toLowerCase();

      if (["1", "true", true].includes(sanitizedValue)) {
        return true as T;
      }

      return false as T;
    },
  };
};
