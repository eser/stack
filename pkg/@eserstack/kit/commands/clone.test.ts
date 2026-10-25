// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as mock from "@eserstack/test-kit/mock";
import * as results from "@eserstack/primitives/results";
import * as cloneRecipe from "../recipes/handlers/clone-recipe.ts";
import * as clone from "./clone.ts";

Deno.test("parseSpecifier — owner/repo format", () => {
  const result = cloneRecipe.parseSpecifier("eser/ajan");

  assert.assertExists(result);
  assert.assertEquals(result!.owner, "eser");
  assert.assertEquals(result!.repo, "ajan");
  assert.assertEquals(result!.ref, "main");
});

Deno.test("parseSpecifier — gh: prefix", () => {
  const result = cloneRecipe.parseSpecifier("gh:eser/ajan");

  assert.assertExists(result);
  assert.assertEquals(result!.owner, "eser");
  assert.assertEquals(result!.repo, "ajan");
  assert.assertEquals(result!.ref, "main");
});

Deno.test("parseSpecifier — gh: prefix with ref", () => {
  const result = cloneRecipe.parseSpecifier("gh:eser/ajan#v1.0");

  assert.assertExists(result);
  assert.assertEquals(result!.owner, "eser");
  assert.assertEquals(result!.repo, "ajan");
  assert.assertEquals(result!.ref, "v1.0");
});

Deno.test("parseSpecifier — branch ref", () => {
  const result = cloneRecipe.parseSpecifier("eser/stack#dev");

  assert.assertExists(result);
  assert.assertEquals(result!.ref, "dev");
});

Deno.test("parseSpecifier — returns undefined for invalid format", () => {
  assert.assertEquals(cloneRecipe.parseSpecifier("just-a-name"), undefined);
  assert.assertEquals(cloneRecipe.parseSpecifier(""), undefined);
  assert.assertEquals(cloneRecipe.parseSpecifier("/repo"), undefined);
  assert.assertEquals(cloneRecipe.parseSpecifier("owner/"), undefined);
});

Deno.test("parseSpecifier — handles complex repo names", () => {
  const result = cloneRecipe.parseSpecifier("eser/laroux-template-minimal");

  assert.assertExists(result);
  assert.assertEquals(result!.owner, "eser");
  assert.assertEquals(result!.repo, "laroux-template-minimal");
});

// =============================================================================
// resolveExtractLimits: flag, then environment, then default
// =============================================================================

const envOf =
  (vars: Readonly<Record<string, string>>) =>
  (name: string): string | undefined =>
    vars[name];

const limitCases: ReadonlyArray<{
  readonly name: string;
  readonly flags: { readonly maxBytes?: string; readonly maxEntries?: string };
  readonly env: Readonly<Record<string, string>>;
  readonly expected: clone.ExtractLimits;
}> = [
  {
    name: "leaves both limits to the default when nothing is set",
    flags: {},
    env: {},
    expected: { maxBytes: undefined, maxEntries: undefined },
  },
  {
    name: "reads the environment variables",
    flags: {},
    env: { [clone.MAX_BYTES_ENV]: "1048576", [clone.MAX_ENTRIES_ENV]: "50" },
    expected: { maxBytes: 1048576, maxEntries: 50 },
  },
  {
    name: "prefers the flag over the environment variable",
    flags: { maxBytes: "2048", maxEntries: "7" },
    env: { [clone.MAX_BYTES_ENV]: "1024", [clone.MAX_ENTRIES_ENV]: "50" },
    expected: { maxBytes: 2048, maxEntries: 7 },
  },
  {
    name: "treats an empty environment variable as unset",
    flags: {},
    env: { [clone.MAX_BYTES_ENV]: "", [clone.MAX_ENTRIES_ENV]: "" },
    expected: { maxBytes: undefined, maxEntries: undefined },
  },
];

