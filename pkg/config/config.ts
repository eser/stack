// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as primitives from "./primitives.ts";

export type ConfigState = {
  meta: Record<string, primitives.ConfigItemMeta>;
};

export const createConfigState = (): ConfigState => {
  return {
    meta: {},
  };
};

export class Config {
  readonly state: ConfigState;

  constructor(state?: ConfigState) {
    this.state = state ?? createConfigState();
  }

  setKeyMeta(key: string, meta: primitives.ConfigItemMeta) {
    this.state.meta[key] = meta;
  }
}
