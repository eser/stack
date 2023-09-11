import * as assert from "$std/assert/mod.ts";
import * as bdd from "$std/testing/bdd.ts";

import {
  executeFromCli,
  type HexFunctionContext,
  type HexFunctionInput,
  type HexFunctionResult,
  results,
} from "./mod.ts";

bdd.describe("cool/hex/functions/execute", () => {
  bdd.it("basic", async () => {
    const fn1 = (
      input: HexFunctionInput,
      _ctx: HexFunctionContext,
    ): HexFunctionResult => {
      const to = input.params[0] ?? "world";
      const message = `hello ${to}`;

      return results.text(message);
    };

    const executed = await executeFromCli(fn1);

    const result1 = await executed.next();
    const result2 = await executed.next();

    assert.assertEquals(result1, {
      value: { payload: "hello world" },
      done: false,
    });
    assert.assertEquals(result2, { value: undefined, done: true });
  });

  bdd.it("with-extra-data", async () => {
    const fn1 = (
      input: HexFunctionInput,
      _ctx: HexFunctionContext,
    ): HexFunctionResult => {
      const to = input.params[0] ?? "world";
      const message = `hello ${to}`;

      return results.text(message, { hello: "darkness" });
    };

    const executed = await executeFromCli(fn1);

    const result1 = await executed.next();
    const result2 = await executed.next();

    assert.assertEquals(result1, {
      value: { payload: "hello world", extraData: { hello: "darkness" } },
      done: false,
    });
    assert.assertEquals(result2, { value: undefined, done: true });
  });
});
