// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as ffiClient from "@eserstack/ajan/ffi/client";
import * as simple from "./tokens/simple.ts";
import * as lexer from "./lexer.ts";

Deno.test({
  name: "tokenizes the same way after the Go library is loaded",
  // The library stays loaded for the rest of the process.
  sanitizeResources: false,
}, async () => {
  // Another package loading the native library must not change the tokens.
  await ffiClient.ensureLib();

  const tokenizer = new lexer.Tokenizer(
    lexer.createTokenizerState(simple.simpleTokens),
  );

  assert.assertEquals(Array.from(tokenizer.tokenizeFromString("a1 + 2")), [
    { kind: "T_ALPHANUMERIC", value: "a1" },
    { kind: "T_WHITESPACE", value: " " },
    { kind: "T_PLUS", value: "+" },
    { kind: "T_WHITESPACE", value: " " },
    { kind: "T_NUMERIC", value: "2" },
    { kind: "T_END", value: "" },
  ]);
});

Deno.test("operators and symbols", () => {
  const tokenizer = new lexer.Tokenizer(
    lexer.createTokenizerState(simple.simpleTokens),
  );

  const input = "=+-*_/%<>!&|?:;,.()[]{}^";

  const result = Array.from(tokenizer.tokenizeFromString(input));

  assert.assertEquals(
    result,
    [
      { kind: "T_EQUALS", value: "=" },
      { kind: "T_PLUS", value: "+" },
      { kind: "T_HYPHEN", value: "-" },
      { kind: "T_ASTERISK", value: "*" },
      { kind: "T_UNDERSCORE", value: "_" },
      { kind: "T_SLASH", value: "/" },
      { kind: "T_PERCENT", value: "%" },
      { kind: "T_IS_SMALLER", value: "<" },
      { kind: "T_IS_GREATER", value: ">" },
      { kind: "T_EXCLAMATION_MARK", value: "!" },
      { kind: "T_AMPERSAND", value: "&" },
      { kind: "T_PIPE", value: "|" },
      { kind: "T_QUESTION_MARK", value: "?" },
      { kind: "T_COLON", value: ":" },
      { kind: "T_SEMICOLON", value: ";" },
      { kind: "T_COMMA", value: "," },
      { kind: "T_DOT", value: "." },
      { kind: "T_PARENTHESIS_OPEN", value: "(" },
      { kind: "T_PARENTHESIS_CLOSE", value: ")" },
      { kind: "T_SQUARE_BRACKET_OPEN", value: "[" },
      { kind: "T_SQUARE_BRACKET_CLOSE", value: "]" },
      { kind: "T_CURLY_BRACKET_OPEN", value: "{" },
      { kind: "T_CURLY_BRACKET_CLOSE", value: "}" },
      { kind: "T_CARET", value: "^" },
      { kind: "T_END", value: "" },
    ],
  );
});

Deno.test("numbers", () => {
  const tokenizer = new lexer.Tokenizer(
    lexer.createTokenizerState(simple.simpleTokens),
  );

  const input = `1234 5678`;

  const result = Array.from(tokenizer.tokenizeFromString(input));
  assert.assertEquals(
    result,
    [
      { kind: "T_NUMERIC", value: "1234" },
      { kind: "T_WHITESPACE", value: " " },
      { kind: "T_NUMERIC", value: "5678" },
      { kind: "T_END", value: "" },
    ],
  );
});

Deno.test("whitespace and comments", () => {
  const tokenizer = new lexer.Tokenizer(
    lexer.createTokenizerState(simple.simpleTokens),
  );

  const input = `   // This is a comment
  /* This is a
  multiline comment */   `;

  const result = Array.from(tokenizer.tokenizeFromString(input));
  assert.assertEquals(
    result,
    [
      { kind: "T_WHITESPACE", value: "   " },
      { kind: "T_SLASH", value: "/" },
      { kind: "T_SLASH", value: "/" },
      { kind: "T_WHITESPACE", value: " " },
      { kind: "T_ALPHANUMERIC", value: "This" },
      { kind: "T_WHITESPACE", value: " " },
      { kind: "T_ALPHANUMERIC", value: "is" },
      { kind: "T_WHITESPACE", value: " " },
      { kind: "T_ALPHANUMERIC", value: "a" },
      { kind: "T_WHITESPACE", value: " " },
      { kind: "T_ALPHANUMERIC", value: "comment" },
      { kind: "T_NEWLINE", value: "\n" },
      { kind: "T_WHITESPACE", value: "  " },
      { kind: "T_SLASH", value: "/" },
      { kind: "T_ASTERISK", value: "*" },
      { kind: "T_WHITESPACE", value: " " },
      { kind: "T_ALPHANUMERIC", value: "This" },
      { kind: "T_WHITESPACE", value: " " },
      { kind: "T_ALPHANUMERIC", value: "is" },
      { kind: "T_WHITESPACE", value: " " },
      { kind: "T_ALPHANUMERIC", value: "a" },
      { kind: "T_NEWLINE", value: "\n" },
      { kind: "T_WHITESPACE", value: "  " },
      { kind: "T_ALPHANUMERIC", value: "multiline" },
      { kind: "T_WHITESPACE", value: " " },
      { kind: "T_ALPHANUMERIC", value: "comment" },
      { kind: "T_WHITESPACE", value: " " },
      { kind: "T_ASTERISK", value: "*" },
      { kind: "T_SLASH", value: "/" },
      { kind: "T_WHITESPACE", value: "   " },
      { kind: "T_END", value: "" },
    ],
  );
});

