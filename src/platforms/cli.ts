import HexFunction from "../abstractions/function.ts";
import HexFunctionInput from "../abstractions/functionInput.ts";
import HexFunctionContext from "../abstractions/functionContext.ts";
import runtime from "../core/runtime.ts";

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
