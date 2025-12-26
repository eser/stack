// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as functions from "@eser/primitives/functions";

// deno-lint-ignore no-explicit-any
type ComposableFunction = functions.GenericFunction<any, any>;

export const compose = (
  ...funcs: functions.ArgList<ComposableFunction>
): ComposableFunction => {
  return funcs.reduce(
    (previousFunction, currentFunction) =>
    // deno-lint-ignore no-explicit-any
    (...args: functions.ArgList<any>) =>
      previousFunction(currentFunction(...args)),
  );
};

export { compose as default };
