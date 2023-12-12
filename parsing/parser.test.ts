// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { assert, bdd } from "./deps-dev.ts";
import { simpleTokens } from "./lexer/tokens/simple.ts";
import { Tokenizer } from "./lexer/lexer.ts";
import { sequence, token } from "./parser.ts";

bdd.describe("cool/parsing/parser", () => {
  bdd.it("tokens", () => {
    const parser = token("T_NUMERIC");

    const tokenizer = new Tokenizer(simpleTokens);
    const tokenGenerator = tokenizer.tokenizeFromString("5");
    const result = parser(tokenGenerator);

    assert.assertEquals(
      result,
      [
        { kind: "token", token: { kind: "T_NUMERIC", value: "5" } },
      ],
    );
  });

  bdd.it("sequence", () => {
    const parser = sequence(
      token("T_NUMERIC"),
      token("T_WHITESPACE"),
      token("T_PLUS"),
      token("T_WHITESPACE"),
      token("T_NUMERIC"),
    );

    const tokenizer = new Tokenizer(simpleTokens);
    const tokenGenerator = tokenizer.tokenizeFromString("1 + 2 * 3");
    const result = parser(tokenGenerator);

    assert.assertEquals(
      result,
      [
        { kind: "token", token: { kind: "T_NUMERIC", value: "1" } },
        { kind: "token", token: { kind: "T_WHITESPACE", value: " " } },
        { kind: "token", token: { kind: "T_PLUS", value: "+" } },
        { kind: "token", token: { kind: "T_WHITESPACE", value: " " } },
        { kind: "token", token: { kind: "T_NUMERIC", value: "2" } },
      ],
    );
  });
});
