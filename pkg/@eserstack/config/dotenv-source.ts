// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as primitives from "./primitives.ts";

/** The state of a `DotenvSource`. */
export type DotenvSourceState = primitives.SourceState;

/** Creates the state of a `DotenvSource`, with the id `"dotenv"`. */
export const createDotenvSourceState = (): DotenvSourceState => {
  return {
    id: "dotenv",
  };
};

/**
 * A configuration source for `.env` files. It does not read values yet: each
 * method resolves to the default value it is given.
 */
export class DotenvSource implements primitives.Source {
  /** The id of this source. */
  readonly state: DotenvSourceState;

  /**
   * Creates the source.
   *
   * @param state - Existing state to use; `createDotenvSourceState()` when
   *   absent
   */
  constructor(state?: DotenvSourceState) {
    this.state = state ?? createDotenvSourceState();
  }

  /** Resolves to `defaultValue`. */
  getBooleanValue(
    _flagKey: string,
    defaultValue: boolean,
    _requestContext?: primitives.RequestContext,
  ): Promise<boolean> {
    return Promise.resolve(defaultValue);
  }

  /** Resolves to `defaultValue`. */
  getNumberValue<T = number>(
    _flagKey: string,
    defaultValue: T,
    _requestContext?: primitives.RequestContext,
  ): Promise<T> {
    return Promise.resolve(defaultValue);
  }

  /** Resolves to `defaultValue`. */
  getObjectValue<T>(
    _flagKey: string,
    defaultValue: T,
    _requestContext?: primitives.RequestContext,
  ): Promise<T> {
    return Promise.resolve(defaultValue);
  }

  /** Resolves to `defaultValue`. */
  getStringValue<T = string>(
    _flagKey: string,
    defaultValue: T,
    _requestContext?: primitives.RequestContext,
  ): Promise<T> {
    return Promise.resolve(defaultValue);
  }
}
