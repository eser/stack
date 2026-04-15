// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as primitives from "./primitives.ts";

export type DotenvSourceState = primitives.SourceState;

export const createDotenvSourceState = (): DotenvSourceState => {
  return {
    id: "dotenv",
  };
};

export class DotenvSource implements primitives.Source {
  readonly state: DotenvSourceState;

  constructor(state?: DotenvSourceState) {
    this.state = state ?? createDotenvSourceState();
  }

  getBooleanValue(
    _flagKey: string,
    defaultValue: boolean,
    _requestContext?: primitives.RequestContext,
  ): Promise<boolean> {
    return Promise.resolve(defaultValue);
  }

  getNumberValue<T = number>(
    _flagKey: string,
    defaultValue: T,
    _requestContext?: primitives.RequestContext,
  ): Promise<T> {
    return Promise.resolve(defaultValue);
  }

  getObjectValue<T>(
    _flagKey: string,
    defaultValue: T,
    _requestContext?: primitives.RequestContext,
  ): Promise<T> {
    return Promise.resolve(defaultValue);
  }

  getStringValue<T = string>(
    _flagKey: string,
    defaultValue: T,
    _requestContext?: primitives.RequestContext,
  ): Promise<T> {
    return Promise.resolve(defaultValue);
  }
}
