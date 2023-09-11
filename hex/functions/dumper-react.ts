import {
  HexFunctionResult,
  // HexFunctionResultIterable,
} from "./function-result.ts";

// import { renderToString } from "react-dom/server";

export const dumperReact = async (_iterator: HexFunctionResult) => {
  // for await (
  //   const result of <HexFunctionResultIterable> iterator
  // ) {
  //   console.log(renderToString(result.payload));
  // }
};

export { dumperReact as default };