Deno.test("multiline comments", () => {
  const tokenizer = new lexer.Tokenizer(
    lexer.createTokenizerState(simple.simpleTokens),
  );

  const input = `/* test */`;

  const result = Array.from(tokenizer.tokenizeFromString(input));
  assert.assertEquals(
    result,
    [
      { kind: "T_SLASH", value: "/" },
      { kind: "T_ASTERISK", value: "*" },
      { kind: "T_WHITESPACE", value: " " },
      { kind: "T_ALPHANUMERIC", value: "test" },
      { kind: "T_WHITESPACE", value: " " },
      { kind: "T_ASTERISK", value: "*" },
      { kind: "T_SLASH", value: "/" },
      { kind: "T_END", value: "" },
    ],
  );
});

Deno.test("singleline comments", () => {
  const tokenizer = new lexer.Tokenizer(
    lexer.createTokenizerState(simple.simpleTokens),
  );

  const input = `// test`;

  const result = Array.from(tokenizer.tokenizeFromString(input));
  assert.assertEquals(
    result,
    [
      { kind: "T_SLASH", value: "/" },
      { kind: "T_SLASH", value: "/" },
      { kind: "T_WHITESPACE", value: " " },
      { kind: "T_ALPHANUMERIC", value: "test" },
      { kind: "T_END", value: "" },
    ],
  );
});

Deno.test("mixed expression", () => {
  const tokenizer = new lexer.Tokenizer(
    lexer.createTokenizerState(simple.simpleTokens),
  );

  const input = `rocketLauncher++ /* Comment */ && test123`;

  const result = Array.from(tokenizer.tokenizeFromString(input));
  assert.assertEquals(
    result,
    [
      { kind: "T_ALPHANUMERIC", value: "rocketLauncher" },
      { kind: "T_PLUS", value: "+" },
      { kind: "T_PLUS", value: "+" },
      { kind: "T_WHITESPACE", value: " " },
      { kind: "T_SLASH", value: "/" },
      { kind: "T_ASTERISK", value: "*" },
      { kind: "T_WHITESPACE", value: " " },
      { kind: "T_ALPHANUMERIC", value: "Comment" },
      { kind: "T_WHITESPACE", value: " " },
      { kind: "T_ASTERISK", value: "*" },
      { kind: "T_SLASH", value: "/" },
      { kind: "T_WHITESPACE", value: " " },
      { kind: "T_AMPERSAND", value: "&" },
      { kind: "T_AMPERSAND", value: "&" },
      { kind: "T_WHITESPACE", value: " " },
      { kind: "T_ALPHANUMERIC", value: "test123" },
      { kind: "T_END", value: "" },
    ],
  );
});

Deno.test("alphanumeric from readable stream", async () => {
  const tokenizer = new lexer.Tokenizer(
    lexer.createTokenizerState(simple.simpleTokens),
  );

  const readableStream = new ReadableStream({
    start(controller) {
      controller.enqueue("rocket");
      controller.enqueue("Launcher");
      controller.close();
    },
  });

  const result = [];
  for await (const token of tokenizer.tokenize(readableStream)) {
    result.push(token);
  }

  assert.assertEquals(
    result,
    [
      { kind: "T_ALPHANUMERIC", value: "rocketLauncher" },
      { kind: "T_END", value: "" },
    ],
  );
});

Deno.test("alphanumeric from string", () => {
  const tokenizer = new lexer.Tokenizer(
    lexer.createTokenizerState(simple.simpleTokens),
  );

  const input = `rocketLauncher`;

  const result = Array.from(tokenizer.tokenizeFromString(input));
  assert.assertEquals(
    result,
    [
      { kind: "T_ALPHANUMERIC", value: "rocketLauncher" },
      { kind: "T_END", value: "" },
    ],
  );
});

Deno.test("alphanumeric from string, buffer boundary", () => {
  const tokenizer = new lexer.Tokenizer(
    lexer.createTokenizerState(simple.simpleTokens),
  );

  tokenizer._reset();
  const result1 = Array.from(tokenizer._tokenizeChunk("rocket"));

  assert.assertEquals(
    result1,
    [],
  );

  const result2 = Array.from(tokenizer._tokenizeChunk("Launcher"));
  assert.assertEquals(
    result2,
    [],
  );

  const result3 = Array.from(tokenizer._tokenizeChunk(null));
  assert.assertEquals(
    result3,
    [
      { kind: "T_ALPHANUMERIC", value: "rocketLauncher" },
      { kind: "T_END", value: "" },
    ],
  );
});
