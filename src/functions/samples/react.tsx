import type {
  HexFunctionContext,
  HexFunctionInput,
  HexFunctionResult,
} from "../mod.ts";
import * as hex from "../../mod.ts";

const ParagraphMaker = function ParagraphMaker(props: { text: string }) {
  return <p>{props.text}</p>;
};

const main = function main(
  input: HexFunctionInput,
  context: HexFunctionContext,
): HexFunctionResult {
  const to = input.parameters[0] ?? "world";
  const message = `hello ${to}`;

  return hex.functions.results.reactView(
    <ParagraphMaker text={message} />,
  );
};

hex.functions.dumperReact(
  hex.functions.execute(main),
);
