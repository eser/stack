// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// These tests swap the global fetch and put the original back in a finally;
// the tests of one module run one at a time.

import * as assert from "@eserstack/test-kit/assert";
import * as bdd from "node:test";
import * as h3Fetch from "./h3-fetch.ts";

const withGlobalFetch = async (
  replacement: typeof fetch | undefined,
  fn: () => Promise<void> | void,
): Promise<void> => {
  const scope = globalThis as { fetch?: typeof fetch };
  const original = scope.fetch;
  if (replacement === undefined) {
    delete scope.fetch;
  } else {
    scope.fetch = replacement;
  }
  try {
    await fn();
  } finally {
    scope.fetch = original;
  }
};

bdd.describe("createH3FetchFn", () => {
  bdd.it("returns a function that sends through the global fetch", async () => {
    const seen: string[] = [];
    const fake: typeof fetch = (input) => {
      seen.push(String(input));
      return Promise.resolve(new Response("ok"));
    };

    await withGlobalFetch(fake, async () => {
      const fetchFn = h3Fetch.createH3FetchFn();
      const response = await fetchFn("https://localhost:4433/api/health");

      assert.assertEquals(await response.text(), "ok");
      assert.assertEquals(seen, ["https://localhost:4433/api/health"]);
    });
  });

  bdd.it(
    "binds fetch to globalThis, so a detached call still works",
    async () => {
      const receivers: unknown[] = [];
      const fake = function (this: unknown) {
        receivers.push(this);
        return Promise.resolve(new Response("ok"));
      } as typeof fetch;

      await withGlobalFetch(fake, async () => {
        const fetchFn = h3Fetch.createH3FetchFn();
        await fetchFn("https://localhost:4433/");

        assert.assertEquals(receivers.length, 1);
        assert.assertStrictEquals(receivers[0], globalThis);
      });
    },
  );

  bdd.it("names the fix when the runtime has no fetch", async () => {
    await withGlobalFetch(undefined, () => {
      assert.assertThrows(
        () => h3Fetch.createH3FetchFn(),
        Error,
        "pass your own fetchFn to createHttpClient",
      );
    });
  });
});
