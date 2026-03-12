// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import { pipe } from "./pipe.ts";

Deno.test("pipe with single value returns it unchanged", () => {
  const result = pipe(42);
  assert.assertEquals(result, 42);
});

Deno.test("pipe threads value through one function", () => {
  const result = pipe("hello", (x: string) => x.toUpperCase());
  assert.assertEquals(result, "HELLO");
});

Deno.test("pipe threads value through multiple functions", () => {
  const result = pipe(
    "Hello World!",
    (x: string) => x.toLowerCase(),
    (x: string) => x.replace(/[^\w \\-]+/g, ""),
    (x: string) => x.split(" "),
    (x: Array<string>) => x.join("-"),
  );
  assert.assertEquals(result, "hello-world");
});

Deno.test("pipe preserves types through the chain", () => {
  const result = pipe(
    10,
    (x: number) => x * 2,
    (x: number) => String(x),
    (x: string) => x.length,
  );
  assert.assertEquals(result, 2);
});

Deno.test("pipe works with array operations", () => {
  const result = pipe(
    [3, 1, 4, 1, 5],
    (xs: number[]) => xs.filter((x) => x > 2),
    (xs: number[]) => xs.map((x) => x * 10),
    (xs: number[]) => xs.reduce((a, b) => a + b, 0),
  );
  assert.assertEquals(result, 120);
});

Deno.test("pipe with boolean result", () => {
  const result = pipe(
    "hello",
    (s: string) => s.length,
    (n: number) => n > 3,
  );
  assert.assertEquals(result, true);
});

Deno.test("pipe with object transformations", () => {
  const result = pipe(
    { name: "test", value: 42 },
    (o: { name: string; value: number }) => o.value,
    (n: number) => n * 2,
  );
  assert.assertEquals(result, 84);
});

Deno.test("pipe with many steps", () => {
  const result = pipe(
    1,
    (x: number) => x + 1,
    (x: number) => x + 1,
    (x: number) => x + 1,
    (x: number) => x + 1,
    (x: number) => x + 1,
  );
  assert.assertEquals(result, 6);
});
