import {
  execute,
  HexFunction,
  HexFunctionContext,
  HexFunctionInput,
  HexFunctionResult,
  HexFunctionResultAsyncGen,
  HexFunctionResultGen,
  results,
} from "../functions/mod.ts";

// formatters
import textPlainFormatter from "../formatters/text-plain.ts";
import { findByName } from "../formatters/registry.ts";

const formatters = [textPlainFormatter];

// default input
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

const main = async function main(
  target: HexFunction,
  context?: HexFunctionContext,
  input?: HexFunctionInput,
): Promise<void> {
  const textFormatter = findByName(formatters, "text/plain");

  const currentContext = context ?? {
    vars: {},
  };

  const iterator = await execute(
    target,
    currentContext,
    input ?? getDefaultInput(),
  );

  for await (
    const result of iterator
  ) {
    console.log(result);
  }
};

const entryPoint = function* entryPoint(
  input: HexFunctionInput,
) {
  yield results.text("testing");
  yield results.text("something");
};

main(entryPoint);
