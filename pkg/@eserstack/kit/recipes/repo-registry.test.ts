// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as registryFetcher from "./registry-fetcher.ts";
import type * as registrySchema from "./registry-schema.ts";

const { runtime } = crossRuntime;

// This file sits in pkg/@eserstack/kit/recipes, four levels below the root.
const repoRoot = runtime.path.resolve(
  import.meta.dirname ?? ".",
  "../../../..",
);

// File managers create these next to recipe files, and the root .gitignore
// keeps them out of the repository, so they never need a recipes.json entry.
const OS_METADATA_FILES: ReadonlySet<string> = new Set([
  ".DS_Store",
  "Thumbs.db",
]);

/** Turns a path relative to the registry directory into the "/" form. */
const toRegistryPath = (relative: string): string =>
  relative.split(runtime.path.sep).join("/");

type ListedSource = {
  readonly recipe: string;
  readonly file: registrySchema.RecipeFile;
};

/**
 * Checks one listed source against the registry directory and returns the
 * problem it has, or null when it exists with the declared kind.
 */
const checkSource = async (
  registryDir: string,
  { recipe, file }: ListedSource,
): Promise<string | null> => {
  const kind = file.kind ?? "file";
  let info: crossRuntime.FileInfo;
  try {
    info = await runtime.fs.stat(runtime.path.join(registryDir, file.source));
  } catch (error) {
    if (error instanceof crossRuntime.NotFoundError) {
      return `${recipe}: ${file.source} does not exist; add it or remove the entry from recipes.json`;
    }

    throw error;
  }

  if (kind === "file" && !info.isFile) {
    return `${recipe}: ${file.source} is not a file; list its files or set kind "folder"`;
  }
  if (kind === "folder" && !info.isDirectory) {
    return `${recipe}: ${file.source} is not a folder; set kind "file" for it`;
  }

  return null;
};

/**
 * Lists the problems between a registry manifest and the directory it lives
 * in: a local source that does not exist or has another kind, and a file
 * under `recipes/` that no recipe lists. Sources with the github provider are
 * fetched from a repository when the recipe is applied, so they are skipped.
 */
