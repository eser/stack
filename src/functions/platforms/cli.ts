import { HexContext } from "../abstractions/context.ts";
import { HexFunctionInput } from "../abstractions/functionInput.ts";
import { HexPlatform } from "../abstractions/platform.ts";

function getContext(): HexContext {
  return {
    services: {},
    vars: {},
  };
}

function getDefaultInput(): HexFunctionInput {
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
}

async function commitResult(result: Promise<string>): Promise<void> {
  console.log(await result);
}

const cli: HexPlatform = {
  getContext,
  getDefaultInput,
  commitResult,
};

export {
  cli,
};
