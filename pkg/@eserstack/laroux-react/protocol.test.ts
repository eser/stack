// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.
/**
 * Tests for RSC Wire Protocol
 */

import { assertEquals, assertExists } from "@std/assert";
import {
  createClientReference,
  isClientReference,
  parseChunk,
  type RSCChunk,
  serializeChunk,
} from "./protocol.ts";

Deno.test("RSC Protocol - Serialize Module Chunk", () => {
  const chunk: RSCChunk = {
    type: "M",
    id: 1,
    value: {
      id: "./counter.tsx",
      chunks: ["client"],
      name: "default",
    },
  };

  const serialized = serializeChunk(chunk);
  assertEquals(
    serialized,
    'M1:{"id":"./counter.tsx","chunks":["client"],"name":"default"}\n',
  );
});

Deno.test("RSC Protocol - Serialize JSON Chunk", () => {
  const chunk: RSCChunk = {
    type: "J",
    id: 0,
    value: { message: "Hello, RSC!" },
  };

  const serialized = serializeChunk(chunk);
  assertEquals(serialized, 'J0:{"message":"Hello, RSC!"}\n');
});

Deno.test("RSC Protocol - Serialize Error Chunk", () => {
  const chunk: RSCChunk = {
    type: "E",
    id: 2,
    value: { message: "Something went wrong", stack: "Error stack..." },
  };

  const serialized = serializeChunk(chunk);
  assertExists(serialized);
  assertEquals(serialized.startsWith("E2:"), true);
});

Deno.test("RSC Protocol - Parse Module Chunk", () => {
  const line =
    'M1:{"id":"./counter.tsx","chunks":["client"],"name":"default"}\n';
  const parsed = parseChunk(line);

  assertExists(parsed);
  assertEquals(parsed?.type, "M");
  assertEquals(parsed?.id, 1);
  // deno-lint-ignore no-explicit-any
  assertEquals((parsed?.value as any).id, "./counter.tsx");
});

Deno.test("RSC Protocol - Parse JSON Chunk", () => {
  const line = 'J0:{"message":"Hello"}\n';
  const parsed = parseChunk(line);

  assertExists(parsed);
  assertEquals(parsed?.type, "J");
  assertEquals(parsed?.id, 0);
  // deno-lint-ignore no-explicit-any
  assertEquals((parsed?.value as any).message, "Hello");
});

Deno.test("RSC Protocol - Round-trip Serialization", () => {
  const original: RSCChunk = {
    type: "J",
    id: 5,
    value: { nested: { data: [1, 2, 3] } },
  };

  const serialized = serializeChunk(original);
  const parsed = parseChunk(serialized);

  assertExists(parsed);
  assertEquals(parsed?.type, original.type);
  assertEquals(parsed?.id, original.id);
  assertEquals(JSON.stringify(parsed?.value), JSON.stringify(original.value));
});

Deno.test("RSC Protocol - Create Client Reference", () => {
  const ref = createClientReference("./Button.tsx", "default");

  assertExists(ref);
  assertEquals(ref.$$typeof, Symbol.for("react.client.reference"));
  assertEquals(ref.$$id, "./Button.tsx");
  assertEquals(ref.name, "default");
});

Deno.test("RSC Protocol - Is Client Reference", () => {
  const ref = createClientReference("./Button.tsx", "default");
  assertEquals(isClientReference(ref), true);

  const notRef = { some: "object" };
  assertEquals(isClientReference(notRef), false);

  assertEquals(isClientReference(null), false);
  assertEquals(isClientReference("string"), false);
});

Deno.test("RSC Protocol - Parse Invalid Chunk", () => {
  const invalid = "invalid chunk data";
  const parsed = parseChunk(invalid);
  assertEquals(parsed, null);
});

Deno.test("RSC Protocol - Parse Empty String", () => {
  const parsed = parseChunk("");
  assertEquals(parsed, null);
});
