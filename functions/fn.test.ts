import { assert, bdd, mock } from "../deps.ts";
import { Ok } from "./results.ts";
import { fn } from "./fn.ts";

bdd.describe("cool/functions/fn", () => {
  bdd.it("simple fn().run()", async () => {
    const spyFn = mock.spy();

    const fns = fn(
      function () {
        spyFn();

        return Ok("Testing");
      },
    );

    const result = await fns.run();

    mock.assertSpyCalls(spyFn, 1);
    assert.assertEquals(result[0]?.payload, "Testing");
  });

  bdd.it("simple fn().iterate()", async () => {
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

  bdd.it("multiple fn().iterate()", async () => {
    const spyFn1 = mock.spy();
    const spyFn2 = mock.spy();

    const fns = fn(
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

  bdd.it("fn().use().run()", async () => {
    const spyFn1 = mock.spy();
    const spyFn2 = mock.spy();

    const fns = fn()
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

  bdd.it("alias fn()", async () => {
    const spyFn = mock.spy();

    const express = fn;

    const result = await express()
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
});
