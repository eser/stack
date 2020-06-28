import HexFunction from "../types/function.ts";
import HexFunctionInput from "../types/functionInput.ts";
import HexFunctionContext from "../types/functionContext.ts";
import formatter from "../formatters/text-plain.ts";

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

  const result = target(input, context);
  const output = await formatter(result);

  console.log(output);
}

export {
  cli as default,
};
