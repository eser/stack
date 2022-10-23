import { homeAction } from "@app/actions/home.ts";
import { asserts } from "../deps.ts";

Deno.test("actions:home", async (t) => {
  await t.step("basic output", () => {
    const expected = "Hello world!";

    asserts.assertEquals(expected, homeAction());
  });
});
