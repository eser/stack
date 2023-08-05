import * as di from "@hex/di/mod.ts";
import { echoAction } from "@app/actions/echo.ts";
import { assert } from "@app/deps.ts";

Deno.test("actions:echo", async (t) => {
  await t.step("basic output", () => {
    const slug = "eser";
    const test = "placeholder value";

    di.registry.setValue("test", test);

    const expected = {
      message: `Hello ${slug}! Testing ${test}...`,
      timestamp: new Date().toLocaleDateString(),
    };

    assert.assertEquals(expected, echoAction({ registry: di.registry, slug }));
  });
});
