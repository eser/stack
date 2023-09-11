import {
  assertSelector,
  fetchHtml,
  withLime,
} from "$cool/lime/tests/test_utils.ts";
import { assertEquals } from "$std/assert/mod.ts";

Deno.test("doesn't leak data across renderers", async () => {
  await withLime("./tests/fixture/main.ts", async (address) => {
    function load(name: string) {
      return fetchHtml(`${address}/admin/${name}`).then((doc) => {
        assertSelector(doc, "#__LIME_STATE");
        const text = doc.querySelector("#__LIME_STATE")?.textContent!;
        const json = JSON.parse(text);
        assertEquals(json, { "v": [[{ "site": name }], []] });
      });
    }

    const promises: Promise<void>[] = [];
    for (let i = 0; i < 100; i++) {
      promises.push(load("foo"));
      promises.push(load("bar"));
    }

    await Promise.all(promises);
  });
});
