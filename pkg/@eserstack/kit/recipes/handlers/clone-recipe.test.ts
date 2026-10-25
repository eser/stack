// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as bdd from "node:test";
import * as mock from "@eserstack/test-kit/mock";
import * as tarStream from "@std/tar/tar-stream";
import * as task from "@eserstack/functions/task";
import * as results from "@eserstack/primitives/results";
import * as streams from "@eserstack/streams";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as errorChain from "../error-chain.ts";
import * as registryFetcher from "../registry-fetcher.ts";
import * as tar from "../tar.ts";
import * as cloneRecipe from "./clone-recipe.ts";
import * as testing from "../testing.ts";

const RECIPE_URL =
  "https://raw.githubusercontent.com/owner/repo/main/recipe.json";
const TARBALL_URL = "https://codeload.github.com/owner/repo/tar.gz/main";

/**
 * Stands in for globalThis.fetch: answers each URL in `routes` and rejects
 * any other request, so a test cannot reach the network by accident.
 */
const fakeFetch =
  (routes: Readonly<Record<string, () => Response>>): typeof globalThis.fetch =>
  (input) => {
    const url = input instanceof Request ? input.url : String(input);
    const route = routes[url];
    if (route === undefined) {
      return Promise.reject(new TypeError(`fake fetch: no route for ${url}`));
    }

    return Promise.resolve(route());
  };

/** A gzipped tarball with one 1 KiB file, as codeload.github.com serves it. */
const oneFileTarball = (): ReadableStream<Uint8Array> => {
  const bytes = new TextEncoder().encode("x".repeat(1024));
  const input: tarStream.TarStreamInput = {
    type: "file",
    path: "repo-main/data.txt",
    size: bytes.length,
    readable: testing.readableStreamFrom([bytes]),
  };

  return testing
    .readableStreamFrom([input])
    .pipeThrough(new tarStream.TarStream())
    .pipeThrough(
      new CompressionStream("gzip") as unknown as TransformStream<
        Uint8Array,
        Uint8Array
      >,
    );
};

/** Runs the clone handler for gh:owner/repo into `dir`. */
const runClone = async (
  dir: string,
  options: Omit<cloneRecipe.CloneRecipeInput, "specifier" | "cwd">,
): Promise<
  results.Result<cloneRecipe.CloneRecipeOutput, cloneRecipe.CloneRecipeError>
> => {
  const specifier = cloneRecipe.parseSpecifier("gh:owner/repo");
  assert.assertExists(specifier);

  const out = streams.output({
    renderer: streams.renderers.plain(),
    sink: streams.sinks.nullSink(),
  });
  try {
    return await task.runTask(
      cloneRecipe.cloneRecipe({ specifier, cwd: dir, ...options }),
      { out },
    );
  } finally {
    await out.close();
  }
};

const withTempDir = async (
  fn: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await runtime.fs.makeTempDir({ prefix: "kit-clone-test-" });
  try {
    await fn(dir);
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
};

bdd.describe("cloneRecipe: whole-repo tarball limits", () => {
  const wholeRepoRoutes = {
    [RECIPE_URL]: () => new Response("", { status: 404 }),
    [TARBALL_URL]: () => new Response(oneFileTarball()),
  };

  bdd.it("fails with the limit error as the cause", async () => {
    using _fetch = mock.stub(globalThis, "fetch", fakeFetch(wholeRepoRoutes));

    await withTempDir(async (dir) => {
      const result = await runClone(dir, { maxBytes: 512 });

      assert.assertEquals(results.isFail(result), true);
      if (!results.isFail(result)) return;

      assert.assertEquals(result.error._tag, "ApplyError");
      const limit = errorChain.findCause(
        result.error.cause,
        tar.TarballLimitError,
      );
      assert.assertExists(limit);
      assert.assertEquals(limit.max, 512);
      assert.assertStringIncludes(
        result.error.message,
        "  caused by: extract tarball: decompressed size exceeds maxBytes (512 bytes)",
      );
    });
  });

  bdd.it("passes a raised limit through to the extraction", async () => {
    using _fetch = mock.stub(globalThis, "fetch", fakeFetch(wholeRepoRoutes));

    await withTempDir(async (dir) => {
      const result = await runClone(dir, { maxBytes: 64 * 1024 });

      assert.assertEquals(results.isOk(result), true);
      assert.assertEquals(
        await runtime.fs.readTextFile(runtime.path.join(dir, "data.txt")),
        "x".repeat(1024),
      );
    });
  });
});

bdd.describe("cloneRecipe: dry run", () => {
  bdd.it("lists the files and creates no project directory", async () => {
    using _fetch = mock.stub(
      globalThis,
      "fetch",
      fakeFetch({
        [RECIPE_URL]: () => new Response("", { status: 404 }),
        [TARBALL_URL]: () => new Response(oneFileTarball()),
      }),
    );

    await withTempDir(async (dir) => {
      const result = await runClone(dir, { projectName: "app", dryRun: true });

      assert.assertEquals(results.isOk(result), true);
      if (!results.isOk(result)) return;

      assert.assertEquals(result.value.result.written, ["data.txt"]);
      assert.assertEquals(
        await runtime.fs.exists(runtime.path.join(dir, "app")),
        false,
      );
    });
  });
});

bdd.describe("cloneRecipe: recipe.json failures", () => {
  bdd.it("reports a FetchError with the load error as the cause", async () => {
    using _fetch = mock.stub(
      globalThis,
      "fetch",
      fakeFetch({ [RECIPE_URL]: () => new Response("", { status: 500 }) }),
    );

    await withTempDir(async (dir) => {
      const result = await runClone(dir, {});

      assert.assertEquals(results.isFail(result), true);
      if (!results.isFail(result)) return;

      assert.assertEquals(result.error._tag, "FetchError");
      assert.assertInstanceOf(
        result.error.cause,
        registryFetcher.RecipeLoadError,
      );
      assert.assertEquals(result.error.message.split("\n"), [
        "load recipe owner/repo@main/recipe.json: download it; check that the repository exists: https://github.com/owner/repo",
        `  caused by: GET ${RECIPE_URL}: HTTP 500; the host had an error, so retry later`,
      ]);
    });
  });
});
