import {
  HexFunctionResult,
  HexFunctionResultIterable,
} from "./function-result.ts";

import ReactDOMServer from "https://esm.sh/react-dom@18.2.0/server?target=deno";

const dumperReact = async (iterator: HexFunctionResult) => {
  for await (
    const result of <HexFunctionResultIterable> iterator
  ) {
    console.log(ReactDOMServer.renderToString(result.payload));
  }
};

export { dumperReact, dumperReact as default };
