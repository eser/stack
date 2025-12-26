// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as functions from "@eser/primitives/functions";
import {
  type ServiceKey,
  type ServiceScope,
  type ServiceValue,
} from "./primitives.ts";

const getFunctionParametersFromString = (fnSerialized: string) => {
  const match = fnSerialized.match(/(?:function.*?\(|\()(.*?)(?:\)|=>)/);

  if (match && match[1]) {
    return match[1].split(",").map((p) => p.trim());
  }

  return [];
};

// deno-lint-ignore no-explicit-any
const getFunctionParameters = (fn: functions.GenericFunction<any, any>) => {
  return getFunctionParametersFromString(fn.toString());
};

// const analyzeParameter = (param: string) => {
//   const decoratorMatch = param.match(/@(\w+)\(([^)]+)\)/);
//   const defaultValueMatch = param.match(/(.*?)=(.*)/);
//   const isRestOrSpread = param.startsWith("...");

//   const decorators = [];
//   if (decoratorMatch) {
//     const [_, decoratorName, decoratorArgs] = decoratorMatch;
//     decorators.push({
//       name: decoratorName,
//       args: decoratorArgs!.split(",").map((arg) => arg.trim()),
//     });
//   }

//   const paramName = (isRestOrSpread ? param.substring(3) : param).trim();

//   if (defaultValueMatch) {
//     const [_, name, defaultValue] = defaultValueMatch;
//     return {
//       parameter: paramName,
//       defaultValue: defaultValue!.trim(),
//       isRestOrSpread: isRestOrSpread,
//       decorators: decorators,
//     };
//   } else {
//     return {
//       parameter: paramName,
//       defaultValue: null,
//       isRestOrSpread: isRestOrSpread,
//       decorators: decorators,
//     };
//   }
// };

export const invoke = <
  // deno-lint-ignore no-explicit-any
  T extends functions.GenericFunction<ReturnType<T>, any>,
  K = ServiceKey,
  V = ServiceValue,
>(
  scope: ServiceScope<K, V>,
  fn: T,
): ReturnType<T> => {
  const params = getFunctionParameters(fn) as Array<K>;

  const values = scope.getMany(...params);

  return fn(...values);
};
