// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as mock from "@std/testing/mock";
import { Ok, type Result } from "./results.ts";
import { fn } from "./fn.ts";

Deno.test("simple fn().run()", async () => {
  const spyFn = mock.spy();

  const fns = fn<Result<string>>(
    () => {
      spyFn();

      return Ok("Testing");
    },
  );

  const result = await fns.run();

  mock.assertSpyCalls(spyFn, 1);
  assert.assertEquals(result[0]?.payload, "Testing");
});

Deno.test("simple fn().iterate()", async () => {
  const spyFn = mock.spy();

  const fns = fn(
    function* () {
      spyFn();

      yield Ok("hello");
      yield Ok("world");
    },
  );

  const items = [];
  for await (const item of fns.iterate()) {
    items.push(item.payload);
  }

  mock.assertSpyCalls(spyFn, 1);
  assert.assertEquals(items, ["hello", "world"]);
});

Deno.test("multiple fn().iterate()", async () => {
  const spyFn1 = mock.spy();
  const spyFn2 = mock.spy();

  const fns = fn<Result<string>>(
    async function* (c) {
      spyFn1();

      yield Ok("hello");
      yield* c.next();
    },
    async function* () {
      spyFn2();

      yield Ok("world");
    },
  );

  const items = [];
  for await (const item of fns.iterate()) {
    items.push(item.payload);
  }

  mock.assertSpyCalls(spyFn1, 1);
  mock.assertSpyCalls(spyFn2, 1);
  assert.assertEquals(items, ["hello", "world"]);
});

Deno.test("fn().use().run()", async () => {
  const spyFn1 = mock.spy();
  const spyFn2 = mock.spy();

  const fns = fn<Result<string>>()
    .use(
      async function* (c) {
        spyFn1();

        yield Ok("hello");
        yield* c.next();
      },
    )
    .use(
      async function* () {
        spyFn2();

        yield Ok("world");
      },
    );

  const items = await fns.run();

  mock.assertSpyCalls(spyFn1, 1);
  mock.assertSpyCalls(spyFn2, 1);
  assert.assertEquals(items, [
    { payload: "hello" },
    { payload: "world" },
  ]);
});

Deno.test("alias fn()", async () => {
  const spyFn = mock.spy();

  const express = fn;

  const result = await express<Result<string>>()
    .use(
      async function* (c) {
        spyFn();

        yield Ok("Testing");
        yield* c.next();
      },
    )
    .run();

  mock.assertSpyCalls(spyFn, 1);
  assert.assertEquals(result[0]?.payload, "Testing");
});
