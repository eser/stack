// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as functions from "@eser/standards/functions";
import * as utilities from "@eser/standards/utilities";

export const curryRight = <
  // deno-lint-ignore no-explicit-any
  TF extends functions.GenericFunction<any, any>,
  TP extends Partial<Parameters<TF>>,
>(func: TF, ...argsOnRight: TP): (
  ...argsOnLeft: utilities.RemainingParametersRight<Parameters<TF>, TP>
) => ReturnType<TF> => {
  return (
    ...argsOnLeft: utilities.RemainingParametersRight<Parameters<TF>, TP>
  ) => func(...argsOnLeft, ...argsOnRight);
};

export { curryRight as default };
