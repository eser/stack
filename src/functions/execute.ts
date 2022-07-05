import type HexFunction from "./function.ts";
import type HexFunctionContext from "./function-context.ts";
import type HexFunctionInput from "./function-input.ts";
import type {
  HexFunctionResult,
  HexFunctionResultAsyncGen,
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
): HexFunctionResult {
  const currentContext = context ?? {
    vars: {},
  };

  const iterator = await target(
    input ?? getDefaultInput(),
    currentContext,
  );

  if (
    Symbol.iterator in Object(iterator) ||
    Symbol.asyncIterator in Object(iterator)
  ) {
    yield* <HexFunctionResultAsyncGen> iterator;

    return;
  }

  yield iterator;
};

export { execute, execute as default };
