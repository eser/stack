import HexContext from "../abstractions/context.ts";
import HexFunction from "../abstractions/function.ts";
import HexFunctionInput from "../abstractions/functionInput.ts";
import HexFunctionNext from "../abstractions/functionNext.ts";
import HexFunctionResult from "../abstractions/functionResult.ts";

function composer(...functions: Array<HexFunction>): HexFunction {
  return function (
    input: HexFunctionInput,
    context: HexContext,
    next?: HexFunctionNext,
  ): HexFunctionResult {
    let index = 0;
    let currentContext = context;

    const jump: HexFunctionNext = (
      newContext?: HexContext,
    ): HexFunctionResult => {
      const current = functions[index];

      index += 1;
      if (newContext !== undefined) {
        currentContext = newContext;
      }

      return current(
        input,
        currentContext,
        jump,
      );
    };

    return jump(currentContext);
  };
}

export {
  composer as default,
};