const findSourceProblems = async (
  manifest: registrySchema.RegistryManifest,
  registryDir: string,
): Promise<readonly string[]> => {
  const localSources: ListedSource[] = manifest.recipes.flatMap((recipe) =>
    (recipe.files ?? [])
      .filter((file) => file.provider !== "github")
      .map((file) => ({ recipe: recipe.name ?? "<unnamed>", file })),
  );

  // Each check is an independent stat; the results keep the listing order.
  const sourceProblems = await Promise.all(
    localSources.map((source) => checkSource(registryDir, source)),
  );
  const problems = sourceProblems.filter((problem) => problem !== null);

  const listedFiles = new Set(
    localSources
      .filter(({ file }) => (file.kind ?? "file") === "file")
      .map(({ file }) => file.source),
  );
  const listedFolders = localSources
    .filter(({ file }) => file.kind === "folder")
    .map(({ file }) => file.source.replace(/\/*$/, "/"));

  const recipesDir = runtime.path.join(registryDir, "recipes");
  if (!(await runtime.fs.exists(recipesDir))) {
    return problems;
  }

  for await (const entry of runtime.fs.walk(recipesDir, {
    includeDirs: false,
  })) {
    if (OS_METADATA_FILES.has(runtime.path.basename(entry.path))) {
      continue;
    }

    const relative = toRegistryPath(
      runtime.path.relative(registryDir, entry.path),
    );
    const isListed =
      listedFiles.has(relative) ||
      listedFolders.some((folder) => relative.startsWith(folder));

    if (!isListed) {
      problems.push(
        `${relative} is in no recipe; list it in recipes.json or delete it`,
      );
    }
  }

  return problems;
};

/**
 * Recipes whose github-provider folder came from the eser/ajan repository and
 * is not in this one; removing them or pointing them at another repository is
 * the owner's call (TASK-322).
 */
const NOT_IN_THIS_REPOSITORY: ReadonlySet<string> = new Set([
  "ajan-di",
  "ajan-datafx",
  "ajan-eventsfx",
  "ajan-metricsfx",
  "ajan-tracesfx",
  "ajan-grpcfx",
]);

Deno.test(".eser/recipes.json github sources exist in this repository", async () => {
  const manifest = await registryFetcher.fetchRegistry(
    runtime.path.join(repoRoot, ".eser", "recipes.json"),
  );

  // The registry is on eser/stack, so a github-provider source resolves
  // against this repository's root (registryFetcher.sourceBaseFor).
  const githubSources: ListedSource[] = manifest.recipes.flatMap((recipe) =>
    (recipe.files ?? [])
      .filter(
        (file) =>
          file.provider === "github" &&
          !NOT_IN_THIS_REPOSITORY.has(recipe.name ?? ""),
      )
      .map((file) => ({ recipe: recipe.name ?? "<unnamed>", file })),
  );

  assert.assertEquals(githubSources.length > 0, true);

  const problems = await Promise.all(
    githubSources.map((source) => checkSource(repoRoot, source)),
  );
  assert.assertEquals(
    problems.filter((p) => p !== null),
    [],
  );
});

Deno.test(".eser/recipes.json lists every recipe file and nothing else", async () => {
  const registryDir = runtime.path.join(repoRoot, ".eser");
  const manifest = await registryFetcher.fetchRegistry(
    runtime.path.join(registryDir, "recipes.json"),
  );

  assert.assertEquals(await findSourceProblems(manifest, registryDir), []);
});

const manifestOf = (
  files: readonly registrySchema.RecipeFile[],
): registrySchema.RegistryManifest => ({
  name: "fixture",
  description: "Registry fixture",
  author: "kit tests",
  registryUrl: "https://example.com/registry",
  recipes: [
    {
      name: "demo",
      description: "Demo recipe",
      language: "typescript",
      scale: "project",
      files,
    },
  ],
});

const sourceProblemCases: ReadonlyArray<{
  readonly name: string;
  readonly onDisk: readonly string[];
  readonly files: readonly registrySchema.RecipeFile[];
  readonly expected: readonly string[];
}> = [
  {
    name: "reports nothing when the listing matches the files",
    onDisk: ["recipes/demo/a.ts", "recipes/demo/lib/b.ts"],
    files: [
      { source: "recipes/demo/a.ts", target: "a.ts" },
      { source: "recipes/demo/lib", target: "lib", kind: "folder" },
    ],
    expected: [],
  },
  {
    name: "reports a listed source file that is missing",
    onDisk: ["recipes/demo/a.ts"],
    files: [
      { source: "recipes/demo/a.ts", target: "a.ts" },
      { source: "recipes/demo/b.ts", target: "b.ts" },
    ],
    expected: [
      "demo: recipes/demo/b.ts does not exist; add it or remove the entry from recipes.json",
    ],
  },
  {
    name: "reports a file in a recipe directory that no recipe lists",
    onDisk: ["recipes/demo/a.ts", "recipes/stale/main.ts"],
    files: [{ source: "recipes/demo/a.ts", target: "a.ts" }],
    expected: [
      "recipes/stale/main.ts is in no recipe; list it in recipes.json or delete it",
    ],
  },
  {
    name: "reports a source whose kind does not match the path",
    onDisk: ["recipes/demo/lib/b.ts"],
    files: [{ source: "recipes/demo/lib", target: "lib" }],
    expected: [
      'demo: recipes/demo/lib is not a file; list its files or set kind "folder"',
      "recipes/demo/lib/b.ts is in no recipe; list it in recipes.json or delete it",
    ],
  },
  {
    name: "ignores file manager metadata such as .DS_Store",
    onDisk: ["recipes/demo/a.ts", "recipes/demo/.DS_Store"],
    files: [{ source: "recipes/demo/a.ts", target: "a.ts" }],
    expected: [],
  },
  {
    name: "skips sources fetched from GitHub",
    onDisk: [],
    files: [
      { source: "lib/", target: "lib", kind: "folder", provider: "github" },
    ],
    expected: [],
  },
];

for (const { name, onDisk, files, expected } of sourceProblemCases) {
  Deno.test(`findSourceProblems ${name}`, async () => {
    const registryDir = await runtime.fs.makeTempDir({
      prefix: "kit-registry-",
    });
    try {
      // The fixture files are independent writes.
      await Promise.all(
        onDisk.map(async (relative) => {
          const target = runtime.path.join(registryDir, relative);
          await runtime.fs.ensureDir(runtime.path.dirname(target));
          await runtime.fs.writeTextFile(target, "");
        }),
      );

      assert.assertEquals(
        await findSourceProblems(manifestOf(files), registryDir),
        expected,
      );
    } finally {
      await runtime.fs.remove(registryDir, { recursive: true });
    }
  });
}
