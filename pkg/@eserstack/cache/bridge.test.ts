// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * The cache logic that lives in Go (`pkg/ajan/cachefx`), reached through the
 * bridge's dispatcher (`EserAjanCall`). The cases are the fixture files that
 * the Go tests of cachefx read, so both sides check the same behavior.
 *
 * @module
 */

import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as cache from "./mod.ts";
import * as ffiClient from "./ffi-client.ts";

const FIXTURES = runtime.path.join(
  import.meta.dirname ?? ".",
  "..",
  "..",
  "ajan",
  "cachefx",
  "testdata",
);

const readFixture = async <T>(name: string): Promise<T> =>
  JSON.parse(
    await runtime.fs.readTextFile(runtime.path.join(FIXTURES, name)),
  ) as T;

/** Paths from Go use the host separator; the fixtures use slashes. */
const slashes = (path: string | undefined): string | undefined =>
  path?.replaceAll("\\", "/");

interface FixtureHost {
  readonly platform: string;
  readonly home: string;
  readonly env: Readonly<Record<string, string>>;
}

interface XdgHomesCase {
  readonly name: string;
  readonly host: FixtureHost;
  readonly cacheHome: string;
  readonly dataHome: string;
  readonly configHome: string;
}

interface AppPathsCase {
  readonly name: string;
  readonly host: FixtureHost;
  readonly app: { readonly name: string; readonly org?: string };
  readonly baseDir?: string;
  readonly version: string;
  readonly item: string;
  readonly appDir: string;
  readonly versionedPath: string;
}

interface PathWant {
  readonly path: string;
  readonly want: boolean;
}

interface ManagerPathsFixture {
  readonly files: readonly string[];
  readonly dirs: readonly string[];
  readonly exists: readonly PathWant[];
  readonly ensureDir: readonly string[];
  readonly remove: readonly string[];
  readonly afterRemove: readonly PathWant[];
}

nodeTest.test(
  "cacheResolvePaths answers the base directories of xdg_homes.json",
  async () => {
    const lib = await ffiClient.requireLib();

    for (const tc of await readFixture<XdgHomesCase[]>("xdg_homes.json")) {
      const answer = lib.call("cacheResolvePaths", { host: tc.host });

      assert.assertEquals(answer.error, undefined, tc.name);
      assert.assertEquals(
        {
          cacheHome: slashes(answer.cacheHome),
          dataHome: slashes(answer.dataHome),
          configHome: slashes(answer.configHome),
        },
        {
          cacheHome: tc.cacheHome,
          dataHome: tc.dataHome,
          configHome: tc.configHome,
        },
        tc.name,
      );
    }
  },
);

nodeTest.test(
  "cacheResolvePaths answers the app paths of app_paths.json",
  async () => {
    const lib = await ffiClient.requireLib();

    for (const tc of await readFixture<AppPathsCase[]>("app_paths.json")) {
      const answer = lib.call("cacheResolvePaths", {
        host: tc.host,
        app: tc.app,
        baseDir: tc.baseDir,
        version: tc.version,
        item: tc.item,
      });

      assert.assertEquals(answer.error, undefined, tc.name);
      assert.assertEquals(slashes(answer.appDir), tc.appDir, tc.name);
      assert.assertEquals(
        slashes(answer.versionedPath),
        tc.versionedPath,
        tc.name,
      );
    }
  },
);

