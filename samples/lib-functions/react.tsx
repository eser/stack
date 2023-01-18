import React from "npm:react";
import * as functions from "@hex/lib/functions/mod.ts";

const ParagraphMaker = (props: { text: string }) => {
  return <p>{props.text}</p>;
};

const main = (
  input: functions.HexFunctionInput,
  _ctx: functions.HexFunctionContext,
): functions.HexFunctionResult => {
  const to = input.params[0] ?? "world";
  const message = `hello ${to}`;

  return functions.results.reactView(
    <ParagraphMaker text={message} />,
  );
};

functions.dumperReact(
  functions.executeFromCli(main),
);
