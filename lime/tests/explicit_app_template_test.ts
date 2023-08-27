import {
  assertNotSelector,
  assertSelector,
  assertTextMany,
  fetchHtml,
  withLime,
} from "$cool/lime/tests/test_utils.ts";
import { assertNotMatch } from "$std/testing/asserts.ts";

Deno.test("doesn't apply internal app template", async () => {
  await withLime(
    "./tests/fixture_explicit_app/main.ts",
    async (address) => {
      const doc = await fetchHtml(`${address}`);

      // Doesn't render internal app template
      assertNotSelector(doc, "body body");

      assertSelector(doc, "html > head");
      assertSelector(doc, "html > body");
      assertSelector(doc, `meta[charset="utf-8"]`);
      assertSelector(
        doc,
        `meta[name="viewport"][content="width=device-width, initial-scale=1.0"]`,
      );
      assertTextMany(doc, "title", ["cool lime title"]);

      // Still renders page
      assertSelector(doc, "body > .inner-body > .page");
    },
  );
});

Deno.test("user _app works with <Head>", async () => {
  await withLime(
    "./tests/fixture_explicit_app/main.ts",
    async (address) => {
      const doc = await fetchHtml(`${address}/head`);

      // Doesn't render internal app template
      assertNotSelector(doc, "body body");

      assertSelector(doc, "html > head");
      assertSelector(doc, "html > body");
      assertSelector(doc, `meta[charset="utf-8"]`);
      assertSelector(
        doc,
        `meta[name="viewport"][content="width=device-width, initial-scale=1.0"]`,
      );
      assertSelector(
        doc,
        `meta[name="lime"][content="test"]`,
      );

      // Still renders page
      assertSelector(doc, "body > .inner-body > .page");
    },
  );
});

Deno.test("don't duplicate <title>", async () => {
  await withLime(
    "./tests/fixture_explicit_app/main.ts",
    async (address) => {
      const doc = await fetchHtml(`${address}/title`);
      assertTextMany(doc, "title", ["foo bar"]);
    },
  );
});

Deno.test("sets <html> + <head> + <body> classes", async () => {
  await withLime(
    "./tests/fixture_explicit_app/main.ts",
    async (address) => {
      const doc = await fetchHtml(`${address}`);
      assertSelector(doc, "html.html");
      assertSelector(doc, "head.head");
      assertSelector(doc, "body.body");
    },
  );
});

Deno.test("renders valid html document", async () => {
  await withLime(
    "./tests/fixture_explicit_app/main.ts",
    async (address) => {
      const res = await fetch(address);
      const text = await res.text();

      assertNotMatch(text, /<\/body><\/head>/);
    },
  );
});
