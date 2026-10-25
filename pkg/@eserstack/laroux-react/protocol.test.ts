// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Tests for RSC Wire Protocol
 */

import * as assert from "@eserstack/test-kit/assert";
import * as protocol from "./protocol.ts";
import type { RSCChunk } from "./protocol.ts";

Deno.test("track-l-delete: RSC Protocol - Serialize Module Chunk", () => {
  const chunk: RSCChunk = {
    type: "M",
    id: 1,
    value: {
      id: "./counter.tsx",
      chunks: ["client"],
      name: "default",
    },
  };

  const serialized = protocol.serializeChunk(chunk);
  assert.assertEquals(
    serialized,
    'M1:{"id":"./counter.tsx","chunks":["client"],"name":"default"}\n',
  );
});

Deno.test("track-l-delete: RSC Protocol - Serialize JSON Chunk", () => {
  const chunk: RSCChunk = {
    type: "J",
    id: 0,
    value: { message: "Hello, RSC!" },
  };

  const serialized = protocol.serializeChunk(chunk);
  assert.assertEquals(serialized, 'J0:{"message":"Hello, RSC!"}\n');
});

Deno.test("track-l-delete: RSC Protocol - Serialize Error Chunk", () => {
  const chunk: RSCChunk = {
    type: "E",
    id: 2,
    value: { message: "Something went wrong", stack: "Error stack..." },
  };

  const serialized = protocol.serializeChunk(chunk);
  assert.assertExists(serialized);
  assert.assertEquals(serialized.startsWith("E2:"), true);
});

Deno.test("track-l-delete: RSC Protocol - Parse Module Chunk", () => {
  const line =
    'M1:{"id":"./counter.tsx","chunks":["client"],"name":"default"}\n';
  const parsed = protocol.parseChunk(line);

  assert.assertExists(parsed);
  assert.assertEquals(parsed?.type, "M");
  assert.assertEquals(parsed?.id, 1);
  // deno-lint-ignore no-explicit-any
  assert.assertEquals((parsed?.value as any).id, "./counter.tsx");
});

Deno.test("track-l-delete: RSC Protocol - Parse JSON Chunk", () => {
  const line = 'J0:{"message":"Hello"}\n';
  const parsed = protocol.parseChunk(line);

  assert.assertExists(parsed);
  assert.assertEquals(parsed?.type, "J");
  assert.assertEquals(parsed?.id, 0);
  // deno-lint-ignore no-explicit-any
  assert.assertEquals((parsed?.value as any).message, "Hello");
});

Deno.test("track-l-delete: RSC Protocol - Round-trip Serialization", () => {
  const original: RSCChunk = {
    type: "J",
    id: 5,
    value: { nested: { data: [1, 2, 3] } },
  };

  const serialized = protocol.serializeChunk(original);
  const parsed = protocol.parseChunk(serialized);

  assert.assertExists(parsed);
  assert.assertEquals(parsed?.type, original.type);
  assert.assertEquals(parsed?.id, original.id);
  assert.assertEquals(
    JSON.stringify(parsed?.value),
    JSON.stringify(original.value),
  );
});

Deno.test("track-l-delete: RSC Protocol - Create Client Reference", () => {
  const ref = protocol.createClientReference("./Button.tsx", "default");

  assert.assertExists(ref);
  assert.assertEquals(ref.$$typeof, Symbol.for("react.client.reference"));
  assert.assertEquals(ref.$$id, "./Button.tsx");
  assert.assertEquals(ref.name, "default");
});

Deno.test("track-l-delete: RSC Protocol - Is Client Reference", () => {
  const ref = protocol.createClientReference("./Button.tsx", "default");
  assert.assertEquals(protocol.isClientReference(ref), true);

  const notRef = { some: "object" };
  assert.assertEquals(protocol.isClientReference(notRef), false);

  assert.assertEquals(protocol.isClientReference(null), false);
  assert.assertEquals(protocol.isClientReference("string"), false);
});

Deno.test("track-l-delete: RSC Protocol - Parse Invalid Chunk", () => {
  const invalid = "invalid chunk data";
  const parsed = protocol.parseChunk(invalid);
  assert.assertEquals(parsed, null);
});

Deno.test("track-l-delete: RSC Protocol - Parse Empty String", () => {
  const parsed = protocol.parseChunk("");
  assert.assertEquals(parsed, null);
});

const ESCAPE_CASES: ReadonlyArray<{
  readonly input: string;
  readonly expected: string;
}> = [
  { input: "plain", expected: "plain" },
  { input: "", expected: "" },
  { input: "$5", expected: "$$5" },
  { input: "$$", expected: "$$$" },
  { input: "price: $5", expected: "price: $5" },
];

for (const { input, expected } of ESCAPE_CASES) {
  Deno.test(`track-l-delete: RSC Protocol - escapeString turns "${input}" into "${expected}"`, () => {
    assert.assertEquals(protocol.escapeString(input), expected);
  });
}

Deno.test("track-l-delete: RSC Protocol - encodeJsonValue keeps JSON semantics and escapes nested strings", () => {
  const encoded = protocol.encodeJsonValue({
    label: "$5 off",
    tags: ["$a", "b"],
    at: new Date("2026-01-02T00:00:00.000Z"),
    counts: new Map([["views", 3]]),
    onClick: () => {},
    missing: undefined,
  });

  assert.assertEquals(encoded, {
    label: "$$5 off",
    tags: ["$$a", "b"],
    at: "2026-01-02T00:00:00.000Z",
    counts: {},
  });
});

Deno.test("track-l-delete: RSC Protocol - encodeJsonValue drops what JSON.stringify drops", () => {
  assert.assertEquals(protocol.encodeJsonValue(undefined), undefined);
  assert.assertEquals(
    protocol.encodeJsonValue(() => {}),
    undefined,
  );
  assert.assertEquals(protocol.encodeJsonValue(Symbol("s")), undefined);
  assert.assertEquals(protocol.encodeJsonValue(null), null);
  assert.assertEquals(protocol.encodeJsonValue(0), 0);
  assert.assertEquals(protocol.encodeJsonValue(false), false);
});
