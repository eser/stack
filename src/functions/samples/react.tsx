import {
  type HexFunctionContext,
  type HexFunctionInput,
  type HexFunctionResult,
} from "../mod.ts";
import * as hex from "../../mod.ts";

// @deno-types="https://denopkg.com/soremwar/deno_types/react/v16.13.1/react.d.ts"
import React from "https://jspm.dev/react@17.0.2";

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
