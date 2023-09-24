import {
  type ServiceKey,
  type ServiceScope,
  type ServiceValue,
} from "./primitives.ts";

function getFunctionParametersFromString(fnSerialized: string) {
  const match = fnSerialized.match(/(?:function.*?\(|\()(.*?)(?:\)|=>)/);
  if (match && match[1]) {
    return match[1].split(",").map((p) => p.trim());
  }

  return [];
}

// deno-lint-ignore no-explicit-any
function getFunctionParameters(fn: (...args: any) => any) {
  return getFunctionParametersFromString(fn.toString());
}

// function analyzeParameter(param: string) {
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

//   const paramName = (isRestOrSpread ? param.substr(3) : param).trim();

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
// }

export const invoke = <
  // deno-lint-ignore no-explicit-any
  T extends (...args: any) => any,
  K = ServiceKey,
  V = ServiceValue,
>(
  scope: ServiceScope<K, V>,
  fn: T,
): ReturnType<T> => {
  const params = getFunctionParameters(fn) as K[];

  const values = scope.getMany(...params);

  return fn(...values);
};
