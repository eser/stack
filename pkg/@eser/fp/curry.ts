// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as functions from "@eser/standards/functions";
import * as utilities from "@eser/standards/utilities";

export const curry = <
  // deno-lint-ignore no-explicit-any
  TF extends functions.GenericFunction<any, any>,
  TP extends Partial<Parameters<TF>>,
>(func: TF, ...argsOnLeft: TP): (
  ...argsOnRight: utilities.RemainingParameters<Parameters<TF>, TP>
) => ReturnType<TF> => {
  return (...argsOnRight: utilities.RemainingParameters<Parameters<TF>, TP>) =>
    func(...argsOnLeft, ...argsOnRight);
};

export { curry as default };
