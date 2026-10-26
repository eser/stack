// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import type { FrameworkPlugin } from "@eserstack/laroux-bundler";
import * as build from "./build.ts";

/** A framework plugin whose client entry step fails, as a broken app would. */
const failingClientEntryPlugin: FrameworkPlugin = {
  name: "failing-client-entry",
  createClientEntry: () =>
    Promise.reject(new Error("create client entry: fixture failure")),
};

nodeTest.test(
  "laroux build fails with exit code 1 when the bundler build fails",
  async () => {
    const projectRoot = await runtime.fs.makeTempDir({
      prefix: "laroux-build-",
    });

    try {
      const pagePath = runtime.path.join(
        projectRoot,
        "src/app/routes/home/page.tsx",
      );
      await runtime.fs.ensureDir(runtime.path.dirname(pagePath));
      await runtime.fs.writeTextFile(
        pagePath,
        "export function HomePage() {\n  return <h1>Home</h1>;\n}\n",
      );

      const result = await build.runBuild({
        projectRoot,
        outDir: "dist",
        minify: false,
        clean: false,
        analyze: true,
        logLevel: "fatal",
        frameworkPlugin: failingClientEntryPlugin,
      });

      assert.assert(results.isFail(result));
      assert.assertEquals(result.error.exitCode, 1);
      assert.assertStringIncludes(result.error.message ?? "", projectRoot);
    } finally {
      await runtime.fs.remove(projectRoot, { recursive: true });
    }
  },
);
