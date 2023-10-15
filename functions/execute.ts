import {
  type ResultAsyncGen,
  type ResultIterable,
  type ResultNonIterable,
} from "./results.ts";
import { type Context, type Fn } from "./functions.ts";

export const fnExec = function <T>(
  target: Fn<T>,
  context: Context<T> = {},
  // deno-lint-ignore no-explicit-any
  ...args: any[]
): ResultNonIterable<T> {
  const result = target(
    context,
    ...args,
  );

  return result as ResultNonIterable<T>;
};

export const fnIter = async function* <T>(
  target: Fn<T>,
  context: Context<T> = {},
  // deno-lint-ignore no-explicit-any
  ...args: any[]
): ResultAsyncGen<T> {
  const iterator = await target(
    context,
    ...args,
  );

  if (iterator === undefined) {
    return;
  }

  if (
    Symbol.iterator in Object(iterator) ||
    Symbol.asyncIterator in Object(iterator)
  ) {
    yield* (<ResultIterable<T>> iterator);

    return;
  }

  yield (<ResultNonIterable<T>> iterator);
};
