// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as primitives from "./primitives.ts";

/** The state of a `Config`: the metadata of each key, by key. */
export type ConfigState = {
  meta: Record<string, primitives.ConfigItemMeta>;
};

/** Creates an empty `ConfigState`. */
export const createConfigState = (): ConfigState => {
  return {
    meta: {},
  };
};

/** Holds the metadata of configuration keys. */
export class Config {
  /** Metadata of each key, by key. */
  readonly state: ConfigState;

  /**
   * Creates a config.
   *
   * @param state - Existing state to use; a new empty state when absent
   */
  constructor(state?: ConfigState) {
    this.state = state ?? createConfigState();
  }

  /**
   * Sets the metadata of a key, replacing any metadata it had.
   *
   * @param key - The configuration key
   * @param meta - Its description, type, time to live and disallowed sources
   */
  setKeyMeta(key: string, meta: primitives.ConfigItemMeta): void {
    this.state.meta[key] = meta;
  }
}
