// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import type * as functions from "@eserstack/primitives/functions";
import type { ServiceKey, ServiceScope, ServiceValue } from "./primitives.ts";

const getFunctionParametersFromString = (fnSerialized: string) => {
  // Limit input length to prevent ReDoS on pathological inputs
  const limitedInput = fnSerialized.slice(0, 10000);

  const openIdx = limitedInput.indexOf("(");
  const arrowIdx = limitedInput.indexOf("=>");

  // An arrow whose "=>" comes before any "(" has a single parameter without
  // parentheses (`j => j()` or `async j => j()`). Node's type stripping keeps
  // the source text, so `toString()` returns this form as written.
  if (arrowIdx !== -1 && (openIdx === -1 || arrowIdx < openIdx)) {
    const head = limitedInput.slice(0, arrowIdx).trim();
    const param = head.startsWith("async ") ? head.slice(6).trim() : head;

    return param === "" ? [] : [param];
  }

  // Extract parameter list without regex — find first balanced parentheses
  if (openIdx === -1) return [];
  const closeIdx = limitedInput.indexOf(")", openIdx);
  if (closeIdx === -1) return [];
  const match = [
    limitedInput.slice(openIdx, closeIdx + 1),
    limitedInput.slice(openIdx + 1, closeIdx),
  ] as const;

  if (match?.[1]) {
    return match[1].split(",").map((p) => p.trim());
  }

  return [];
};

// oxlint-disable-next-line typescript/no-explicit-any
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
  // oxlint-disable-next-line typescript/no-explicit-any
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
