import { assert, bdd, mock } from "../deps.ts";
import { Ok } from "./results.ts";
import { fn } from "./fn.ts";

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
});
