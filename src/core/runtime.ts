import HexFunction from "../abstractions/function.ts";
import HexFunctionInput from "../abstractions/functionInput.ts";
import HexFunctionContext from "../abstractions/functionContext.ts";
import HexFunctionResult from "../abstractions/functionResult.ts";
import HexFormatter from "../abstractions/formatter.ts";
import textPlainFormatter from "../formatters/text-plain.ts";

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
