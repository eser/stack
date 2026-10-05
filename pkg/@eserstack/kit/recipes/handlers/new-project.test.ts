// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as bdd from "@std/testing/bdd";
import * as task from "@eserstack/functions/task";
import * as results from "@eserstack/primitives/results";
import * as streams from "@eserstack/streams";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as registryFetcher from "../registry-fetcher.ts";
import * as handler from "./new-project.ts";

bdd.describe("newProject: registry failures", () => {
  bdd.it(
    "reports a RegistryError with the load error as the cause",
    async () => {
      const dir = await runtime.fs.makeTempDir({
        prefix: "kit-new-project-test-",
      });
      const registryPath = runtime.path.join(dir, "missing", "recipes.json");
      const out = streams.output({
        renderer: streams.renderers.plain(),
        sink: streams.sinks.nullSink(),
      });

      try {
        const result = await task.runTask(
          handler.newProject({
            templateName: "library-pkg",
            projectName: "demo",
            targetDir: runtime.path.join(dir, "demo"),
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
