// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as mock from "@eserstack/test-kit/mock";
import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as streams from "@eserstack/streams";
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

/** A build that records its calls and builds nothing. */
const fakeBuild = () =>
  mock.spy((_options: build.BuildFlagOptions) =>
    Promise.resolve(results.ok(undefined)),
  );

nodeTest.describe("laroux build: help", () => {
  for (const flag of ["--help", "-h"]) {
    nodeTest.it(`${flag} prints the help and builds nothing`, async () => {
      const runBuild = fakeBuild();
      const sink = streams.sinks.buffer<string>();

      const result = await build.main([flag], { build: runBuild, sink });

      assert.assert(results.isOk(result));
      mock.assertSpyCalls(runBuild, 0);

      const printed = sink.items().join("");
      assert.assertStringIncludes(printed, "laroux build [options]");
      for (const name of [
        "--out-dir",
        "--clean",
        "--no-minify",
        "--analyze",
        "--log-level",
      ]) {
        assert.assertStringIncludes(printed, name);
      }
    });
  }
});

nodeTest.describe("laroux build: the flags", () => {
  nodeTest.it(
    "builds the working directory with the parsed flags",
    async () => {
      const runBuild = fakeBuild();
      const sink = streams.sinks.buffer<string>();

      const result = await build.main(
        ["--out-dir", "out", "--no-minify", "--clean", "--log-level", "error"],
        { build: runBuild, sink },
      );

      assert.assert(results.isOk(result));
      mock.assertSpyCalls(runBuild, 1);
      assert.assertEquals(runBuild.calls[0]?.args[0], {
        projectRoot: runtime.process.cwd(),
        outDir: "out",
        minify: false,
        clean: true,
        analyze: false,
        logLevel: "error",
      });
    },
  );
});
