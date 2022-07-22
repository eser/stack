import {
  HexFunctionResult,
  HexFunctionResultIterable,
} from "./function-result.ts";

// @deno-types="https://denopkg.com/soremwar/deno_types/react-dom/v16.13.1/server.d.ts"
import ReactDOMServer from "https://jspm.dev/react-dom@17.0.2/server";

async function dumperReact(iterator: HexFunctionResult) {
  for await (
    const result of <HexFunctionResultIterable> iterator
  ) {
    console.log(ReactDOMServer.renderToString(result.payload));
  }
}

export { dumperReact, dumperReact as default };
