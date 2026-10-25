// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as fs from "node:fs";
import * as fsPromises from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as resolve from "./resolve.ts";

const libName = `libeser_ajan${resolve.getLibraryExtension()}`;

const platformSlug = `${process.platform}-${
  process.arch === "arm64" ? "arm64" : "x64"
}`;

/**
 * Runs `fn` with `process.cwd()` reporting `cwd` and `ESER_AJAN_LIB_PATH` set
 * to `libPathOverride`.
 *
 * Resolution reads the cwd through `process.cwd()`, so stubbing it is both
 * sufficient and safer than `process.chdir`, which would leak into other tests
 * sharing the process.
 */
const withEnvironment = <T>(
  cwd: string,
  libPathOverride: string | undefined,
  fn: () => T,
): T => {
  const originalCwd = process.cwd;
  const originalOverride = process.env["ESER_AJAN_LIB_PATH"];

  process.cwd = () => cwd;
  if (libPathOverride === undefined) {
    delete process.env["ESER_AJAN_LIB_PATH"];
  } else {
    process.env["ESER_AJAN_LIB_PATH"] = libPathOverride;
  }

  try {
    return fn();
  } finally {
    process.cwd = originalCwd;
    if (originalOverride === undefined) {
      delete process.env["ESER_AJAN_LIB_PATH"];
    } else {
      process.env["ESER_AJAN_LIB_PATH"] = originalOverride;
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
  const tempRoot = await fsPromises.mkdtemp(
    path.join(os.tmpdir(), "ajan-resolve-"),
  );
  const projectRoot = `${tempRoot}/proj`;
  const moduleDir = `${projectRoot}/node_modules/@eserstack/ajan/ffi`;

  await fsPromises.mkdir(moduleDir, { recursive: true });

  return { tempRoot, projectRoot, moduleDir };
};

const writeDummyLibrary = async (dir: string): Promise<string> => {
  await fsPromises.mkdir(dir, { recursive: true });

  const libraryPath = `${dir}/${libName}`;
  await fsPromises.writeFile(libraryPath, "not a real shared library");

  return libraryPath;
};

/** Compares two candidate paths by identity, past `..` segments and symlinks. */
const assertSameFile = (actual: string, expected: string): void => {
  assert.assertEquals(fs.realpathSync(actual), fs.realpathSync(expected));
};

nodeTest.test(
  "resolveLibraryPath — finds the hoisted sibling package from any cwd",
  async () => {
    const { tempRoot, projectRoot, moduleDir } = await createInstallTree();

    try {
      const expected = await writeDummyLibrary(
        `${projectRoot}/node_modules/@eserstack/ajan-${platformSlug}`,
      );

      const subdirectory = `${projectRoot}/src/nested/deep`;
      await fsPromises.mkdir(subdirectory, { recursive: true });

      // The project root is the only cwd the previous implementation handled;
      // the other two are what an installed CLI invocation actually looks like.
      for (const cwd of [projectRoot, subdirectory, tempRoot]) {
        const resolved = withEnvironment(cwd, undefined, () =>
          resolve.resolveLibraryPath(moduleDir),
        );

        assertSameFile(resolved, expected);
      }
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  },
);

nodeTest.test(
  "resolveLibraryPath — finds a nested (non-hoisted) install",
  async () => {
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
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  },
);

nodeTest.test(
  "resolveLibraryPath — finds a package installed above the cwd",
  async () => {
    const { tempRoot, projectRoot } = await createInstallTree();

    try {
      const expected = await writeDummyLibrary(
        `${projectRoot}/node_modules/@eserstack/ajan-${platformSlug}`,
      );

      const subdirectory = `${projectRoot}/apps/web`;
      await fsPromises.mkdir(subdirectory, { recursive: true });

      // No usable module directory: the JSR/remote case, where `getModuleDir()`
      // falls back to the cwd and resolution has nothing else to work with.
      const resolved = withEnvironment(subdirectory, undefined, () =>
        resolve.resolveLibraryPath(subdirectory),
      );

      assertSameFile(resolved, expected);
    } finally {
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  },
);

nodeTest.test(
  "resolveLibraryPath — ESER_AJAN_LIB_PATH overrides an installed package",
  async () => {
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
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  },
);

nodeTest.test(
  "resolveLibraryPath — reports every probed location when nothing matches",
  async () => {
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
      await fsPromises.rm(tempRoot, { recursive: true, force: true });
    }
  },
);
