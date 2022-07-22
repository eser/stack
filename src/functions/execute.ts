import type HexFunction from "./function.ts";
import type HexFunctionContext from "./function-context.ts";
import type HexFunctionInput from "./function-input.ts";
import type {
  HexFunctionResultAsyncGen,
  HexFunctionResultIterable,
  HexFunctionResultNonIterable,
} from "./function-result.ts";

const getDefaultInput = function getDefaultInput(): HexFunctionInput {
  return {
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
    parameters: {
      ...Deno.args,
    },
  };
};

const execute = async function* execute(
  target: HexFunction,
  context?: HexFunctionContext,
  input?: HexFunctionInput,
): HexFunctionResultAsyncGen {
  const currentContext = context ?? {
    vars: {},
  };

  const iterator = await target(
    input ?? getDefaultInput(),
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

export { execute, execute as default };
