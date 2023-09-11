import { services } from "$cool/di/mod.ts";
import { echoAction } from "./echo.ts";
import { assert } from "../deps.ts";

Deno.test("actions:echo", async (t) => {
  await t.step("basic output", () => {
    const slug = "eser";
    const test = "placeholder value";

    services.registry.set("test", test);

    const expected = {
      message: `Hello ${slug}! Testing ${test}...`,
      timestamp: new Date().toLocaleDateString(),
    };

    assert.assertEquals(expected, echoAction({ services, slug }));
  });
});
