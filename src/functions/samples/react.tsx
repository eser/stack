import {
  type HexFunctionContext,
  type HexFunctionInput,
  type HexFunctionResult,
} from "../mod.ts";
import * as hex from "../../mod.ts";

import React from "https://esm.sh/react@18.2.0?target=deno";

const ParagraphMaker = (props: { text: string }) => {
  return <p>{props.text}</p>;
};

const main = (
  input: HexFunctionInput,
  _ctx: HexFunctionContext,
): HexFunctionResult => {
  const to = input.params[0] ?? "world";
  const message = `hello ${to}`;

  return hex.functions.results.reactView(
    <ParagraphMaker text={message} />,
  );
};

hex.functions.dumperReact(
  hex.functions.executeFromCli(main),
);
