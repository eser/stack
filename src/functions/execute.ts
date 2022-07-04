import type HexFunction from "./function.ts";
import type HexFunctionContext from "./function-context.ts";
import type HexFunctionInput from "./function-input.ts";
import type HexFunctionResult from "./function-result.ts";

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

  // {
  //   platform: {
  //     type: "web",
  //     name: "",
  //   },
  //   event: {
  //     name: "Request",
  //   },
  //   requestedFormat: {
  //     mimetype: "",
  //     format: "",
  //   },
  //   parameters: {},
  // }
};

const execute = async function execute(
  target: HexFunction,
  context?: HexFunctionContext,
  input?: HexFunctionInput,
): Promise<void> {
  const currentContext = context ?? {
    vars: {},
  };

  const iterator: HexFunctionResult = target(
    input ?? getDefaultInput(),
    currentContext,
  );

  if (Symbol.iterator in Object(iterator)) {
    for await (const result of <Iterable<HexFunctionResult | void>> iterator) {
      console.log(result);
    }

    return;
  }

  console.log(iterator);
};

export { execute, execute as default };
