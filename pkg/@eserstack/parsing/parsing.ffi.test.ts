// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as childProcess from "node:child_process";
import * as nodeProcess from "node:process";
import * as nodeTest from "node:test";
import * as util from "node:util";
import * as assert from "@eserstack/test-kit/assert";
import * as ffi from "./adapters/ffi/mod.ts";
import * as errors from "./business/errors.ts";

nodeTest.test(
  "FFI round-trip: tokenize via EserAjanParsingTokenize",
  async () => {
    const tokens = await ffi.ffiLoader.tokenize({ input: "hello world" });
    assert.assert(tokens.length > 0);
    const kinds = tokens.map((t) => t.kind);
    assert.assert(
      kinds.includes("word") ||
        kinds.includes("identifier") ||
        kinds.length > 0,
    );
    // token fields are typed (not string-coerced): offset and length are numbers
    assert.assertEquals(typeof tokens[0]!.offset, "number");
    assert.assertEquals(typeof tokens[0]!.length, "number");
  },
);

nodeTest.test(
  "FFI round-trip: simpleTokens via EserAjanParsingSimpleTokens",
  async () => {
    const result = await ffi.ffiLoader.simpleTokens();
    assert.assert(result.definitions.length > 0);
    assert.assertEquals(typeof result.definitions[0]!.name, "string");
    assert.assertEquals(typeof result.definitions[0]!.pattern, "string");
  },
);

nodeTest.test("FFI round-trip: tokenize with custom definitions", async () => {
  const tokens = await ffi.ffiLoader.tokenize({
    input: "abc 123",
    definitions: [
      { name: "alpha", pattern: "[a-z]+" },
      { name: "digits", pattern: "[0-9]+" },
      { name: "space", pattern: "\\s+" },
    ],
  });
  assert.assert(tokens.length > 0);
  const kinds = tokens.map((t) => t.kind);
  assert.assert(kinds.includes("alpha"));
  assert.assert(kinds.includes("digits"));
});

nodeTest.test("FFI error: invalid pattern throws ParsingError", async () => {
  await assert.assertRejects(
    () =>
      ffi.ffiLoader.tokenize({
        input: "abc",
        definitions: [{ name: "bad", pattern: "[invalid(regexp" }],
      }),
    errors.ParsingError,
  );
  // confirm the error code
  await ffi.ffiLoader
    .tokenize({
      input: "abc",
      definitions: [{ name: "bad", pattern: "[invalid(regexp" }],
    })
    .catch((e: unknown) => {
      if (e instanceof errors.ParsingError) {
        assert.assertEquals(e.code, errors.PARSING_INVALID_PATTERN);
      }
    });
});

nodeTest.test(
  "with ESER_AJAN=disabled the Go-backed exports reject with the bridge's load error and the lexer and parser still run",
  async () => {
    // The package does not depend on @eserstack/standards, so the child
    // process starts through Node's own modules.
    const script = `
      import * as parsing from ${JSON.stringify(import.meta.resolve("./mod.ts"))};
      const out = { rejections: [], tokens: null, nodes: null };
      for (const run of [
        () => parsing.ffiLoader.tokenize({ input: "a" }),
        () => parsing.ffiLoader.simpleTokens(),
        () => parsing.tokenizeWith(parsing.ffiLoader, { input: "a" }),
        () => parsing.simpleTokensWith(parsing.ffiLoader),
      ]) {
        try {
          await run();
          out.rejections.push(null);
        } catch (error) {
          out.rejections.push({
            isParsingError: error instanceof parsing.ParsingError,
            code: error.code,
            cause: error.cause?.message ?? null,
          });
        }
      }
      const lexer = new parsing.Tokenizer(
        parsing.createTokenizerState(parsing.simpleTokens),
      );
      out.tokens = [...lexer.tokenizeFromString("1+2")].map((t) => t.kind);
      out.nodes = parsing.sequence(
        parsing.token("T_NUMERIC"),
        parsing.token("T_PLUS"),
      )(lexer.tokenizeFromString("1+2"))?.length ?? null;
      process.stdout.write(JSON.stringify(out));
    `;
    // execFile rejects when the child exits with a non-zero code.
    const { stdout } = await util.promisify(childProcess.execFile)(
      nodeProcess.execPath,
      ["--input-type=module", "--eval", script],
      { env: { ...nodeProcess.env, ESER_AJAN: "disabled" } },
    );

    const result = JSON.parse(stdout) as {
      rejections: Array<{
        isParsingError: boolean;
        code: string;
        cause: string | null;
      } | null>;
      tokens: string[];
      nodes: number | null;
    };

    assert.assertEquals(result.rejections.length, 4);
    for (const rejection of result.rejections) {
      assert.assertExists(rejection);
      assert.assertEquals(rejection.isParsingError, true);
      assert.assertEquals(rejection.code, errors.PARSING_TOKENIZE_FAILED);
      assert.assertStringIncludes(rejection.cause ?? "", "ESER_AJAN=disabled");
    }

    assert.assertEquals(result.tokens, [
      "T_NUMERIC",
      "T_PLUS",
      "T_NUMERIC",
      "T_END",
    ]);
    assert.assertEquals(result.nodes, 2);
  },
);
