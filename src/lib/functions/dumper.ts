import {
  HexFunctionResult,
  HexFunctionResultIterable,
} from "./function-result.ts";

const defaultDumpFunction = (x: unknown) => console.log(x);

async function dumper(
  iterator: HexFunctionResult,
  dumpFunction: (x: unknown) => void = defaultDumpFunction,
) {
  for await (
    const result of <HexFunctionResultIterable> iterator
  ) {
    dumpFunction(result);
  }
}

export { dumper, dumper as default };
