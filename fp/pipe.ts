// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { type ArgList, type GenericFunction } from "../standards/functions.ts";

type ComposableFunction = GenericFunction;

export const pipe = (
  ...funcs: ReadonlyArray<ComposableFunction>
): ComposableFunction => {
  return funcs.reduce(
    (previousFunction, currentFunction) => (...args: ArgList) =>
      currentFunction(previousFunction(...args)),
  );
};

export { pipe as default };
