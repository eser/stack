import { type HexFunction } from "./function.ts";
import { type HexFunctionContext } from "./function-context.ts";
import { type HexFunctionInput } from "./function-input.ts";
import { type HexFunctionNext } from "./function-next.ts";
import {
  type HexFunctionResultAsyncGen,
  type HexFunctionResultIterable,
  type HexFunctionResultNonIterable,
} from "./function-result.ts";

const composer = <T>(
  ...functions: readonly HexFunction<T>[]
): HexFunction<T> => {
  return async function* (
    input: HexFunctionInput<T>,
    ctx: HexFunctionContext,
    _next?: HexFunctionNext,
  ): HexFunctionResultAsyncGen {
    let index = 0;
    let currentContext = ctx;

    const jump = async function* jump(
      newContext?: HexFunctionContext,
    ): HexFunctionResultAsyncGen {
      const current = functions[index];

      index += 1;
      if (newContext !== undefined) {
        currentContext = newContext;
      }

      const iterator = await current(
        input,
        currentContext,
        jump,
      );

      if (
        Symbol.iterator in Object(iterator) ||
        Symbol.asyncIterator in Object(iterator)
      ) {
        yield* (<HexFunctionResultIterable> iterator);

        return;
      }

      yield (<HexFunctionResultNonIterable> iterator);
    };

    const jumped = await jump(currentContext);
    yield* jumped;
  };
};

export { composer, composer as default };
