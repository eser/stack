import HexFunction from "./types/function.ts";
import HexFunctionInput from "./types/functionInput.ts";
import HexFunctionContext from "./types/functionContext.ts";
import HexFunctionResult from "./types/functionResult.ts";
import HexFormatter from "./types/formatter.ts";
import textPlainFormatter from "./formatters/text-plain.ts";

function pickProperFormatter(): HexFormatter {
  // TODO for now there's only text/plain formatter
  return textPlainFormatter;
}

function runtime(
  target: HexFunction,
  input: HexFunctionInput,
  context: HexFunctionContext,
): Promise<string> {
  const formatter: HexFormatter = pickProperFormatter();
  const result: HexFunctionResult = target(input, context);

  return formatter(result);
}

export {
  runtime as default,
};
