import HexFunction from "../types/function.ts";
import HexFunctionInput from "../types/functionInput.ts";
import HexFunctionContext from "../types/functionContext.ts";

function cli(target: HexFunction): void {
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
    },
  };

  const context: HexFunctionContext = {
    services: {},
  };

  // TODO no next yet
  target(input, context);
}

export {
  cli as default,
};
