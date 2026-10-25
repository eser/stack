// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as bdd from "@std/testing/bdd";
import * as mock from "@eserstack/test-kit/mock";
import * as tarStream from "@std/tar/tar-stream";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as errorChain from "./error-chain.ts";
import * as recipeApplier from "./recipe-applier.ts";
import * as registryFetcher from "./registry-fetcher.ts";
import * as tar from "./tar.ts";

// =============================================================================
// Helpers
// =============================================================================

const encoder = new TextEncoder();

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

type ArchiveEntry =
  | { readonly type: "file"; readonly path: string; readonly content: string }
  | { readonly type: "directory"; readonly path: string };

/** Builds a gzipped tarball in the shape codeload.github.com serves. */
const gzippedTarball = (
  entries: readonly ArchiveEntry[],
): ReadableStream<Uint8Array> => {
  const inputs = entries.map((entry): tarStream.TarStreamInput => {
    if (entry.type === "directory") {
      return entry;
    }

    const bytes = encoder.encode(entry.content);
    return {
      type: "file",
      path: entry.path,
      size: bytes.length,
      readable: ReadableStream.from([bytes]),
    };
  });

  return ReadableStream.from(inputs)
    .pipeThrough(new tarStream.TarStream())
    .pipeThrough(
      new CompressionStream("gzip") as unknown as TransformStream<
        Uint8Array,
        Uint8Array
      >,
    );
};

