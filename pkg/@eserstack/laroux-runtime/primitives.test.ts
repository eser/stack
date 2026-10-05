// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@std/assert";
import * as fileLoader from "@eserstack/config/file";
import * as runModes from "@eserstack/standards/run-modes";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as primitives from "./primitives.ts";

const withTempDir = async (
  fn: (dir: string) => Promise<void>,
): Promise<void> => {
  const dir = await runtime.fs.makeTempDir({ prefix: "laroux-runtime-" });
  try {
    await fn(dir);
  } finally {
    await runtime.fs.remove(dir, { recursive: true });
  }
};

// Lets a queued manifest read settle before start() attaches its handler, so a
// rejection with no handler would surface as an uncaught error in the test.
const settle = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 50));

Deno.test("loadManifest adds the manifest found in the directory", async () => {
  await withTempDir(async (dir) => {
    const manifest: primitives.LarouxManifest = {
      exports: [["./app.ts", [["handler", "function"]]]],
    };
    await runtime.fs.writeTextFile(
      runtime.path.join(dir, "manifest.json"),
      JSON.stringify(manifest),
    );

    const larouxRuntime = new primitives.LarouxRuntime().loadManifest(dir);
    await larouxRuntime.start();

    assert.assertEquals(larouxRuntime.state.manifests, [manifest]);
  });
});

Deno.test("loadManifest adds nothing when the directory has no manifest", async () => {
  await withTempDir(async (dir) => {
    const larouxRuntime = new primitives.LarouxRuntime().loadManifest(dir);
    await larouxRuntime.start();

    assert.assertEquals(larouxRuntime.state.manifests, []);
  });
});

Deno.test("start rejects with LarouxManifestLoadError when the manifest does not parse", async () => {
  await withTempDir(async (dir) => {
    await runtime.fs.writeTextFile(
      runtime.path.join(dir, "manifest.json"),
      "{ not json",
    );

    const larouxRuntime = new primitives.LarouxRuntime().loadManifest(dir);
    await settle();

    const error = await assert.assertRejects(
      () => larouxRuntime.start(),
      primitives.LarouxManifestLoadError,
      `load laroux manifest from "${dir}"`,
    );
    assert.assertEquals(error.searchDir, dir);
    assert.assertInstanceOf(error.cause, fileLoader.ConfigParseError);
    assert.assertEquals(larouxRuntime.state.manifests, []);
  });
});

const writeManifest = async (
  dir: string,
  fileName: string,
  content: string,
): Promise<void> => {
  await runtime.fs.ensureDir(dir);
  await runtime.fs.writeTextFile(runtime.path.join(dir, fileName), content);
};

const manifestFor = (entry: string): primitives.LarouxManifest => ({
  exports: [[entry, [["default", "function"]]]],
});

Deno.test("createLarouxRuntimeState starts with no base URL or manifests", () => {
  const state = primitives.createLarouxRuntimeState();

  assert.assertEquals(state.baseUrl, null);
  assert.assertEquals(state.manifests, []);
  assert.assertEquals(state.options, { basePath: "" });
  assert.assertEquals(state.awaits, []);
});

Deno.test("createLarouxRuntimeState takes the options it is given", () => {
  const state = primitives.createLarouxRuntimeState({ basePath: "/app" });

  assert.assertEquals(state.options, { basePath: "/app" });
});

Deno.test("addManifest appends without changing the previous list", () => {
  const larouxRuntime = new primitives.LarouxRuntime();
  const before = larouxRuntime.state.manifests;

  const returned = larouxRuntime.addManifest(manifestFor("./a.ts"));

  assert.assertStrictEquals(returned, larouxRuntime);
  assert.assertEquals(before, []);
  assert.assertEquals(larouxRuntime.state.manifests, [manifestFor("./a.ts")]);
});

Deno.test("dev adds the development run mode and keeps the others", () => {
  const state = primitives.createLarouxRuntimeState();
  state.runMode = runModes.RunModes.Test;
  const larouxRuntime = new primitives.LarouxRuntime(state);

  assert.assertStrictEquals(larouxRuntime.dev(), larouxRuntime);
  assert.assertEquals(runModes.inDevelopmentMode(state.runMode), true);
  assert.assertEquals(runModes.inTestMode(state.runMode), true);
});

Deno.test("loadManifest resolves a relative directory against the base URL", async () => {
  await withTempDir(async (dir) => {
    await writeManifest(
      runtime.path.join(dir, "config"),
      "manifest.json",
      JSON.stringify(manifestFor("./app.ts")),
    );

    const larouxRuntime = new primitives.LarouxRuntime()
      .setBaseUrl(dir)
      .loadManifest("config");
    await larouxRuntime.start();

    assert.assertEquals(larouxRuntime.state.manifests, [
      manifestFor("./app.ts"),
    ]);
  });
});

Deno.test("loadManifest prefers manifest.yaml over manifest.json", async () => {
  await withTempDir(async (dir) => {
    await writeManifest(
      dir,
      "manifest.yaml",
      'exports:\n  - - "./from-yaml.ts"\n    - - - "default"\n        - "function"\n',
    );
    await writeManifest(
      dir,
      "manifest.json",
      JSON.stringify(manifestFor("./from-json.ts")),
    );

    const larouxRuntime = new primitives.LarouxRuntime().loadManifest(dir);
    await larouxRuntime.execute();

    assert.assertEquals(larouxRuntime.state.manifests, [
      manifestFor("./from-yaml.ts"),
    ]);
  });
});

Deno.test("start waits for every queued manifest", async () => {
  await withTempDir(async (dir) => {
    const first = runtime.path.join(dir, "first");
    const second = runtime.path.join(dir, "second");
    await writeManifest(
      first,
      "manifest.json",
      JSON.stringify(manifestFor("./a.ts")),
    );
    await writeManifest(
      second,
      "manifest.json",
      JSON.stringify(manifestFor("./b.ts")),
    );

    const larouxRuntime = new primitives.LarouxRuntime()
      .loadManifest(first)
      .loadManifest(second);
    await larouxRuntime.start();

    const entries = larouxRuntime.state.manifests
      .map((manifest) => manifest.exports[0]?.[0])
      .toSorted();
    assert.assertEquals(entries, ["./a.ts", "./b.ts"]);
  });
});

Deno.test("a manifest queued while start waits is kept for the next start", async () => {
  await withTempDir(async (dir) => {
    const first = runtime.path.join(dir, "first");
    const second = runtime.path.join(dir, "second");
    await writeManifest(
      first,
      "manifest.json",
      JSON.stringify(manifestFor("./a.ts")),
    );
    await writeManifest(
      second,
      "manifest.json",
      JSON.stringify(manifestFor("./b.ts")),
    );

    const larouxRuntime = new primitives.LarouxRuntime().loadManifest(first);
    const starting = larouxRuntime.start();
    larouxRuntime.loadManifest(second);
    await starting;

    assert.assertEquals(larouxRuntime.state.awaits.length, 1);
    await larouxRuntime.start();
    assert.assertEquals(larouxRuntime.state.awaits, []);
    assert.assertEquals(larouxRuntime.state.manifests.length, 2);
  });
});