nodeTest.test(
  "exists, ensureDir and remove follow manager_paths.json",
  async () => {
    const fixture =
      await readFixture<ManagerPathsFixture>("manager_paths.json");
    const baseDir = await runtime.fs.makeTempDir({ prefix: "cache-bridge-" });
    const manager = cache.createCacheManager({
      app: { name: "manager", org: "fixture" },
      baseDir,
    });

    try {
      const cacheDir = manager.getCacheDir();
      await Promise.all(
        fixture.dirs.map((dir) =>
          runtime.fs.mkdir(runtime.path.join(cacheDir, dir), {
            recursive: true,
          }),
        ),
      );
      await Promise.all(
        fixture.files.map(async (file) => {
          const path = runtime.path.join(cacheDir, file);
          await runtime.fs.mkdir(runtime.path.dirname(path), {
            recursive: true,
          });
          await runtime.fs.writeTextFile(path, "content");
        }),
      );

      // The steps of one stage touch different paths, so each runs at once.
      const check = async (stage: string, wants: readonly PathWant[]) => {
        const got = await Promise.all(
          wants.map(({ path }) => manager.exists(path)),
        );
        assert.assertEquals(
          got,
          wants.map(({ want }) => want),
          `${stage}: ${wants.map(({ path }) => path).join(", ")}`,
        );
      };

      await check("before", fixture.exists);

      await Promise.all(fixture.ensureDir.map((dir) => manager.ensureDir(dir)));
      await check(
        "after ensureDir",
        fixture.ensureDir.map((path) => ({ path, want: true })),
      );

      await Promise.all(fixture.remove.map((path) => manager.remove(path)));

      await check("after remove", fixture.afterRemove);
    } finally {
      await manager.close();
      await runtime.fs.remove(baseDir, { recursive: true });
    }
  },
);

nodeTest.test("an absolute path reaches Go unchanged", async () => {
  const baseDir = await runtime.fs.makeTempDir({ prefix: "cache-bridge-" });
  const manager = cache.createCacheManager({
    app: { name: "absolute" },
    baseDir,
  });

  try {
    const outside = runtime.path.join(baseDir, "outside");
    await manager.ensureDir(outside);

    assert.assertEquals(await runtime.fs.exists(outside), true);
    assert.assertEquals(await manager.exists(outside), true);
  } finally {
    await manager.close();
    await runtime.fs.remove(baseDir, { recursive: true });
  }
});

nodeTest.test(
  "with ESER_AJAN=disabled the Go-backed methods reject with the bridge's load error, and the TypeScript ones still answer",
  async () => {
    const script = `
      import * as cache from ${JSON.stringify(import.meta.resolve("./mod.ts"))};
      const manager = cache.createCacheManager({ app: { name: "disabled" } });
      const out = {
        xdg: [cache.getXdgCacheHome(), cache.getXdgDataHome(), cache.getXdgConfigHome()]
          .every((dir) => dir.length > 0),
        appDir: cache.getAppCacheDir({ name: "disabled" }).endsWith("disabled"),
        versioned: manager.getVersionedPath("1.0.0", "bin").includes("v1.0.0"),
        rejections: [],
      };
      for (const run of [
        () => manager.exists("x"),
        () => manager.ensureDir("x"),
        () => manager.list(),
        () => manager.remove("x"),
        () => manager.clear(),
      ]) {
        try {
          await run();
          out.rejections.push(null);
        } catch (error) {
          out.rejections.push({ message: error.message, cause: error.cause?.message ?? null });
        }
      }
      await manager.close();
      process.stdout.write(JSON.stringify(out));
    `;
    const output = await runtime.exec.spawn(
      runtime.process.execPath(),
      ["--input-type=module", "--eval", script],
      { env: { ESER_AJAN: "disabled" }, stdout: "piped", stderr: "piped" },
    );

    assert.assertEquals(
      output.code,
      0,
      new TextDecoder().decode(output.stderr),
    );
    const result = JSON.parse(new TextDecoder().decode(output.stdout)) as {
      xdg: boolean;
      appDir: boolean;
      versioned: boolean;
      rejections: Array<{ message: string; cause: string | null } | null>;
    };

    assert.assertEquals(result.xdg, true);
    assert.assertEquals(result.appDir, true);
    assert.assertEquals(result.versioned, true);
    assert.assertEquals(result.rejections.length, 5);
    for (const rejection of result.rejections) {
      assert.assertExists(rejection);
      assert.assertStringIncludes(
        rejection.message,
        "eser-ajan native library unavailable",
      );
      assert.assertStringIncludes(rejection.cause ?? "", "ESER_AJAN=disabled");
    }
  },
);
