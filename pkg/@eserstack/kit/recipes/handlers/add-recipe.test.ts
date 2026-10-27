// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as mock from "@eserstack/test-kit/mock";
import * as bdd from "node:test";
import * as task from "@eserstack/functions/task";
import * as results from "@eserstack/primitives/results";
import * as streams from "@eserstack/streams";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as registryFetcher from "../registry-fetcher.ts";
import * as handler from "./add-recipe.ts";

bdd.describe("addRecipe: registry failures", () => {
  bdd.it(
    "reports a RegistryError with the load error as the cause",
    async () => {
      const dir = await runtime.fs.makeTempDir({
        prefix: "kit-add-recipe-test-",
      });
      const registryPath = runtime.path.join(dir, "missing", "recipes.json");
      const out = streams.output({
        renderer: streams.renderers.plain(),
        sink: streams.sinks.nullSink(),
      });

      try {
        const result = await task.runTask(
          handler.addRecipe({
            recipeName: "fp-pipe",
            cwd: dir,
            registrySource: registryPath,
          }),
          { out },
        );

        assert.assertEquals(results.isFail(result), true);
        if (!results.isFail(result)) return;

        assert.assertEquals(result.error._tag, "RegistryError");
        if (result.error._tag !== "RegistryError") return;

        assert.assertInstanceOf(
          result.error.cause,
          registryFetcher.RegistryLoadError,
        );
        const [first, second] = result.error.message.split("\n");
        assert.assertEquals(
          first,
          `load registry ${registryPath}: the file does not exist; pass --registry with the path or URL of a recipes.json`,
        );
        assert.assertStringIncludes(second ?? "", "  caused by: ");
      } finally {
        await out.close();
        await runtime.fs.remove(dir, { recursive: true });
      }
    },
  );
});

// TASK-362: with --local, add applied the files of the manifest's registryUrl
// (GitHub main) instead of the working tree, the native path did not get
// `local`, and it printed no dependency instructions. The test runs on the
// native library when it loads and on the TypeScript applier otherwise; both
// must give the same result.
bdd.describe("addRecipe: a local registry", () => {
  bdd.it(
    "applies the working tree's files and prints the dependency instructions",
    async () => {
      using _fetch = mock.stub(globalThis, "fetch", (input) =>
        Promise.reject(
          new TypeError(`no network in this test: ${String(input)}`),
        ),
      );

      const root = await runtime.fs.makeTempDir({
        prefix: "kit-add-recipe-local-",
      });
      const sink = streams.sinks.buffer<string>();
      const out = streams.output({
        renderer: streams.renderers.plain(),
        sink,
      });

      try {
        await runtime.fs.mkdir(runtime.path.join(root, ".eser", "recipes"), {
          recursive: true,
        });
        await runtime.fs.mkdir(runtime.path.join(root, "app"));
        await runtime.fs.writeTextFile(
          runtime.path.join(root, ".eser", "recipes.json"),
          JSON.stringify({
            name: "local",
            description: "A registry in a working tree",
            author: "test",
            // Unreachable: a file fetched from here fails the test.
            registryUrl: "https://127.0.0.1:9/.eser",
            recipes: [
              {
                name: "lib",
                description: "A library file",
                language: "typescript",
                scale: "utility",
                files: [{ source: "recipes/util.ts", target: "src/util.ts" }],
                dependencies: { npm: ["@eserstack/fp"], npmDev: ["laroux"] },
              },
            ],
          }),
        );
        await runtime.fs.writeTextFile(
          runtime.path.join(root, ".eser", "recipes", "util.ts"),
          "export const tree = true;\n",
        );

        const cwd = runtime.path.join(root, "app");
        const result = await task.runTask(
          handler.addRecipe({
            recipeName: "lib",
            cwd,
            local: true,
            noInstall: true,
          }),
          { out },
        );
        await out.close();

        if (!results.isOk(result)) {
          assert.fail(`addRecipe failed: ${result.error.message}`);
        }

        assert.assertEquals(
          await runtime.fs.readTextFile(
            runtime.path.join(cwd, "src", "util.ts"),
          ),
          "export const tree = true;\n",
        );
        assert.assertEquals(result.value.depInfo.instructions, [
          "npm install @eserstack/fp",
          "npm install --save-dev laroux",
        ]);

        const text = sink.items().join("");
        assert.assertStringIncludes(text, "Dependencies (run manually):");
        assert.assertStringIncludes(text, "  npm install --save-dev laroux");
      } finally {
        await runtime.fs.remove(root, { recursive: true });
      }
    },
  );
});
