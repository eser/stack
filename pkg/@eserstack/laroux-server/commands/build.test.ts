// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as childProcess from "node:child_process";
import * as nodeProcess from "node:process";
import * as nodeTest from "node:test";
import * as util from "node:util";
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
        logSink: streams.sinks.buffer<string>(),
      });

      assert.assert(results.isFail(result));
      assert.assertEquals(result.error.exitCode, 1);
      assert.assertStringIncludes(result.error.message ?? "", projectRoot);
    } finally {
      await runtime.fs.remove(projectRoot, { recursive: true });
    }
  },
);

/**
 * Runs a failing `laroux build` in a child process with the given bridge
 * switch, its log lines going to a buffer, and answers what reached the
 * buffer and what the child wrote to stderr.
 */
const runFailingBuildInChild = async (
  bridge: "enabled" | "disabled",
): Promise<{ logLines: string; stderr: string }> => {
  const script = `
    import * as build from ${JSON.stringify(import.meta.resolve("./build.ts"))};
    import * as streams from ${JSON.stringify(import.meta.resolve("@eserstack/streams"))};
    import * as crossRuntime from ${JSON.stringify(import.meta.resolve("@eserstack/standards/cross-runtime"))};
    const { runtime } = crossRuntime;
    const projectRoot = await runtime.fs.makeTempDir({ prefix: "laroux-build-log-" });
    try {
      const pagePath = runtime.path.join(projectRoot, "src/app/routes/home/page.tsx");
      await runtime.fs.ensureDir(runtime.path.dirname(pagePath));
      await runtime.fs.writeTextFile(pagePath, "export function HomePage() { return null; }\\n");
      const logSink = streams.sinks.buffer();
      await build.runBuild({
        projectRoot,
        outDir: "dist",
        minify: false,
        clean: false,
        analyze: false,
        logLevel: "error",
        frameworkPlugin: {
          name: "failing-client-entry",
          createClientEntry: () => Promise.reject(new Error("create client entry: fixture failure")),
        },
        logSink,
      });
      process.stdout.write("\\nRESULT " + JSON.stringify(logSink.items().join("")) + "\\n");
    } finally {
      await runtime.fs.remove(projectRoot, { recursive: true });
    }
  `;

  const env: Record<string, string | undefined> = { ...nodeProcess.env };
  delete env["ESER_AJAN"];
  if (bridge === "disabled") {
    env["ESER_AJAN"] = "disabled";
  }

  // execFile rejects when the child exits with a non-zero code.
  const { stdout, stderr } = await util.promisify(childProcess.execFile)(
    nodeProcess.execPath,
    ["--input-type=module", "--eval", script],
    { env },
  );

  const resultLine = stdout
    .split("\n")
    .find((line) => line.startsWith("RESULT "));
  assert.assertExists(resultLine);

  return {
    logLines: JSON.parse(resultLine.slice("RESULT ".length)) as string,
    stderr,
  };
};

for (const bridge of ["enabled", "disabled"] as const) {
  nodeTest.test(
    `laroux build writes its log lines through its output sink, bridge ${bridge}`,
    async () => {
      const { logLines, stderr } = await runFailingBuildInChild(bridge);

      // The failure is logged once, through the sink laroux configures, and
      // neither Go nor the console fallback writes it a second time.
      assert.assertEquals(logLines.split("Build failed").length - 1, 1);
      assert.assertStringIncludes(logLines, "[laroux-bundler.build]");
      assert.assertStringIncludes(logLines, "create client entry");
      assert.assertEquals(stderr.includes("Build failed"), false);
    },
  );
}

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
