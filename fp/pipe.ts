// Copyright 2023 the cool authors. All rights reserved. Apache-2.0 license.

import {
  type AnonymousFunction,
  type ArgList,
} from "../standards/functions.ts";

type ComposableFunction = AnonymousFunction;

export const pipe = (
  ...funcs: ReadonlyArray<ComposableFunction>
): ComposableFunction => {
  return funcs.reduce(
    (previousFunction, currentFunction) => (...args: ArgList) =>
      currentFunction(previousFunction(...args)),
  );
};

export { pipe as default };
