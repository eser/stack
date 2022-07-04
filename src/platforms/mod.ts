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

  const iterator: HexFunctionResult = await execute(
    target,
    currentContext,
    input ?? getDefaultInput(),
  );

  if (
    Symbol.iterator in Object(iterator) ||
    Symbol.asyncIterator in Object(iterator)
  ) {
    for await (
      const result of <
        | HexFunctionResultAsyncGen
        | HexFunctionResultGen
      > iterator
    ) {
      console.log(result);
    }

    return;
  }

  console.log(iterator);
};

const entryPoint = function entryPoint(input: HexFunctionInput) {
  const to = input.parameters[0] ?? "world";
  const message = `hello ${to}`;

  return results.text(message);
};

main(entryPoint);
