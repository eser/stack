// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as buildModule from "./build-module.ts";

Deno.test("toBuildModuleUrl gives each build of a file its own URL", () => {
  const filePath = runtime.path.resolve("dist", "server", "api-routes.ts");

  const first = buildModule.toBuildModuleUrl(filePath, "01J9AAAA");
  const again = buildModule.toBuildModuleUrl(filePath, "01J9AAAA");
  const next = buildModule.toBuildModuleUrl(filePath, "01J9BBBB");

  assert.assertEquals(first, again);
  assert.assertNotEquals(first, next);
  assert.assertEquals(new URL(first).protocol, "file:");
  assert.assertEquals(new URL(first).searchParams.get("v"), "01J9AAAA");
});

Deno.test("toBuildModuleUrl escapes characters a file path may hold", () => {
  const filePath = runtime.path.resolve("my app #2", "page?.js");

  const url = new URL(buildModule.toBuildModuleUrl(filePath, "01J9AAAA"));

  // "#" and "?" stay part of the path instead of starting the fragment or
  // the query
  assert.assertEquals(url.hash, "");
  assert.assertEquals(url.search, "?v=01J9AAAA");
  assert.assertStringIncludes(url.pathname, "my%20app%20%232/page%3F.js");
});

Deno.test("importOptionalBuildModule returns null for a file the build did not write", async () => {
  const dir = await runtime.fs.makeTempDir({ prefix: "laroux-module-" });
  try {
    const missing = await buildModule.importOptionalBuildModule(
      runtime.path.join(dir, "proxy-registry.ts"),
      "01J9AAAA",
    );

    assert.assertEquals(missing, null);
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
});

Deno.test("importOptionalBuildModule loads the file again for the next build", async () => {
  const dir = await runtime.fs.makeTempDir({ prefix: "laroux-module-" });
  try {
    const filePath = runtime.path.join(dir, "registry.ts");
    await runtime.fs.writeTextFile(filePath, 'export const build = "one";\n');
    const first = await buildModule.importOptionalBuildModule(
      filePath,
      "build-1",
    );

    await runtime.fs.writeTextFile(filePath, 'export const build = "two";\n');
    const sameBuild = await buildModule.importOptionalBuildModule(
      filePath,
      "build-1",
    );
    const nextBuild = await buildModule.importOptionalBuildModule(
      filePath,
      "build-2",
    );

    assert.assertEquals(first?.["build"], "one");
    assert.assertEquals(sameBuild?.["build"], "one");
    assert.assertEquals(nextBuild?.["build"], "two");
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
});
