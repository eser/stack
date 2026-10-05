// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as base from "./base.ts";
import type { EnvMap } from "./base.ts";

/**
 * Reads typed values from loaded environment variables. Each method returns
 * `defaultValue` when the variable is not set.
 */
export interface EnvReader {
  /** Returns the environment name, such as `"production"`. */
  getCurrentEnv(): string;
  /** Returns the variable as a string, or `defaultValue` when it is unset. */
  readString<T extends string>(key: string, defaultValue: T): T;
  /** Returns the variable as a string, or `undefined` when it is unset. */
  readString<T extends string>(key: string): T | undefined;
  /**
   * Returns the variable when it is one of `values`, otherwise
   * `defaultValue`.
   */
  readEnum<T extends string>(key: string, values: Array<T>, defaultValue: T): T;
  /** Returns the variable when it is one of `values`, otherwise `undefined`. */
  readEnum<T extends string>(key: string, values: Array<T>): T | undefined;
  /**
   * Returns the variable parsed as a base-10 integer (`NaN` when it is not a
   * number), or `defaultValue` when it is unset.
   */
  readInt<T extends number>(key: string, defaultValue: T): T;
  /**
   * Returns the variable parsed as a base-10 integer (`NaN` when it is not a
   * number), or `undefined` when it is unset.
   */
  readInt<T extends number>(key: string): T | undefined;
  /**
   * Returns `true` for `1` or `true` in any case, `false` for any other
   * value, and `defaultValue` when the variable is unset.
   */
  readBool<T extends boolean>(key: string, defaultValue: T): T;
  /**
   * Returns `true` for `1` or `true` in any case, `false` for any other
   * value, and `undefined` when the variable is unset.
   */
  readBool<T extends boolean>(key: string): T | undefined;
}

/**
 * Creates a reader over loaded variables.
 *
 * @param state - The variables, as returned by `load()`
 * @returns The reader
 */
export const createEnvReader = (state: EnvMap): EnvReader => {
  return {
    getCurrentEnv: () => state.get(base.env) ?? base.defaultEnvValue,
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
