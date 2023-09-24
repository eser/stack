import { assert, bdd } from "../deps.ts";
import { extendedTokens } from "./tokens/extended.ts";
import { Tokenizer } from "./lexer.ts";

bdd.describe("cool/parsing/lexer", () => {
  bdd.it("operators and symbols", () => {
    const lexer = new Tokenizer(extendedTokens);

    const input = "=+-*_/%<>!&|?:;,.()[]{}^";

    const result = Array.from(lexer.tokenizeFromString(input));

    assert.assertEquals(
      result,
      [
        { kind: "T_EQUAL", value: "=" },
        { kind: "T_PLUS", value: "+" },
        { kind: "T_MINUS", value: "-" },
        { kind: "T_MULTIPLY", value: "*" },
        { kind: "T_UNDERSCORE", value: "_" },
        { kind: "T_DIVIDE", value: "/" },
        { kind: "T_MOD", value: "%" },
        { kind: "T_IS_SMALLER", value: "<" },
        { kind: "T_IS_GREATER", value: ">" },
        { kind: "T_NOT", value: "!" },
        { kind: "T_BITWISE_AND", value: "&" },
        { kind: "T_BITWISE_OR", value: "|" },
        { kind: "T_QUESTION_MARK", value: "?" },
        { kind: "T_COLON", value: ":" },
        { kind: "T_SEMICOLON", value: ";" },
        { kind: "T_COMMA", value: "," },
        { kind: "T_DOT", value: "." },
        { kind: "T_OPEN_BRACKET", value: "(" },
        { kind: "T_CLOSE_BRACKET", value: ")" },
        { kind: "T_OPEN_SQUARE_BRACKET", value: "[" },
        { kind: "T_CLOSE_SQUARE_BRACKET", value: "]" },
        { kind: "T_OPEN_CURLY_BRACKET", value: "{" },
        { kind: "T_CLOSE_CURLY_BRACKET", value: "}" },
        { kind: "T_BITWISE_XOR", value: "^" },
        { kind: "T_END", value: "" },
      ],
    );
  });

  bdd.it("numbers", () => {
    const lexer = new Tokenizer(extendedTokens);

    const input = `1234 5678`;

    const result = Array.from(lexer.tokenizeFromString(input));
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

  bdd.it("whitespace and comments", () => {
    const lexer = new Tokenizer(extendedTokens);

    const input = `   // This is a comment
    /* This is a
    multiline comment */   `;

    const result = Array.from(lexer.tokenizeFromString(input));
    assert.assertEquals(
      result,
      [
        { kind: "T_WHITESPACE", value: "   " },
        { kind: "T_COMMENT", value: "//" },
        { kind: "T_WHITESPACE", value: " " },
        { kind: "T_ALPHANUMERIC", value: "This" },
        { kind: "T_WHITESPACE", value: " " },
        { kind: "T_ALPHANUMERIC", value: "is" },
        { kind: "T_WHITESPACE", value: " " },
        { kind: "T_ALPHANUMERIC", value: "a" },
        { kind: "T_WHITESPACE", value: " " },
        { kind: "T_ALPHANUMERIC", value: "comment" },
        { kind: "T_NEWLINE", value: "\n" },
        { kind: "T_WHITESPACE", value: "    " },
        { kind: "T_COMMENT_MULTILINE_START", value: "/*" },
        { kind: "T_WHITESPACE", value: " " },
        { kind: "T_ALPHANUMERIC", value: "This" },
        { kind: "T_WHITESPACE", value: " " },
        { kind: "T_ALPHANUMERIC", value: "is" },
        { kind: "T_WHITESPACE", value: " " },
        { kind: "T_ALPHANUMERIC", value: "a" },
        { kind: "T_NEWLINE", value: "\n" },
        { kind: "T_WHITESPACE", value: "    " },
        { kind: "T_ALPHANUMERIC", value: "multiline" },
        { kind: "T_WHITESPACE", value: " " },
        { kind: "T_ALPHANUMERIC", value: "comment" },
        { kind: "T_WHITESPACE", value: " " },
        { kind: "T_COMMENT_MULTILINE_END", value: "*/" },
        { kind: "T_WHITESPACE", value: "   " },
        { kind: "T_END", value: "" },
      ],
    );
  });

  bdd.it("multiline comments", () => {
    const lexer = new Tokenizer(extendedTokens);

    const input = `/* test */`;

    const result = Array.from(lexer.tokenizeFromString(input));
    assert.assertEquals(
      result,
      [
        { kind: "T_COMMENT_MULTILINE_START", value: "/*" },
        { kind: "T_WHITESPACE", value: " " },
        { kind: "T_ALPHANUMERIC", value: "test" },
        { kind: "T_WHITESPACE", value: " " },
        { kind: "T_COMMENT_MULTILINE_END", value: "*/" },
        { kind: "T_END", value: "" },
      ],
    );
  });

  bdd.it("singleline comments", () => {
    const lexer = new Tokenizer(extendedTokens);

    const input = `// test`;

    const result = Array.from(lexer.tokenizeFromString(input));
    assert.assertEquals(
      result,
      [
        { kind: "T_COMMENT", value: "//" },
        { kind: "T_WHITESPACE", value: " " },
        { kind: "T_ALPHANUMERIC", value: "test" },
        { kind: "T_END", value: "" },
      ],
    );
  });

  bdd.it("mixed expression", () => {
    const lexer = new Tokenizer(extendedTokens);

    const input = `rocketLauncher++ /* Comment */ && test123`;

    const result = Array.from(lexer.tokenizeFromString(input));
    assert.assertEquals(
      result,
      [
        { kind: "T_ALPHANUMERIC", value: "rocketLauncher" },
        { kind: "T_INCREMENT", value: "++" },
        { kind: "T_WHITESPACE", value: " " },
        { kind: "T_COMMENT_MULTILINE_START", value: "/*" },
        { kind: "T_WHITESPACE", value: " " },
        { kind: "T_ALPHANUMERIC", value: "Comment" },
        { kind: "T_WHITESPACE", value: " " },
        { kind: "T_COMMENT_MULTILINE_END", value: "*/" },
        { kind: "T_WHITESPACE", value: " " },
        { kind: "T_AND", value: "&&" },
        { kind: "T_WHITESPACE", value: " " },
        { kind: "T_ALPHANUMERIC", value: "test123" },
        { kind: "T_END", value: "" },
      ],
    );
  });

  bdd.it("alphanumeric from readable stream", async () => {
    const lexer = new Tokenizer(extendedTokens);

    const readableStream = new ReadableStream({
      start(controller) {
        controller.enqueue("rocket");
        controller.enqueue("Launcher");
        controller.close();
      },
    });

    const result = [];
    for await (const token of lexer.tokenize(readableStream)) {
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

  bdd.it("alphanumeric from string", () => {
    const lexer = new Tokenizer(extendedTokens);

    const input = `rocketLauncher`;

    const result = Array.from(lexer.tokenizeFromString(input));
    assert.assertEquals(
      result,
      [
        { kind: "T_ALPHANUMERIC", value: "rocketLauncher" },
        { kind: "T_END", value: "" },
      ],
    );
  });

  bdd.it("alphanumeric from string, buffer boundary", () => {
    const lexer = new Tokenizer(extendedTokens);

    lexer._reset();
    const result1 = Array.from(lexer._tokenizeChunk("rocket"));

    assert.assertEquals(
      result1,
      [],
    );

    const result2 = Array.from(lexer._tokenizeChunk("Launcher"));
    assert.assertEquals(
      result2,
      [],
    );

    const result3 = Array.from(lexer._tokenizeChunk(null));
    assert.assertEquals(
      result3,
      [
        { kind: "T_ALPHANUMERIC", value: "rocketLauncher" },
        { kind: "T_END", value: "" },
      ],
    );
  });
});
