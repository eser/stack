import { assert, bdd, mock } from "../deps.ts";
import { Ok } from "./results.ts";
import { fnExec, fnIter } from "./execute.ts";

bdd.describe("cool/functions/execute", () => {
  bdd.it("simple fnExec", async () => {
    const spyFn = mock.spy();

    // deno-lint-ignore no-explicit-any
    const fn = (ctx: any) => {
      spyFn();

      return Ok(ctx);
    };

    const result = await fnExec(fn, { value: "Testing" });

    mock.assertSpyCalls(spyFn, 1);
    assert.assertEquals(result.payload.value, "Testing");
  });

  bdd.it("simple fnIter", async () => {
    const spyFn = mock.spy();

    const fn = function* () {
      spyFn();

      yield Ok("hello");
      yield Ok("world");
    };

    const items = [];
    for await (const item of fnIter(fn)) {
      items.push(item.payload);
    }

    mock.assertSpyCalls(spyFn, 1);
    assert.assertEquals(items, ["hello", "world"]);
  });
});
