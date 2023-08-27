import { type HexFunction } from "./function.ts";
import { type HexFunctionContext } from "./function-context.ts";
import { type HexFunctionInput } from "./function-input.ts";
import {
  type HexFunctionResultAsyncGen,
  type HexFunctionResultIterable,
  type HexFunctionResultNonIterable,
} from "./function-result.ts";

export const execute = async function* <T>(
  target: HexFunction<T>,
  input: HexFunctionInput<T>,
  context?: HexFunctionContext,
): HexFunctionResultAsyncGen {
  const currentContext = context ?? {
    vars: {},
  };

  const iterator = await target(
    input,
    currentContext,
  );

  if (iterator === undefined) {
    return;
  }

  if (
    Symbol.iterator in Object(iterator) ||
    Symbol.asyncIterator in Object(iterator)
  ) {
    yield* (<HexFunctionResultIterable> iterator);

    return;
  }

  yield (<HexFunctionResultNonIterable> iterator);
};

export const executeFromCli = (
  target: HexFunction,
  context?: HexFunctionContext,
): HexFunctionResultAsyncGen => {
  const input: HexFunctionInput = {
    platform: {
      type: "cli",
      name: "",
    },
    event: {
      name: "Command",
    },
    requestedFormat: {
      mimetype: "",
      format: "",
    },
    params: {
      ...Deno.args,
    },
  };

  return execute(target, input, context);
};

export { execute as default };
