import { type Generatable, type Promisable } from "../standards/promises.ts";
import { type ArgList } from "../standards/functions.ts";

export type Context<T, TR> = {
  next: () => Generatable<TR>;
} & T;

export type Fn<T, TR> = (
  context: Context<T, TR>,
  ...args: ArgList
) => Generatable<TR> | Promisable<TR> | Promisable<void>;

export type Pipeline<T, TR> = {
  use: (...fns: Array<Fn<T, TR>>) => Pipeline<T, TR>;
  set: (fn: Fn<T, TR>) => Pipeline<T, TR>;
  iterate: (...args: ArgList) => Generatable<TR>;
  run: (...args: ArgList) => Promisable<Array<TR>>;
};

export const nullFn = async function* () {};

export const fn = function <T, TR>(...fns: Array<Fn<T, TR>>): Pipeline<T, TR> {
  let target: Fn<T, TR> = fns.pop() ?? nullFn;
  const stack: Array<Fn<T, TR>> = fns;

  const use = function (this: Pipeline<T, TR>, ...fns: Array<Fn<T, TR>>) {
    stack.push(...fns);

    return this;
  };

  const set = function (this: Pipeline<T, TR>, fn: Fn<T, TR>) {
    target = fn;

    return this;
  };

  const iterate = async function* (this: Pipeline<T, TR>, ...args: ArgList) {
    let prevIndex = -1;
    const context = {} as Context<T, TR>;

    const jumper = async function* (index: number) {
      if (index === prevIndex) {
        throw new Error("next() called multiple times");
      }

      prevIndex = index;

      const newContext = {
        ...context,
        next: async function* () {
          yield* await jumper(index + 1);
        },
      };

      const nextFn = (index === stack.length) ? target : stack[index];
      if (nextFn === undefined) {
        return;
      }

      // deno-lint-ignore no-explicit-any
      const result: any = await nextFn(newContext, ...args);

      if (
        Symbol.iterator in Object(result) ||
        Symbol.asyncIterator in Object(result)
      ) {
        yield* result;
        return;
      }

      yield result;
    };

    yield* await jumper(0);
  };

  const run = async function (this: Pipeline<T, TR>, ...args: ArgList) {
    const results: Array<TR> = [];

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
