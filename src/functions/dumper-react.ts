import {
  HexFunctionResult,
  HexFunctionResultIterable,
} from "./function-result.ts";

// import {
//   renderToString,
// } from "https://esm.sh/preact-render-to-string@5.2.0?deps=preact@10.8.2";

//     "_jsx": "react-jsx",
//     "_jsxImportSource": "https://esm.sh/preact"

const defaultDumpFunction = (x: unknown) => console.log(x); // renderToString(x.payload)

async function dumperReact(
  iterator: HexFunctionResult,
  dumpFunction: (x: unknown) => void = defaultDumpFunction,
) {
  for await (
    const result of <HexFunctionResultIterable> iterator
  ) {
    dumpFunction(result);
  }
}

export { dumperReact, dumperReact as default };
