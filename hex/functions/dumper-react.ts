import {
  HexFunctionResult,
  HexFunctionResultIterable,
} from "./function-result.ts";

import ReactDOMServer from "npm:react-dom@18.2.0/server";

export const dumperReact = async (iterator: HexFunctionResult) => {
  for await (
    const result of <HexFunctionResultIterable> iterator
  ) {
    console.log(ReactDOMServer.renderToString(result.payload));
  }
};

export { dumperReact as default };