for (const { name, flags, env, expected } of limitCases) {
  Deno.test(`resolveExtractLimits: ${name}`, () => {
    const resolved = clone.resolveExtractLimits(flags, envOf(env));

    assert.assertEquals(results.getOrThrow(resolved), expected);
  });
}

const invalidLimitCases: ReadonlyArray<{
  readonly name: string;
  readonly flags: { readonly maxBytes?: string; readonly maxEntries?: string };
  readonly env: Readonly<Record<string, string>>;
  readonly message: string;
}> = [
  {
    name: "a word",
    flags: { maxBytes: "lots" },
    env: {},
    message: '--max-bytes "lots" is not a positive integer',
  },
  {
    name: "zero",
    flags: { maxEntries: "0" },
    env: {},
    message: '--max-entries "0" is not a positive integer',
  },
  {
    name: "a fraction",
    flags: { maxBytes: "1.5" },
    env: {},
    message: '--max-bytes "1.5" is not a positive integer',
  },
  {
    name: "an empty flag",
    flags: { maxBytes: "" },
    env: {},
    message: '--max-bytes "" is not a positive integer',
  },
  {
    name: "a value past the safe integer range",
    flags: { maxBytes: "99999999999999999999" },
    env: {},
    message: "is not a positive integer",
  },
  {
    name: "a bad environment variable",
    flags: {},
    env: { [clone.MAX_ENTRIES_ENV]: "-1" },
    message: `${clone.MAX_ENTRIES_ENV} "-1" is not a positive integer`,
  },
];

for (const { name, flags, env, message } of invalidLimitCases) {
  Deno.test(`resolveExtractLimits: rejects ${name}`, () => {
    const resolved = clone.resolveExtractLimits(flags, envOf(env));

    assert.assertEquals(results.isFail(resolved), true);
    if (results.isFail(resolved)) {
      assert.assertInstanceOf(resolved.error, RangeError);
      assert.assertStringIncludes(resolved.error.message, message);
    }
  });
}

Deno.test("clone: reports an invalid --max-bytes before cloning", async () => {
  const result = await clone.main(["eser/stack", "--max-bytes", "lots"]);

  assert.assertEquals(results.isFail(result), true);
  if (results.isFail(result)) {
    assert.assertEquals(result.error, {
      message:
        '--max-bytes "lots" is not a positive integer; expected a whole number such as 536870912 for 512 MiB',
      exitCode: 1,
    });
  }
});

Deno.test("clone: names the flag and variable when the tarball is over a limit", async () => {
  // 2 KiB of zeros, gzipped: past a 512-byte maxBytes on the first chunk, so
  // extraction stops in its temporary directory before writing anything.
  const routes: Readonly<Record<string, () => Response>> = {
    "https://raw.githubusercontent.com/owner/repo/main/recipe.json": () =>
      new Response("", { status: 404 }),
    "https://codeload.github.com/owner/repo/tar.gz/main": () =>
      new Response(
        ReadableStream.from([new Uint8Array(2048)]).pipeThrough(
          new CompressionStream("gzip") as unknown as TransformStream<
            Uint8Array,
            Uint8Array
          >,
        ),
      ),
  };
  using _fetch = mock.stub(globalThis, "fetch", (input) => {
    const route = routes[input instanceof Request ? input.url : String(input)];
    return route !== undefined
      ? Promise.resolve(route())
      : Promise.reject(new TypeError(`fake fetch: no route for ${input}`));
  });

  const result = await clone.main([
    "gh:owner/repo",
    "--max-bytes",
    "512",
    "--no-interactive",
  ]);

  assert.assertEquals(results.isFail(result), true);
  if (results.isFail(result)) {
    const lines = (result.error.message ?? "").split("\n");
    assert.assertEquals(
      lines[0],
      "apply recipe gh:owner/repo#main: extract gh:owner/repo#main; no files were written",
    );
    assert.assertEquals(
      lines.at(-1),
      `If you trust this repository, raise the limit with --max-bytes <n> or ${clone.MAX_BYTES_ENV}=<n>.`,
    );
  }
});
