// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// Types for the lodash.* packages the benches compare against. They ship no
// declarations, and each is CommonJS whose module.exports is one function, so
// Node exposes it as the namespace's `default`. Only the call forms the benches
// use are declared.

declare module "lodash.chunk" {
  const chunk: <T>(array: ReadonlyArray<T>, size?: number) => Array<Array<T>>;
  export default chunk;
}

declare module "lodash.get" {
  const get: (
    object: unknown,
    path: string | ReadonlyArray<PropertyKey>,
    defaultValue?: unknown,
  ) => unknown;
  export default get;
}

declare module "lodash.groupby" {
  const groupBy: <T>(
    collection: ReadonlyArray<T>,
    iteratee: (value: T) => PropertyKey,
  ) => Record<string, Array<T>>;
  export default groupBy;
}

declare module "lodash.keyby" {
  const keyBy: <T>(
    collection: ReadonlyArray<T>,
    iteratee: (value: T) => PropertyKey,
  ) => Record<string, T>;
  export default keyBy;
}

declare module "lodash.memoize" {
  const memoize: <F extends (...args: never[]) => unknown>(
    func: F,
    resolver?: (...args: Parameters<F>) => unknown,
  ) => F;
  export default memoize;
}
