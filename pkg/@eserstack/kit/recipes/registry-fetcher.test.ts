// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as mock from "@eserstack/test-kit/mock";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as registryFetcher from "./registry-fetcher.ts";

const { runtime } = crossRuntime;

/**
 * Stands in for globalThis.fetch: answers each URL in `routes` and rejects
 * any other request, so a test cannot reach the network by accident.
 */
const fakeFetch = (
  routes: Readonly<Record<string, () => Response>>,
): typeof globalThis.fetch =>
(input) => {
  const url = input instanceof Request ? input.url : String(input);
  const route = routes[url];
  if (route === undefined) {
    return Promise.reject(new TypeError(`fake fetch: no route for ${url}`));
  }

  return Promise.resolve(route());
};

// =============================================================================
// parseGitHubRawUrl
// =============================================================================

Deno.test("sourceBaseFor — a github-provider source sits at the repository root", () => {
  const registry = "https://raw.githubusercontent.com/eser/stack/main/.eser";

  assert.assertEquals(
    registryFetcher.sourceBaseFor({ source: "x", target: "y" }, registry),
    registry,
  );
  assert.assertEquals(
    registryFetcher.sourceBaseFor(
      { source: "pkg/ajan/lib/", target: "y", provider: "github" },
      registry,
    ),
    "https://raw.githubusercontent.com/eser/stack/main",
  );
  assert.assertEquals(
    registryFetcher.sourceBaseFor(
      { source: "lib/", target: "y", provider: "github" },
      "gh:eser/ajan#v1",
    ),
    "https://raw.githubusercontent.com/eser/ajan/v1",
  );
  assert.assertThrows(
    () =>
      registryFetcher.sourceBaseFor(
        { source: "lib/", target: "y", provider: "github" },
        "https://example.com/registry",
      ),
    registryFetcher.RecipeLoadError,
    "GitHub",
  );
});

Deno.test("parseGitHubRawUrl — parses standard raw URL", () => {
  const result = registryFetcher.parseGitHubRawUrl(
    "https://raw.githubusercontent.com/eser/stack/main/.eser",
  );

  assert.assertExists(result);
  assert.assertEquals(result!.owner, "eser");
  assert.assertEquals(result!.repo, "stack");
  assert.assertEquals(result!.ref, "main");
  assert.assertEquals(result!.basePath, ".eser");
});

Deno.test("parseGitHubRawUrl — parses URL with tag ref", () => {
  const result = registryFetcher.parseGitHubRawUrl(
    "https://raw.githubusercontent.com/eser/ajan/v1.0/recipes",
  );

  assert.assertExists(result);
  assert.assertEquals(result!.owner, "eser");
  assert.assertEquals(result!.repo, "ajan");
  assert.assertEquals(result!.ref, "v1.0");
  assert.assertEquals(result!.basePath, "recipes");
});

Deno.test("parseGitHubRawUrl — parses URL without path", () => {
  const result = registryFetcher.parseGitHubRawUrl(
    "https://raw.githubusercontent.com/eser/stack/main",
  );

  assert.assertExists(result);
  assert.assertEquals(result!.basePath, "");
});

Deno.test("parseGitHubRawUrl — parses URL with deep path", () => {
  const result = registryFetcher.parseGitHubRawUrl(
    "https://raw.githubusercontent.com/eser/stack/dev/a/b/c/d",
  );

  assert.assertExists(result);
  assert.assertEquals(result!.ref, "dev");
  assert.assertEquals(result!.basePath, "a/b/c/d");
});

Deno.test("parseGitHubRawUrl — returns undefined for non-GitHub URL", () => {
  const result = registryFetcher.parseGitHubRawUrl(
    "https://example.com/some/path",
  );

  assert.assertEquals(result, undefined);
});

Deno.test("parseGitHubRawUrl — returns undefined for GitHub API URL", () => {
  const result = registryFetcher.parseGitHubRawUrl(
    "https://api.github.com/repos/eser/stack/contents/etc",
  );

  assert.assertEquals(result, undefined);
});

Deno.test("parseGitHubRawUrl — returns undefined for empty string", () => {
  const result = registryFetcher.parseGitHubRawUrl("");

  assert.assertEquals(result, undefined);
});

// =============================================================================
// fetchRegistry: bad registry files keep their cause
// =============================================================================

const badRegistryFiles: ReadonlyArray<{
  readonly name: string;
  readonly content: string | null;
  readonly step: string;
  readonly causeType: new (...args: never[]) => Error;
  readonly causeMessage: string;
}> = [
  {
    name: "a missing file",
    content: null,
    step:
      "the file does not exist; pass --registry with the path or URL of a recipes.json",
    causeType: crossRuntime.NotFoundError,
    causeMessage: "No such file or directory",
  },
  {
    name: "a file that is not JSON",
    content: "{ not json",
    step: "the manifest is not valid JSON",
    causeType: SyntaxError,
    causeMessage: "JSON",
  },
  {
    name: "a manifest without a name",
    content: JSON.stringify({
      name: "",
      description: "d",
      author: "a",
      registryUrl: "https://registry.example",
      recipes: [],
    }),
    step: "the manifest does not match the registry/v1 schema",
    causeType: Error,
    causeMessage: "requires a non-empty 'name' field",
  },
];

