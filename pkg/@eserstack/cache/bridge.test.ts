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
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as cache from "./mod.ts";
import * as ffiClient from "./ffi-client.ts";

const runtime = crossRuntime.runtime;

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

const MOD_URL = import.meta.resolve("./mod.ts");

/**
 * Runs `script` as an ES module in a new Node process with `env` on top of
 * this process's environment, and parses what it writes to stdout.
 */
const runChild = async <T>(
  script: string,
  env: Readonly<Record<string, string>>,
): Promise<T> => {
  const output = await runtime.exec.spawn(
    runtime.process.execPath(),
    ["--no-warnings", "--input-type=module", "--eval", script],
    { env: { ...env }, stdout: "piped", stderr: "piped" },
  );

  assert.assertEquals(output.code, 0, new TextDecoder().decode(output.stderr));

  return JSON.parse(new TextDecoder().decode(output.stdout)) as T;
};

/** The variables a fixture host may set; the others are cleared. */
const HOST_ENV_NAMES = [
  "XDG_CACHE_HOME",
  "XDG_DATA_HOME",
  "XDG_CONFIG_HOME",
  "LOCALAPPDATA",
  "APPDATA",
];

/**
 * The environment of a child process that runs as a fixture host: its home
 * and variables, with every other variable of the rules empty, which counts
 * as unset.
 */
const hostEnv = (fixtureHost: FixtureHost): Record<string, string> => {
  const env: Record<string, string> = {
    HOME: fixtureHost.home,
    USERPROFILE: fixtureHost.home,
  };
  for (const name of HOST_ENV_NAMES) {
    env[name] = fixtureHost.env[name] ?? "";
  }
  return env;
};

/** The platform this process runs on, as the fixtures name it. */
const PLATFORM = crossRuntime.getPlatform();

nodeTest.test(
  "the XDG functions answer xdg_homes.json for this platform",
  async () => {
    const cases = (await readFixture<XdgHomesCase[]>("xdg_homes.json")).filter(
      (tc) => tc.host.platform === PLATFORM,
    );
    assert.assert(cases.length > 0, `no xdg_homes.json case for ${PLATFORM}`);

    for (const tc of cases) {
      // One process per case, each with its own environment.
      // oxlint-disable-next-line no-await-in-loop
      const got = await runChild<Record<string, string>>(
        `
          import * as cache from ${JSON.stringify(MOD_URL)};
          process.stdout.write(JSON.stringify({
            cacheHome: cache.getXdgCacheHome(),
            dataHome: cache.getXdgDataHome(),
            configHome: cache.getXdgConfigHome(),
          }));
        `,
        hostEnv(tc.host),
      );

      assert.assertEquals(
        {
          cacheHome: slashes(got["cacheHome"]),
          dataHome: slashes(got["dataHome"]),
          configHome: slashes(got["configHome"]),
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
  "the app path functions and the manager's paths answer app_paths.json for this platform",
  async () => {
    const cases = (await readFixture<AppPathsCase[]>("app_paths.json")).filter(
      (tc) => tc.host.platform === PLATFORM,
    );
    assert.assert(cases.length > 0, `no app_paths.json case for ${PLATFORM}`);

    for (const tc of cases) {
      const request = JSON.stringify({
        app: tc.app,
        baseDir: tc.baseDir,
        version: tc.version,
        item: tc.item,
      });
      // One process per case, each with its own environment.
      // oxlint-disable-next-line no-await-in-loop
      const got = await runChild<Record<string, string | null>>(
        `
          import * as cache from ${JSON.stringify(MOD_URL)};
          const { app, baseDir, version, item } = ${request};
          const manager = cache.createCacheManager({ app, baseDir });
          process.stdout.write(JSON.stringify({
            appDir: baseDir === undefined ? cache.getAppCacheDir(app) : null,
            versionedPath: baseDir === undefined
              ? cache.getVersionedCachePath(app, version, item)
              : null,
            cacheDir: manager.getCacheDir(),
            managerVersionedPath: manager.getVersionedPath(version, item),
          }));
        `,
        hostEnv(tc.host),
      );

      if (tc.baseDir === undefined) {
        assert.assertEquals(slashes(got["appDir"] ?? ""), tc.appDir, tc.name);
        assert.assertEquals(
          slashes(got["versionedPath"] ?? ""),
          tc.versionedPath,
          tc.name,
        );
      }
      assert.assertEquals(slashes(got["cacheDir"] ?? ""), tc.appDir, tc.name);
      assert.assertEquals(
        slashes(got["managerVersionedPath"] ?? ""),
        tc.versionedPath,
        tc.name,
      );
    }
  },
);

nodeTest.test("an app without a name has no app paths", () => {
  assert.assertThrows(
    () => cache.getAppCacheDir({ name: "" }),
    Error,
    "app.name is required",
  );
});

nodeTest.test(
  "with ESER_AJAN=disabled every export that reaches Go throws or rejects with the bridge's load error",
  async () => {
    const result = await runChild<{
      failures: Array<{ name: string; message: string; cause: string } | null>;
    }>(
      `
        import * as cache from ${JSON.stringify(MOD_URL)};
        const manager = cache.createCacheManager({ app: { name: "disabled" } });
        const app = { name: "disabled" };
        const failures = [];
        for (const [name, run] of [
          ["getXdgCacheHome", () => cache.getXdgCacheHome()],
          ["getXdgDataHome", () => cache.getXdgDataHome()],
          ["getXdgConfigHome", () => cache.getXdgConfigHome()],
          ["getAppCacheDir", () => cache.getAppCacheDir(app)],
          ["getVersionedCachePath", () => cache.getVersionedCachePath(app, "1.0.0", "bin")],
          ["getCacheDir", () => manager.getCacheDir()],
          ["getVersionedPath", () => manager.getVersionedPath("1.0.0", "bin")],
          ["exists", () => manager.exists("x")],
          ["ensureDir", () => manager.ensureDir("x")],
          ["list", () => manager.list()],
          ["remove", () => manager.remove("x")],
          ["clear", () => manager.clear()],
        ]) {
          try {
            await run();
            failures.push(null);
          } catch (error) {
            failures.push({ name, message: error.message, cause: error.cause?.message ?? "" });
          }
        }
        await manager.close();
        process.stdout.write(JSON.stringify({ failures }));
      `,
      { ESER_AJAN: "disabled" },
    );

    assert.assertEquals(result.failures.length, 12);
    for (const failure of result.failures) {
      assert.assertExists(failure);
      assert.assertStringIncludes(
        failure.message,
        "eser-ajan native library unavailable",
        failure.name,
      );
      assert.assertStringIncludes(
        failure.cause,
        "ESER_AJAN=disabled",
        failure.name,
      );
    }
  },
);
