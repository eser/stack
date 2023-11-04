import { assert, bdd, mock } from "../deps.ts";
import { Ok } from "./results.ts";
import { type Context, fn } from "./fn.ts";

bdd.describe("cool/functions/fn", () => {
  bdd.it("simple fn().run()", async () => {
    const spyFn = mock.spy();

    const fn1 = function () {
      spyFn();

      return Ok("Testing");
    };

    const result = await fn(fn1).run();

    mock.assertSpyCalls(spyFn, 1);
    assert.assertEquals(result[0]?.payload, "Testing");
  });

  bdd.it("simple fn().iterate()", async () => {
    const spyFn = mock.spy();

    const fn1 = function* () {
      spyFn();

      yield Ok("hello");
      yield Ok("world");
    };

    const items = [];
    for await (const item of fn(fn1).iterate()) {
      items.push(item.payload);
    }

    mock.assertSpyCalls(spyFn, 1);
    assert.assertEquals(items, ["hello", "world"]);
  });

  bdd.it("multiple fn().iterate()", async () => {
    const spyFn1 = mock.spy();

    const fn1 = async function* (c: Context) {
      spyFn1();

      yield Ok("hello");
      yield* await c.next();
    };

    const spyFn2 = mock.spy();

    const fn2 = function* () {
      spyFn2();

      yield Ok("world");
    };

    const items = [];
    for await (const item of fn(fn1, fn2).iterate()) {
      items.push(item.payload);
    }

    mock.assertSpyCalls(spyFn1, 1);
    mock.assertSpyCalls(spyFn2, 1);
    assert.assertEquals(items, ["hello", "world"]);
  });
});
