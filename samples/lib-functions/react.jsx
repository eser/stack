import React from "npm:react";
import * as functions from "@hexfunctions/mod.ts";

const ParagraphMaker = (props) => {
  return <p>{props.text}</p>;
};

const main = (input) => {
  const to = input.params[0] ?? "world";
  const message = `hello ${to}`;

  return functions.results.reactView(
    <ParagraphMaker text={message} />,
  );
};

functions.dumperReact(
  functions.executeFromCli(main),
);
