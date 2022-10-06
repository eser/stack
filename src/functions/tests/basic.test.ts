import { asserts } from "./deps.ts";

import {
  executeFromCli,
  type HexFunctionContext,
  type HexFunctionInput,
  type HexFunctionResult,
  results,
} from "../mod.ts";

Deno.test("hex/functions/execute:basic", async () => {
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

  asserts.assertEquals(result1, {
    value: { payload: "hello world" },
    done: false,
  });
  asserts.assertEquals(result2, { value: undefined, done: true });
});

Deno.test("hex/functions/execute:with-extra-data", async () => {
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

  asserts.assertEquals(result1, {
    value: { payload: "hello world", extraData: { hello: "darkness" } },
    done: false,
  });
  asserts.assertEquals(result2, { value: undefined, done: true });
});
