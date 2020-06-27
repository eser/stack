import HexFunction from "../types/function.ts";
import HexFunctionInput from "../types/functionInput.ts";
import HexFunctionContext from "../types/functionContext.ts";

async function cli(target: HexFunction): Promise<void> {
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
    parameters: {
      ...Deno.args,
    },
  };

  const context: HexFunctionContext = {
    services: {},
  };

  // TODO no next yet
  const result = await target(input, context);

  console.log(result.payload);
}

export {
  cli as default,
};
