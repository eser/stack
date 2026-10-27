// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as mock from "@eserstack/test-kit/mock";
import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as init from "./init.ts";

/** The kit registry of this repository, which holds the laroux-app recipe. */
const REPO_REGISTRY = runtime.path.resolve(
  import.meta.dirname,
  "../../../../.eser/recipes.json",
);

/**
 * Run fn in a new, empty working directory, with every fetch answering 404,
 * so a test never reaches the network. init used to clone
 * gh:eser/laroux-template-*, whatever registry it was given, and those
 * repositories answer 404.
 */
async function inScratchCwd(fn: (cwd: string) => Promise<void>) {
  using _fetch = mock.stub(globalThis, "fetch", () =>
    Promise.resolve(new Response("Not Found", { status: 404 })),
  );

  const cwd = await runtime.fs.makeTempDir({ prefix: "laroux-init-" });
  const previous = runtime.process.cwd();
  runtime.process.chdir(cwd);

  try {
    await fn(cwd);
  } finally {
    runtime.process.chdir(previous);
    await runtime.fs.remove(cwd, { recursive: true });
  }
}

/** The names in dir, sorted. */
async function listDir(dir: string): Promise<string[]> {
  const names: string[] = [];
  for await (const entry of runtime.fs.readDir(dir)) {
    names.push(entry.name);
  }

  return names.sort();
}

/**
 * Write a registry whose laroux-app recipe lists a file that does not exist,
 * so applying it fails after the project directory is created.
 */
async function writeBrokenRegistry(dir: string): Promise<string> {
  const registryPath = runtime.path.join(dir, "recipes.json");
  await runtime.fs.writeTextFile(
    registryPath,
    JSON.stringify({
      name: "broken",
      description: "A registry whose recipe file is missing",
      author: "test",
      // Unreachable: a file fetched from here fails the test.
      registryUrl: "https://127.0.0.1:9/.eser",
      recipes: [
        {
          name: "laroux-app",
          description: "A laroux app with a missing file",
          language: "typescript",
          scale: "project",
          files: [{ source: "recipes/missing.json", target: "package.json" }],
        },
      ],
    }),
  );

  return registryPath;
}

bdd.describe("laroux init: the recipe source", () => {
  bdd.it(
    "scaffolds the minimal template from the laroux-app recipe of the registry",
    async () => {
      await inScratchCwd(async (cwd) => {
        const result = await init.main([
          "demo",
          "--registry",
          REPO_REGISTRY,
          "--no-install",
        ]);

        if (!results.isOk(result)) {
          assert.fail(`init failed: ${result.error.message ?? ""}`);
        }

        const projectDir = runtime.path.join(cwd, "demo");
        const packageJson = JSON.parse(
          await runtime.fs.readTextFile(
            runtime.path.join(projectDir, "package.json"),
          ),
        ) as { scripts: Record<string, string> };
        assert.assertEquals(packageJson.scripts["dev"], "laroux dev");
        assert.assert(
          await runtime.fs.exists(
            runtime.path.join(projectDir, "src/app/routes/home/page.tsx"),
          ),
        );
      });
    },
  );

  bdd.it(
    "maps every template to a project recipe of the repository registry",
    async () => {
      const manifest = JSON.parse(
        await runtime.fs.readTextFile(REPO_REGISTRY),
      ) as { recipes: { name: string; scale: string }[] };

      assert.assertEquals(init.TEMPLATE_RECIPES, { minimal: "laroux-app" });
      for (const recipeName of Object.values(init.TEMPLATE_RECIPES)) {
        const recipe = manifest.recipes.find((r) => r.name === recipeName);
        assert.assertEquals(recipe?.scale, "project");
      }
    },
  );

  for (const template of ["blog", "dashboard", "docs"]) {
    bdd.it(
      `rejects the ${template} template, which has no recipe, and names the available one`,
      async () => {
        await inScratchCwd(async (cwd) => {
          const result = await init.main(["demo", "-t", template]);

          if (!results.isFail(result)) {
            assert.fail(`init of ${template} succeeded`);
          }

          assert.assertEquals(result.error.exitCode, 1);
          assert.assertStringIncludes(result.error.message ?? "", template);
          assert.assertStringIncludes(
            result.error.message ?? "",
            "Available templates: minimal",
          );
          assert.assertEquals(await listDir(cwd), []);
        });
      },
    );
  }
});

bdd.describe("laroux init: a failed init", () => {
  bdd.it(
    "removes the project directory and the parents it created",
    async () => {
      await inScratchCwd(async (cwd) => {
        const registryDir = await runtime.fs.makeTempDir({
          prefix: "laroux-init-registry-",
        });

        try {
          const registry = await writeBrokenRegistry(registryDir);
          const result = await init.main([
            "apps/demo",
            "--registry",
            registry,
            "--no-install",
          ]);

          assert.assert(results.isFail(result));
          assert.assertEquals(await listDir(cwd), []);
        } finally {
          await runtime.fs.remove(registryDir, { recursive: true });
        }
      });
    },
  );

  bdd.it("keeps a project directory that existed before", async () => {
    await inScratchCwd(async (cwd) => {
      const registry = await writeBrokenRegistry(cwd);
      await runtime.fs.mkdir(runtime.path.join(cwd, "demo"));

      const result = await init.main([
        "demo",
        "--registry",
        registry,
        "--no-install",
      ]);

      assert.assert(results.isFail(result));
      assert.assertEquals(await listDir(cwd), ["demo", "recipes.json"]);
    });
  });

  bdd.it(
    "refuses a non-empty directory without --force and overwrites with it",
    async () => {
      await inScratchCwd(async (cwd) => {
        const projectDir = runtime.path.join(cwd, "demo");
        await runtime.fs.mkdir(projectDir);
        await runtime.fs.writeTextFile(
          runtime.path.join(projectDir, "notes.txt"),
          "keep\n",
        );

        const refused = await init.main([
          "demo",
          "--registry",
          REPO_REGISTRY,
          "--no-install",
        ]);

        if (!results.isFail(refused)) {
          assert.fail("init into a non-empty directory succeeded");
        }

        assert.assertStringIncludes(refused.error.message ?? "", "--force");
        assert.assertEquals(await listDir(projectDir), ["notes.txt"]);

        const forced = await init.main([
          "demo",
          "--registry",
          REPO_REGISTRY,
          "--no-install",
          "--force",
        ]);

        assert.assert(results.isOk(forced));
        assert.assertEquals(
          await runtime.fs.readTextFile(
            runtime.path.join(projectDir, "notes.txt"),
          ),
          "keep\n",
        );
        assert.assert(
          await runtime.fs.exists(
            runtime.path.join(projectDir, "package.json"),
          ),
        );
      });
    },
  );
});

bdd.describe("laroux init: help", () => {
  for (const flag of ["--help", "-h"]) {
    bdd.it(`${flag} prints the help and creates nothing`, async () => {
      await inScratchCwd(async (cwd) => {
        const result = await init.main([flag]);

        assert.assert(results.isOk(result));
        assert.assertEquals(await listDir(cwd), []);
      });
    });
  }

  bdd.it("lists the templates and the flags", () => {
    const text = init.helpText();

    assert.assertStringIncludes(text, "laroux init [folder] [options]");
    for (const flag of [
      "--template",
      "--registry",
      "--force",
      "--no-git",
      "--no-install",
      "--help",
    ]) {
      assert.assertStringIncludes(text, flag);
    }
    assert.assertStringIncludes(text, "minimal");
  });
});
