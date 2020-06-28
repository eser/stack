import HexFunction from "../types/function.ts";
import HexFunctionInput from "../types/functionInput.ts";
import HexFunctionContext from "../types/functionContext.ts";
import runtime from "../runtime.ts";

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
    vars: {},
  };

  const output = await runtime(target, input, context);

  console.log(output);
}

export {
  cli as default,
};
