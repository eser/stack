// Copyright 2023-present the cool authors. All rights reserved. Apache-2.0 license.

import { type ArgList } from "../standards/functions.ts";

// deno-lint-ignore no-explicit-any
export type AcceptableResult = any;

// deno-lint-ignore no-explicit-any
export type State = Record<string | symbol, any>;

export type Context<
  TR = AcceptableResult,
  TS extends State = State,
> = {
  state: TS;
  next: () => AsyncGenerator<TR>;
};

export type FnResult<TR = AcceptableResult> =
  | AsyncGenerator<TR>
  | Generator<TR>
  | Promise<TR>
  | TR
  | Promise<void>
  | void;

export interface Fn<
  TR = AcceptableResult,
  TS extends State = State,
> {
  (context: Context<TR, TS>, ...args: ArgList): FnResult<TR>;
}

export type Pipeline<
  TR = AcceptableResult,
  TS extends State = State,
> = {
  use: (...fns: ReadonlyArray<Fn<TR, TS>>) => Pipeline<TR, TS>;
  set: (fn: Fn<TR, TS>) => Pipeline<TR, TS>;
  iterate: (...args: ArgList) => AsyncGenerator<TR>;
  run: (...args: ArgList) => Promise<Array<TR>>;
};

export const fn = function <
  TR = AcceptableResult,
  TS extends State = State,
>(...fns: ReadonlyArray<Fn<TR, TS>>) {
  let target = fns.at(-1);
  const stack = fns.slice(0, -1);

  const use = function (
    this: Pipeline<TR, TS>,
    ...fns: ReadonlyArray<Fn<TR, TS>>
  ) {
    stack.push(...fns);

    return this;
  };

  const set = function (this: Pipeline<TR, TS>, fn: Fn<TR, TS>) {
    target = fn;

    return this;
  };

  const iterate = async function* (
    this: Pipeline<TR, TS>,
    ...args: ArgList
  ) {
    let prevIndex = -1;

    const jumper = async function* (index: number): AsyncGenerator<TR> {
      if (index === prevIndex) {
        throw new Error("next() called multiple times");
      }

      prevIndex = index;

      const newContext = {
        state: <TS> {},
        next: () => jumper(index + 1),
      };

      const nextFn = (index === stack.length) ? target : stack[index];
      const result: FnResult<TR> | undefined = nextFn?.(newContext, ...args);
      const resultC = result?.constructor;

      if (resultC === undefined) {
        return;
      }

      if (
        (Symbol.asyncIterator in Object(result)) ||
        (Symbol.iterator in Object(result))
      ) {
        yield* (result as AsyncGenerator<TR>);
        return;
      }

      if (resultC === Promise) {
        yield await (result as Promise<TR>);
        return;
      }

      yield (result as TR);
    };

    yield* jumper(0);
  };

  const run = async function (this: Pipeline<TR, TS>, ...args: ArgList) {
    const results: Array<TR> = [];

    for await (const item of this.iterate(...args)) {
      results.push(item);
    }

    return results;
  };

  return <Pipeline<TR, TS>> {
    use,
    set,
    iterate,
    run,
  };
};
