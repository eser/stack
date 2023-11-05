import { type Generatable, type Promisable } from "../standards/promises.ts";
import { type ArgList, nullAsyncGeneratorFn } from "../standards/functions.ts";

export type Context<T = unknown> = {
  next: () => AsyncGenerator<T>;
};

export type Fn<T> = (
  context: Context<T>,
  ...args: ArgList
) => Generatable<T> | Promisable<T> | Promisable<void>;

export type Pipeline<T> = {
  use: (...fns: ReadonlyArray<Fn<T>>) => Pipeline<T>;
  set: (fn: Fn<T>) => Pipeline<T>;
  iterate: (...args: ArgList) => AsyncGenerator<T>;
  run: (...args: ArgList) => Promise<Array<T>>;
};

export const fn = function <T>(...fns: ReadonlyArray<Fn<T>>): Pipeline<T> {
  let target: Fn<T> = fns.at(-1) ?? nullAsyncGeneratorFn;
  const stack: Array<Fn<T>> = fns.slice(0, -1);

  const use = function (this: Pipeline<T>, ...fns: ReadonlyArray<Fn<T>>) {
    stack.push(...fns);

    return this;
  };

  const set = function (this: Pipeline<T>, fn: Fn<T>) {
    target = fn;

    return this;
  };

  const iterate = async function* (
    this: Pipeline<T>,
    ...args: ArgList
  ): AsyncGenerator<T> {
    let prevIndex = -1;

    const jumper = async function* (index: number): AsyncGenerator<T> {
      if (index === prevIndex) {
        throw new Error("next() called multiple times");
      }

      prevIndex = index;

      const newContext: Context<T> = {
        next: () => jumper(index + 1),
      };

      const nextFn = (index === stack.length) ? target : stack[index];
      const result = nextFn?.(newContext, ...args);

      if (result?.constructor === undefined) {
        return;
      }

      if (
        (Symbol.asyncIterator in (result as AsyncGenerator<T>)) ||
        (Symbol.iterator in (result as Generator<T>))
      ) {
        yield* (result as Generator<T>);
        return;
      }

      if (result?.constructor === Promise) {
        yield await (result as Promise<T>);
        return;
      }

      yield result as T;
    };

    yield* jumper(0);
  };

  const run = async function (this: Pipeline<T>, ...args: ArgList) {
    const results: Array<T> = [];

    for await (const item of this.iterate(...args)) {
      results.push(item);
    }

    return results;
  };

  return {
    use,
    set,
    iterate,
    run,
  };
};
