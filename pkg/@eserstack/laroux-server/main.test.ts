// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import type { FrameworkPlugin } from "@eserstack/laroux-bundler";
import * as main from "./main.ts";

/** A framework plugin whose client entry step fails, as a broken app would. */
const failingClientEntryPlugin: FrameworkPlugin = {
  name: "failing-client-entry",
  createClientEntry: () =>
    Promise.reject(new Error("create client entry: fixture failure")),
};

/** Write a one-page laroux app to a temp directory and remove it after fn. */
async function withApp(fn: (projectRoot: string) => Promise<void>) {
  const projectRoot = await runtime.fs.makeTempDir({ prefix: "laroux-serve-" });

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

    await fn(projectRoot);
  } finally {
    await runtime.fs.remove(projectRoot, { recursive: true });
  }
}

// A server that started would leave its listener open, which the test
// sanitizers report, so the rejection alone shows serving never began.
for (const mode of ["serve", "dev"] as const) {
  nodeTest.test(
    `startServer in ${mode} mode does not serve after a failed build`,
    async () => {
      await withApp(async (projectRoot) => {
        const error = await assert.assertRejects(
          () =>
            main.startServer({
              mode,
              projectRoot,
              port: 0,
              hmr: false,
              logLevel: "fatal",
              frameworkPlugin: failingClientEntryPlugin,
            }),
          main.BuildFailedError,
        );

        assert.assertEquals(error.projectRoot, projectRoot);
      });
    },
  );
}
