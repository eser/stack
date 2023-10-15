import {
  type ResultAsyncGen,
  type ResultIterable,
  type ResultNonIterable,
} from "./results.ts";
import { type Context, type Fn, type NextFn } from "./functions.ts";

export const composer = <T>(
  ...functions: readonly Fn<T>[]
): Fn<T> => {
  return async function* (
    ctx?: Context<T>,
  ): ResultAsyncGen<T> {
    let index = 0;
    let currentContext = ctx;

    const jump: NextFn<T> = async function* <T>(
      newContext?: Context<T>,
    ): ResultAsyncGen<T> {
      const current = functions[index];

      index += 1;
      currentContext = {
        ...(newContext ?? currentContext ?? {}),
        next: jump,
      };

      const iterator = await current?.(currentContext);

      if (
        Symbol.iterator in Object(iterator) ||
        Symbol.asyncIterator in Object(iterator)
      ) {
        yield* (<ResultIterable<T>> iterator);

        return;
      }

      yield (<ResultNonIterable<T>> iterator);
    };

    const jumped = await jump(currentContext);
    yield* jumped;
  };
};

export { composer as default };
