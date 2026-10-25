// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import * as resolve from "./resolve.ts";

const libName = `libeser_ajan${resolve.getLibraryExtension()}`;

const platformSlug = `${
  Deno.build.os === "windows" ? "win32" : Deno.build.os
}-${Deno.build.arch === "aarch64" ? "arm64" : "x64"}`;

/**
 * Runs `fn` with `process.cwd()` reporting `cwd` and `ESER_AJAN_LIB_PATH` set
 * to `libPathOverride`.
 *
 * Resolution reads the cwd through `process.cwd()`, so stubbing it is both
 * sufficient and safer than `Deno.chdir`, which would leak into other test
 * files sharing the process under `deno test --parallel`.
 */
const withEnvironment = <T>(
  cwd: string,
  libPathOverride: string | undefined,
  fn: () => T,
): T => {
  // globalThis does not declare Deno, Bun or process on every runtime.
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;
  const originalCwd = g.process.cwd;
  const originalOverride = g.process.env["ESER_AJAN_LIB_PATH"];

  g.process.cwd = () => cwd;
  if (libPathOverride === undefined) {
    delete g.process.env["ESER_AJAN_LIB_PATH"];
  } else {
    g.process.env["ESER_AJAN_LIB_PATH"] = libPathOverride;
  }

  try {
    return fn();
  } finally {
    g.process.cwd = originalCwd;
    if (originalOverride === undefined) {
      delete g.process.env["ESER_AJAN_LIB_PATH"];
    } else {
      g.process.env["ESER_AJAN_LIB_PATH"] = originalOverride;
    }
  }
};

/**
 * Creates `<temp>/proj/node_modules/@eserstack/ajan/ffi`, the location this
 * module occupies after `npm install @eserstack/ajan`.
 */
const createInstallTree = async (): Promise<{
  tempRoot: string;
  projectRoot: string;
  moduleDir: string;
}> => {
  const tempRoot = await Deno.makeTempDir({ prefix: "ajan-resolve-" });
  const projectRoot = `${tempRoot}/proj`;
  const moduleDir = `${projectRoot}/node_modules/@eserstack/ajan/ffi`;

  await Deno.mkdir(moduleDir, { recursive: true });

  return { tempRoot, projectRoot, moduleDir };
};

const writeDummyLibrary = async (dir: string): Promise<string> => {
  await Deno.mkdir(dir, { recursive: true });

  const path = `${dir}/${libName}`;
  await Deno.writeTextFile(path, "not a real shared library");

  return path;
};

/** Compares two candidate paths by identity, past `..` segments and symlinks. */
const assertSameFile = (actual: string, expected: string): void => {
  assert.assertEquals(Deno.realPathSync(actual), Deno.realPathSync(expected));
};

Deno.test("resolveLibraryPath — finds the hoisted sibling package from any cwd", async () => {
  const { tempRoot, projectRoot, moduleDir } = await createInstallTree();

  try {
    const expected = await writeDummyLibrary(
      `${projectRoot}/node_modules/@eserstack/ajan-${platformSlug}`,
    );

    const subdirectory = `${projectRoot}/src/nested/deep`;
    await Deno.mkdir(subdirectory, { recursive: true });

    // The project root is the only cwd the previous implementation handled;
    // the other two are what an installed CLI invocation actually looks like.
    for (const cwd of [projectRoot, subdirectory, tempRoot]) {
      const resolved = withEnvironment(cwd, undefined, () =>
        resolve.resolveLibraryPath(moduleDir),
      );

      assertSameFile(resolved, expected);
    }
  } finally {
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test("resolveLibraryPath — finds a nested (non-hoisted) install", async () => {
  const { tempRoot, projectRoot, moduleDir } = await createInstallTree();

  try {
    const expected = await writeDummyLibrary(
      `${projectRoot}/node_modules/@eserstack/ajan/node_modules/@eserstack/ajan-${platformSlug}`,
    );

    const resolved = withEnvironment(tempRoot, undefined, () =>
      resolve.resolveLibraryPath(moduleDir),
    );

    assertSameFile(resolved, expected);
  } finally {
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test("resolveLibraryPath — finds a package installed above the cwd", async () => {
  const { tempRoot, projectRoot } = await createInstallTree();

  try {
    const expected = await writeDummyLibrary(
      `${projectRoot}/node_modules/@eserstack/ajan-${platformSlug}`,
    );

    const subdirectory = `${projectRoot}/apps/web`;
    await Deno.mkdir(subdirectory, { recursive: true });

    // No usable module directory: the JSR/remote case, where `getModuleDir()`
    // falls back to the cwd and resolution has nothing else to work with.
    const resolved = withEnvironment(subdirectory, undefined, () =>
      resolve.resolveLibraryPath(subdirectory),
    );

    assertSameFile(resolved, expected);
  } finally {
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test("resolveLibraryPath — ESER_AJAN_LIB_PATH overrides an installed package", async () => {
  const { tempRoot, projectRoot, moduleDir } = await createInstallTree();

  try {
    await writeDummyLibrary(
      `${projectRoot}/node_modules/@eserstack/ajan-${platformSlug}`,
    );
    const override = await writeDummyLibrary(`${tempRoot}/explicit`);

    const resolved = withEnvironment(tempRoot, override, () =>
      resolve.resolveLibraryPath(moduleDir),
    );

    assert.assertEquals(resolved, override);
  } finally {
    await Deno.remove(tempRoot, { recursive: true });
  }
});

Deno.test("resolveLibraryPath — reports every probed location when nothing matches", async () => {
  const { tempRoot, moduleDir } = await createInstallTree();

  try {
    const error = assert.assertThrows(
      () =>
        withEnvironment(tempRoot, `${tempRoot}/missing/${libName}`, () =>
          resolve.resolveLibraryPath(moduleDir),
        ),
      Error,
    );

    assert.assertStringIncludes(error.message, "$ESER_AJAN_LIB_PATH = ");
    assert.assertStringIncludes(error.message, `${moduleDir}/${libName}`);
    assert.assertStringIncludes(
      error.message,
      `${moduleDir}/../../ajan-${platformSlug}/${libName}`,
    );
    assert.assertStringIncludes(
      error.message,
      `${tempRoot}/proj/node_modules/@eserstack/ajan-${platformSlug}/${libName}`,
    );
    assert.assertStringIncludes(error.message, `/usr/local/lib/${libName}`);
  } finally {
    await Deno.remove(tempRoot, { recursive: true });
  }
});