for (const testCase of badRegistryFiles) {
  Deno.test(`fetchRegistry: wraps ${testCase.name} with its cause`, async () => {
    const dir = await runtime.fs.makeTempDir({ prefix: "kit-registry-test-" });
    const registryPath = runtime.path.join(dir, "recipes.json");

    try {
      if (testCase.content !== null) {
        await runtime.fs.writeTextFile(registryPath, testCase.content);
      }

      const error = await assert.assertRejects(
        () => registryFetcher.fetchRegistry(registryPath),
        registryFetcher.RegistryLoadError,
      );

      assert.assertEquals(error.source, registryPath);
      assert.assertEquals(
        error.message,
        `load registry ${registryPath}: ${testCase.step}`,
      );
      assert.assertInstanceOf(error.cause, testCase.causeType);
      assert.assertStringIncludes(
        (error.cause as Error).message,
        testCase.causeMessage,
      );
    } finally {
      await runtime.fs.remove(dir, { recursive: true });
    }
  });
}

Deno.test("fetchRegistry: wraps the HTTP status of a remote registry", async () => {
  const url = "https://registry.example/.eser/recipes.json";
  using _fetch = mock.stub(
    globalThis,
    "fetch",
    fakeFetch({ [url]: () => new Response("missing", { status: 404 }) }),
  );

  const error = await assert.assertRejects(
    () => registryFetcher.fetchRegistry(url),
    registryFetcher.RegistryLoadError,
    `load registry ${url}: download the manifest`,
  );

  assert.assertInstanceOf(error.cause, registryFetcher.RegistryRequestError);
  assert.assertEquals(error.cause.status, 404);
  assert.assertEquals(
    error.cause.message,
    `GET ${url}: HTTP 404; check that the path exists at this ref`,
  );
});

// =============================================================================
// fetchRecipeFromRepo: recipe.json failures keep their cause
// =============================================================================

const recipeUrl =
  "https://raw.githubusercontent.com/owner/repo/main/recipe.json";

Deno.test("fetchRecipeFromRepo: a 404 is RecipeFileNotFoundError", async () => {
  using _fetch = mock.stub(
    globalThis,
    "fetch",
    fakeFetch({ [recipeUrl]: () => new Response("", { status: 404 }) }),
  );

  const error = await assert.assertRejects(
    () => registryFetcher.fetchRecipeFromRepo("owner", "repo"),
    registryFetcher.RecipeFileNotFoundError,
    "load recipe owner/repo@main/recipe.json: no file at this path",
  );

  assert.assertEquals(error.path, "recipe.json");
  assert.assertInstanceOf(error.cause, registryFetcher.RegistryRequestError);
});

Deno.test("fetchRecipeFromRepo: wraps another HTTP status", async () => {
  using _fetch = mock.stub(
    globalThis,
    "fetch",
    fakeFetch({ [recipeUrl]: () => new Response("", { status: 500 }) }),
  );

  const error = await assert.assertRejects(
    () => registryFetcher.fetchRecipeFromRepo("owner", "repo"),
    registryFetcher.RecipeLoadError,
    "check that the repository exists: https://github.com/owner/repo",
  );

  assert.assertEquals(error.location, "owner/repo@main/recipe.json");
  assert.assertInstanceOf(error.cause, registryFetcher.RegistryRequestError);
  assert.assertEquals(error.cause.status, 500);
});

Deno.test("fetchRecipeFromRepo: wraps a recipe.json that is not JSON", async () => {
  using _fetch = mock.stub(
    globalThis,
    "fetch",
    fakeFetch({ [recipeUrl]: () => new Response("{ not json") }),
  );

  const error = await assert.assertRejects(
    () => registryFetcher.fetchRecipeFromRepo("owner", "repo"),
    registryFetcher.RecipeLoadError,
    "load recipe owner/repo@main/recipe.json: the file is not valid JSON",
  );

  assert.assertInstanceOf(error.cause, SyntaxError);
});

// =============================================================================
// detectLocalRegistry
// =============================================================================

Deno.test("detectLocalRegistry: starts at the given directory", async () => {
  const root = await runtime.fs.makeTempDir({ prefix: "kit_local_" });
  try {
    await runtime.fs.mkdir(`${root}/.eser`, { recursive: true });
    await runtime.fs.writeTextFile(
      `${root}/${registryFetcher.RECIPES_FILENAME}`,
      "{}",
    );
    await runtime.fs.mkdir(`${root}/app/src`, { recursive: true });

    // add --cwd points below the registry; the walk goes up from there, not
    // from the process's working directory.
    assert.assertEquals(
      await registryFetcher.detectLocalRegistry(`${root}/app/src`),
      `${root}/${registryFetcher.RECIPES_FILENAME}`,
    );
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
});

Deno.test("detectLocalRegistry: wraps a path it cannot check", async () => {
  const denied = new Error("permission denied");
  using _exists = mock.stub(
    runtime.fs,
    "exists",
    () => Promise.reject(denied),
  );

  const error = await assert.assertRejects(
    () => registryFetcher.detectLocalRegistry(),
    registryFetcher.RegistryLoadError,
  );

  assert.assertStringIncludes(
    error.message,
    `${registryFetcher.RECIPES_FILENAME}: check whether the file exists`,
  );
  assert.assertStrictEquals(error.cause, denied);
});
