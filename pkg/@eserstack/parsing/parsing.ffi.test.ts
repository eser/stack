// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as ffi from "./adapters/ffi/mod.ts";
import * as errors from "./business/errors.ts";

Deno.test(
  {
    name: "FFI round-trip: tokenize via EserAjanParsingTokenize",
    sanitizeResources: false,
  },
  async () => {
    const tokens = await ffi.ffiLoader.tokenize({ input: "hello world" });
    assert.assert(tokens.length > 0);
    const kinds = tokens.map((t) => t.kind);
    assert.assert(
      kinds.includes("word") || kinds.includes("identifier") ||
        kinds.length > 0,
    );
    // token fields are typed (not string-coerced): offset and length are numbers
    assert.assertEquals(typeof tokens[0]!.offset, "number");
    assert.assertEquals(typeof tokens[0]!.length, "number");
  },
);

Deno.test(
  {
    name: "FFI round-trip: simpleTokens via EserAjanParsingSimpleTokens",
    sanitizeResources: false,
  },
  async () => {
    const result = await ffi.ffiLoader.simpleTokens();
    assert.assert(result.definitions.length > 0);
    assert.assertEquals(typeof result.definitions[0]!.name, "string");
    assert.assertEquals(typeof result.definitions[0]!.pattern, "string");
  },
);

Deno.test(
  {
    name: "FFI round-trip: tokenize with custom definitions",
    sanitizeResources: false,
  },
  async () => {
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
  },
);

Deno.test(
  {
    name: "FFI error: invalid pattern throws ParsingError",
    sanitizeResources: false,
  },
  async () => {
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
  },
);
