// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// deno-lint-ignore no-explicit-any
export type First<T extends ReadonlyArray<any>> = T[0];

// deno-lint-ignore no-explicit-any
export type Last<T extends ReadonlyArray<any>> = T extends
  [...infer _Rest, infer Last] ? Last
  : never;

// deno-lint-ignore no-explicit-any
export type RemainingParameters<T1 extends any[], T2 extends any[]> =
  // deno-lint-ignore no-explicit-any
  T2 extends [any, ...infer T2Tail]
    // deno-lint-ignore no-explicit-any
    ? T1 extends [any, ...infer T1Tail] ? RemainingParameters<T1Tail, T2Tail>
    : []
    : T1;

// deno-lint-ignore no-explicit-any
export type RemainingParametersRight<T1 extends any[], T2 extends any[]> =
  // deno-lint-ignore no-explicit-any
  T2 extends [any, ...infer T2Tail]
    // deno-lint-ignore no-explicit-any
    ? T1 extends [...infer T1Tail, any]
      ? RemainingParametersRight<T1Tail, T2Tail>
    : []
    : T1;
