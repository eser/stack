import * as hex from "../../mod.ts";

import React from "https://esm.sh/react@18.2.0?target=deno";

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