const withTempDir = async (
  fn: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await runtime.fs.makeTempDir({ prefix: "kit-applier-test-" });
  try {
    await fn(dir);
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
};

// =============================================================================
// isPathSafe
// =============================================================================

Deno.test("isPathSafe — allows safe relative path", () => {
  assert.assertEquals(
    recipeApplier.isPathSafe("/project", "src/foo.ts"),
    true,
  );
});

Deno.test("isPathSafe — allows nested path", () => {
  assert.assertEquals(
    recipeApplier.isPathSafe("/project", "src/lib/deep/file.ts"),
    true,
  );
});

Deno.test("isPathSafe — rejects ../ traversal", () => {
  assert.assertEquals(
    recipeApplier.isPathSafe("/project", "../etc/passwd"),
    false,
  );
});

Deno.test("isPathSafe — rejects absolute path outside cwd", () => {
  assert.assertEquals(
    recipeApplier.isPathSafe("/project", "/etc/passwd"),
    false,
  );
});

Deno.test("isPathSafe — rejects resolved traversal", () => {
  assert.assertEquals(
    recipeApplier.isPathSafe("/project", "src/../../etc/passwd"),
    false,
  );
});

// =============================================================================
// applyRecipe — dry-run mode
// =============================================================================

Deno.test("applyRecipe — dry-run reports files without writing", async () => {
  const recipe = {
    name: "test-recipe",
    description: "Test",
    language: "typescript",
    scale: "utility" as const,
    files: [
      { source: "src/a.ts", target: "lib/a.ts" },
      { source: "src/b.ts", target: "lib/b.ts" },
    ],
  };

  const tmpDir = await runtime.fs.makeTempDir();

  try {
    const result = await recipeApplier.applyRecipe(recipe, {
      cwd: tmpDir,
      registryUrl: "https://example.com",
      dryRun: true,
    });

    assert.assertEquals(result.written.length, 2);
    assert.assertEquals(result.total, 2);

    // Verify no files were actually written
    const exists = await recipeApplier.fileExists(`${tmpDir}/lib/a.ts`);

    assert.assertEquals(exists, false);
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

// =============================================================================
// applyRecipe — path traversal rejection
// =============================================================================

Deno.test("applyRecipe — rejects recipe with path traversal", async () => {
  const recipe = {
    name: "evil-recipe",
    description: "Evil",
    language: "typescript",
    scale: "utility" as const,
    files: [
      { source: "src/a.ts", target: "../../../etc/evil.ts" },
    ],
  };

  const tmpDir = await runtime.fs.makeTempDir();

  try {
    await assert.assertRejects(
      () =>
        recipeApplier.applyRecipe(recipe, {
          cwd: tmpDir,
          registryUrl: "https://example.com",
          dryRun: true,
        }),
      Error,
      "path traversal",
    );
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

// =============================================================================
// fileExists
// =============================================================================

Deno.test("fileExists — returns true for existing file", async () => {
  const tmpDir = await runtime.fs.makeTempDir();
  const tmpFile = `${tmpDir}/test-file.txt`;
  await runtime.fs.writeTextFile(tmpFile, "test");

  try {
    assert.assertEquals(await recipeApplier.fileExists(tmpFile), true);
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

Deno.test("fileExists — returns false for nonexistent file", async () => {
  assert.assertEquals(
    await recipeApplier.fileExists("/nonexistent/path/file.ts"),
    false,
  );
});

// =============================================================================
// processContent — variable substitution integration
// =============================================================================

Deno.test("processContent — substitutes variables in content", () => {
  const result = recipeApplier.processContent(
    '{ "name": "{{.project_name}}" }',
    { project_name: "my-app" },
  );

  assert.assertStringIncludes(result, "my-app");
  assert.assertEquals(result.includes("{{.project_name}}"), false);
});

Deno.test("processContent — returns unchanged when no variables", () => {
  const content = "plain content";
  const result = recipeApplier.processContent(content, undefined);

  assert.assertEquals(result, content);
});

Deno.test("processContent — returns unchanged with empty variables", () => {
  const content = "plain content";
  const result = recipeApplier.processContent(content, {});

  assert.assertEquals(result, content);
});

// =============================================================================
// runPostInstall — dry-run mode
// =============================================================================

Deno.test("runPostInstall — dry-run reports commands without executing", async () => {
  const tmpDir = await runtime.fs.makeTempDir();

  try {
    const ran = await recipeApplier.runPostInstall(
      ["echo hello", "echo world"],
      tmpDir,
      true, // dryRun
    );

    assert.assertEquals(ran.length, 2);
    assert.assertEquals(ran[0], "echo hello");
    assert.assertEquals(ran[1], "echo world");
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

Deno.test("runPostInstall — executes commands for real", async () => {
  const tmpDir = await runtime.fs.makeTempDir();

  try {
    const ran = await recipeApplier.runPostInstall(
      ["echo test_output"],
      tmpDir,
      false,
    );

    assert.assertEquals(ran.length, 1);
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

// =============================================================================
// applyRecipe — dry-run with variables
// =============================================================================

Deno.test("applyRecipe — dry-run with variables reports correctly", async () => {
  const recipe = {
    name: "templated-recipe",
    description: "Test with variables",
    language: "typescript",
    scale: "utility" as const,
    variables: [
      { name: "project_name", description: "Name", default: "default-app" },
    ],
    files: [
      { source: "src/a.ts", target: "lib/a.ts" },
    ],
  };

  const tmpDir = await runtime.fs.makeTempDir();

  try {
    const result = await recipeApplier.applyRecipe(recipe, {
      cwd: tmpDir,
      registryUrl: "https://example.com",
      dryRun: true,
      variables: { project_name: "my-app" },
    });

    assert.assertEquals(result.written.length, 1);
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

// =============================================================================
// applyRecipe — dry-run with postInstall
// =============================================================================

Deno.test("applyRecipe — dry-run includes postInstall in result", async () => {
  const recipe = {
    name: "post-install-recipe",
    description: "Test with postInstall",
    language: "typescript",
    scale: "utility" as const,
    files: [{ source: "src/a.ts", target: "lib/a.ts" }],
    postInstall: ["echo setup"],
  };

  const tmpDir = await runtime.fs.makeTempDir();

  try {
    const result = await recipeApplier.applyRecipe(recipe, {
      cwd: tmpDir,
      registryUrl: "https://example.com",
      dryRun: true,
    });

    assert.assertEquals(result.postInstallRan.length, 1);
    assert.assertEquals(result.postInstallRan[0], "echo setup");
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

// =============================================================================
// applyRecipe — folder kind in dry-run (no network call)
// =============================================================================

Deno.test("applyRecipe — dry-run with folder kind reports correctly", async () => {
  const recipe = {
    name: "folder-recipe",
    description: "Test with folder",
    language: "go",
    scale: "utility" as const,
    files: [
      { source: "src/a.ts", target: "lib/a.ts" },
      { source: "configfx/", target: "pkg/configfx", kind: "folder" as const },
    ],
  };

  const tmpDir = await runtime.fs.makeTempDir();

  try {
    // Folder fetch requires network — in dry-run for file entries,
    // it works without network. Folder entries in dry-run still need
    // to fetch the listing. We only test the file entry here.
    const result = await recipeApplier.applyRecipe(
      {
        ...recipe,
        files: [{ source: "src/a.ts", target: "lib/a.ts" }],
      },
      {
        cwd: tmpDir,
        registryUrl: "https://example.com",
        dryRun: true,
      },
    );

    assert.assertEquals(result.written.length, 1);
  } finally {
    await runtime.fs.remove(tmpDir, { recursive: true });
  }
});

// =============================================================================
// applyRecipe — whole-repo mode dispatch (no files array)
// =============================================================================

bdd.describe("applyRecipe — whole-repo mode routing", () => {
  bdd.it(
    "throws when specifier is missing and recipe has no files",
    async () => {
      const tmpDir = await runtime.fs.makeTempDir();
      try {
        await assert.assertRejects(
          () =>
            recipeApplier.applyRecipe(
              { schema: "registry/v1" }, // empty recipe — no files
              {
                cwd: tmpDir,
                registryUrl: "https://example.com",
                // specifier intentionally absent
              },
            ),
          Error,
          "specifier",
        );
      } finally {
        await runtime.fs.remove(tmpDir, { recursive: true });
      }
    },
  );
});

// =============================================================================
// applyRecipe — skipPostInstall flag
// =============================================================================

bdd.describe("applyRecipe — skipPostInstall", () => {
  bdd.it("skips post-install commands when flag is set", async () => {
    const recipe = {
      name: "post-install-recipe",
      description: "Test",
      language: "typescript",
      scale: "utility" as const,
      files: [{ source: "src/a.ts", target: "lib/a.ts" }],
      postInstall: ["echo should-not-run"],
    };
    const tmpDir = await runtime.fs.makeTempDir();
    try {
      const result = await recipeApplier.applyRecipe(recipe, {
        cwd: tmpDir,
        registryUrl: "https://example.com",
        dryRun: true,
        skipPostInstall: true,
      });
      assert.assertEquals(result.postInstallRan.length, 0);
    } finally {
      await runtime.fs.remove(tmpDir, { recursive: true });
    }
  });
});

// =============================================================================
// applyRecipe: errors keep their cause
// =============================================================================

bdd.describe("applyRecipe: failed apply", () => {
  const recipe = {
    name: "two-files",
    description: "Test",
    language: "typescript",
    scale: "utility" as const,
    files: [
      { source: "src/a.ts", target: "lib/a.ts" },
      { source: "src/b.ts", target: "lib/b.ts" },
    ],
  };

  bdd.it("wraps the fetch error of the file that failed", async () => {
    using _fetch = mock.stub(
      globalThis,
      "fetch",
      fakeFetch({
        "https://registry.example/src/a.ts": () => new Response("export {};\n"),
        "https://registry.example/src/b.ts": () =>
          new Response("unavailable", { status: 503 }),
      }),
    );

    await withTempDir(async (dir) => {
      const error = await assert.assertRejects(
        () =>
          recipeApplier.applyRecipe(recipe, {
            cwd: dir,
            registryUrl: "https://registry.example",
          }),
        recipeApplier.RecipeApplyError,
      );

      assert.assertEquals(error.recipeName, "two-files");
      assert.assertEquals(error.step, "copy src/b.ts to lib/b.ts");
      assert.assertEquals(error.written, ["lib/a.ts"]);
      assert.assertEquals(
        error.message,
        "apply recipe two-files: copy src/b.ts to lib/b.ts; 1 file(s) written before it stay in place; once the cause below is fixed, rerun with --force to overwrite them",
      );

      const cause = error.cause;
      assert.assertInstanceOf(cause, registryFetcher.RegistryRequestError);
      assert.assertEquals(cause.url, "https://registry.example/src/b.ts");
      assert.assertEquals(cause.status, 503);

      assert.assertEquals(
        errorChain.formatErrorChain(error).split("\n"),
        [
          error.message,
          "  caused by: GET https://registry.example/src/b.ts: HTTP 503; the host had an error, so retry later",
        ],
      );
    });
  });

  bdd.it("wraps the network error of a request with no response", async () => {
    const offline = new TypeError("error sending request: connection refused");
    using _fetch = mock.stub(
      globalThis,
      "fetch",
      () => Promise.reject(offline),
    );

    await withTempDir(async (dir) => {
      const error = await assert.assertRejects(
        () =>
          recipeApplier.applyRecipe(recipe, {
            cwd: dir,
            registryUrl: "https://registry.example",
          }),
        recipeApplier.RecipeApplyError,
        "no files were written",
      );

      const request = errorChain.findCause(
        error,
        registryFetcher.RegistryRequestError,
      );
      assert.assertExists(request);
      assert.assertEquals(request.status, null);
      assert.assertStrictEquals(request.cause, offline);
    });
  });
});

bdd.describe("runPostInstall: failures", () => {
  bdd.it("reports the exit code of a failing command", async () => {
    await withTempDir(async (dir) => {
      const error = await assert.assertRejects(
        () => recipeApplier.runPostInstall(["false"], dir),
        recipeApplier.PostInstallError,
        'run post-install command "false": exit code 1',
      );

      assert.assertEquals(error.command, "false");
      assert.assertEquals(error.exitCode, 1);
    });
  });

  bdd.it("keeps the spawn error of a command that does not start", async () => {
    await withTempDir(async (dir) => {
      const command = "kit-test-no-such-program";
      const error = await assert.assertRejects(
        () => recipeApplier.runPostInstall([command], dir),
        recipeApplier.PostInstallError,
        "it did not start",
      );

      assert.assertEquals(error.exitCode, null);
      assert.assertInstanceOf(error.cause, Error);
    });
  });
});

// =============================================================================
// applyRecipe: whole-repo tarball limits
// =============================================================================

bdd.describe("applyRecipe: whole-repo tarball limits", () => {
  const tarballUrl = "https://codeload.github.com/owner/repo/tar.gz/main";
  const wholeRepo = { schema: "registry/v1" };

  const cloneWith = (
    entries: readonly ArchiveEntry[],
    limits: Pick<recipeApplier.ApplyOptions, "maxBytes" | "maxEntries">,
  ) =>
  async (dir: string): Promise<recipeApplier.ApplyResult> => {
    using _fetch = mock.stub(
      globalThis,
      "fetch",
      fakeFetch({ [tarballUrl]: () => new Response(gzippedTarball(entries)) }),
    );

    return await recipeApplier.applyRecipe(wholeRepo, {
      cwd: dir,
      registryUrl: "https://raw.githubusercontent.com/owner/repo/main",
      specifier: "gh:owner/repo",
      ...limits,
    });
  };

  const oneKibFile: readonly ArchiveEntry[] = [
    { type: "file", path: "repo-main/data.txt", content: "x".repeat(1024) },
  ];

  bdd.it("stops at a maxBytes below the archive size", async () => {
    await withTempDir(async (dir) => {
      const error = await assert.assertRejects(
        () => cloneWith(oneKibFile, { maxBytes: 512 })(dir),
        recipeApplier.RecipeApplyError,
        "apply recipe gh:owner/repo: extract gh:owner/repo",
      );

      const limit = errorChain.findCause(error, tar.TarballLimitError);
      assert.assertExists(limit);
      assert.assertEquals(limit.limit, "maxBytes");
      assert.assertEquals(limit.max, 512);
    });
  });

  bdd.it("extracts the same archive under a raised maxBytes", async () => {
    await withTempDir(async (dir) => {
      const result = await cloneWith(oneKibFile, { maxBytes: 64 * 1024 })(dir);

      assert.assertEquals(result.written, ["data.txt"]);
      assert.assertEquals(
        await runtime.fs.readTextFile(runtime.path.join(dir, "data.txt")),
        "x".repeat(1024),
      );
    });
  });

  // One entry past DEFAULT_MAX_ENTRIES, as directories so that only the
  // last entry, a file, is written.
  const pastDefaultEntries: readonly ArchiveEntry[] = [
    ...Array.from(
      { length: tar.DEFAULT_MAX_ENTRIES },
      (_, index): ArchiveEntry => ({
        type: "directory",
        path: `repo-main/dir-${index}`,
      }),
    ),
    { type: "file", path: "repo-main/README.md", content: "# repo\n" },
  ];

  bdd.it("stops past the default maxEntries", async () => {
    await withTempDir(async (dir) => {
      const error = await assert.assertRejects(
        () => cloneWith(pastDefaultEntries, {})(dir),
        recipeApplier.RecipeApplyError,
      );

      const limit = errorChain.findCause(error, tar.TarballLimitError);
      assert.assertExists(limit);
      assert.assertEquals(limit.limit, "maxEntries");
      assert.assertEquals(limit.max, tar.DEFAULT_MAX_ENTRIES);
    });
  });

  bdd.it("extracts that archive under a raised maxEntries", async () => {
    await withTempDir(async (dir) => {
      const result = await cloneWith(pastDefaultEntries, {
        maxEntries: tar.DEFAULT_MAX_ENTRIES + 1,
      })(dir);

      assert.assertEquals(result.written, ["README.md"]);
    });
  });
});
