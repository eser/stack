import * as hex from "../../mod.ts";

import React from "https://jspm.dev/react@17.0.2";

const ParagraphMaker = (props) => {
  return <p>{props.text}</p>;
};

const main = (input) => {
  const to = input.params[0] ?? "world";
  const message = `hello ${to}`;

  return hex.functions.results.reactView(
    <ParagraphMaker text={message} />,
  );
};

hex.functions.dumperReact(
  hex.functions.executeFromCli(main),
);
