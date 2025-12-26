// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as functions from "@eser/primitives/functions";
import * as typeSlices from "@eser/primitives/type-slices";

export const curry = <
  // deno-lint-ignore no-explicit-any
  TF extends functions.GenericFunction<any, any>,
  TP extends Partial<Parameters<TF>>,
>(func: TF, ...argsOnLeft: TP): (
  ...argsOnRight: typeSlices.RemainingParameters<Parameters<TF>, TP>
) => ReturnType<TF> => {
  return (...argsOnRight: typeSlices.RemainingParameters<Parameters<TF>, TP>) =>
    func(...argsOnLeft, ...argsOnRight);
};

export { curry as default };
