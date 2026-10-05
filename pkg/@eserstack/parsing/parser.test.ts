// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as simple from "./lexer/tokens/simple.ts";
import * as lexer from "./lexer/lexer.ts";
import * as parser from "./parser.ts";

Deno.test("tokens", () => {
  const parse = parser.token("T_NUMERIC");

  const tokenizer = new lexer.Tokenizer(
    lexer.createTokenizerState(simple.simpleTokens),
  );
  const tokenGenerator = tokenizer.tokenizeFromString("5");
  const result = parse(tokenGenerator);

  assert.assertEquals(
    result,
    [
      { kind: "token", token: { kind: "T_NUMERIC", value: "5" } },
    ],
  );
});

Deno.test("sequence", () => {
  const parse = parser.sequence(
    parser.token("T_NUMERIC"),
    parser.token("T_WHITESPACE"),
    parser.token("T_PLUS"),
    parser.token("T_WHITESPACE"),
    parser.token("T_NUMERIC"),
  );

  const tokenizer = new lexer.Tokenizer(
    lexer.createTokenizerState(simple.simpleTokens),
  );
  const tokenGenerator = tokenizer.tokenizeFromString("1 + 2 * 3");
  const result = parse(tokenGenerator);

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

Deno.test("token returns null on kind mismatch", () => {
  const parse = parser.token("T_PLUS");

  const tokenizer = new lexer.Tokenizer(
    lexer.createTokenizerState(simple.simpleTokens),
  );
  const tokenGenerator = tokenizer.tokenizeFromString("5");
  const result = parse(tokenGenerator);

  assert.assertEquals(result, null);
});

Deno.test("token returns null on empty iterator", () => {
  const parse = parser.token("T_NUMERIC");

  const tokenizer = new lexer.Tokenizer(
    lexer.createTokenizerState(simple.simpleTokens),
  );
  const tokenGenerator = tokenizer.tokenizeFromString("");
  const result = parse(tokenGenerator);

  assert.assertEquals(result, null);
});

Deno.test("sequence returns null when middle parser fails", () => {
  const parse = parser.sequence(
    parser.token("T_NUMERIC"),
    parser.token("T_PLUS"), // This will fail because there's whitespace first
    parser.token("T_NUMERIC"),
  );

  const tokenizer = new lexer.Tokenizer(
    lexer.createTokenizerState(simple.simpleTokens),
  );
  const tokenGenerator = tokenizer.tokenizeFromString("1 + 2");
  const result = parse(tokenGenerator);

  assert.assertEquals(result, null);
});

Deno.test("sequence with empty parsers array returns empty result", () => {
  const parse = parser.sequence();

  const tokenizer = new lexer.Tokenizer(
    lexer.createTokenizerState(simple.simpleTokens),
  );
  const tokenGenerator = tokenizer.tokenizeFromString("5");
  const result = parse(tokenGenerator);

  assert.assertEquals(result, []);
});
