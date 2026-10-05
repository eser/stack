// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for the workspace version bump.
 *
 * Each test builds a small workspace in a temporary directory: a root
 * package.json with `workspaces: ["pkg/*"]`, a VERSION file and two member
 * packages.
 *
 * @module
 */

import * as assert from "@std/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as versions from "./versions.ts";

const writeJson = async (
  filepath: string,
  content: Record<string, unknown>,
): Promise<void> => {
  await runtime.fs.writeTextFile(
    filepath,
    `${JSON.stringify(content, null, 2)}\n`,
  );
};

const readVersion = async (filepath: string): Promise<unknown> => {
  const content = JSON.parse(await runtime.fs.readTextFile(filepath)) as {
    version?: unknown;
  };

  return content.version;
};

type Workspace = {
  readonly root: string;
  readonly rootManifest: string;
  readonly memberManifests: readonly string[];
};

const makeWorkspace = async (): Promise<Workspace> => {
  const root = await runtime.fs.makeTempDir({ prefix: "versions-test-" });
  const rootManifest = runtime.path.join(root, "package.json");

  await writeJson(rootManifest, {
    name: "fixture-root",
    version: "1.0.0",
    workspaces: ["pkg/*"],
  });
  await runtime.fs.writeTextFile(runtime.path.join(root, "VERSION"), "1.0.0\n");

  const memberManifests = await Promise.all(
    ["alpha", "beta"].map(async (name) => {
      const dir = runtime.path.join(root, "pkg", name);
      const manifest = runtime.path.join(dir, "package.json");

      await runtime.fs.mkdir(dir, { recursive: true });
      await writeJson(manifest, { name: `@fixture/${name}`, version: "1.0.0" });

      return manifest;
    }),
  );

  return { root, rootManifest, memberManifests };
};

Deno.test("versions: a patch bump writes every package file and VERSION", async () => {
  const workspace = await makeWorkspace();

  try {
    const result = await versions.versions("patch", { root: workspace.root });

    assert.assertEquals(result.targetVersion, "1.0.1");
    assert.assertEquals(result.changedCount, 3);
    assert.assertEquals(await readVersion(workspace.rootManifest), "1.0.1");
    assert.assertEquals(
      await Promise.all(workspace.memberManifests.map(readVersion)),
      ["1.0.1", "1.0.1"],
    );
    assert.assertEquals(
      await runtime.fs.readTextFile(
        runtime.path.join(workspace.root, "VERSION"),
      ),
      "1.0.1\n",
    );
  } finally {
    await runtime.fs.remove(workspace.root, { recursive: true });
  }
});

Deno.test("versions: an unwritable package file fails the bump with its path and reason", async () => {
  const workspace = await makeWorkspace();
  const lockedFiles = workspace.memberManifests;

  try {
    await Promise.all(
      lockedFiles.map((manifest) => runtime.fs.chmod(manifest, 0o444)),
    );

    const error = await assert.assertRejects(
      () => versions.versions("patch", { root: workspace.root }),
      versions.VersionWriteError,
    );

    assert.assertEquals(error.targetVersion, "1.0.1");
    assert.assertEquals(
      error.failures.map((failure) => failure.filepath).toSorted(),
      [...lockedFiles].toSorted(),
    );
    for (const failure of error.failures) {
      assert.assertNotEquals(failure.reason, "");
      assert.assertStringIncludes(
        error.message,
        `${failure.filepath}: ${failure.reason}`,
      );
    }
    assert.assertStringIncludes(error.message, "eser codebase versions 1.0.1");

    // The writable root manifest was bumped, but VERSION still names the old
    // version so the bump does not look complete.
    assert.assertEquals(await readVersion(workspace.rootManifest), "1.0.1");
    assert.assertEquals(
      await Promise.all(lockedFiles.map(readVersion)),
      ["1.0.0", "1.0.0"],
    );
    assert.assertEquals(
      await runtime.fs.readTextFile(
        runtime.path.join(workspace.root, "VERSION"),
      ),
      "1.0.0\n",
    );
  } finally {
    await Promise.all(
      lockedFiles.map((manifest) => runtime.fs.chmod(manifest, 0o644)),
    );
    await runtime.fs.remove(workspace.root, { recursive: true });
  }
});

Deno.test("versions: a dry run writes nothing", async () => {
  const workspace = await makeWorkspace();

  try {
    const result = await versions.versions("minor", {
      root: workspace.root,
      dryRun: true,
    });

    assert.assertEquals(result.targetVersion, "1.1.0");
    assert.assertEquals(result.dryRun, true);
    assert.assertEquals(await readVersion(workspace.rootManifest), "1.0.0");
    assert.assertEquals(
      await runtime.fs.readTextFile(
        runtime.path.join(workspace.root, "VERSION"),
      ),
      "1.0.0\n",
    );
  } finally {
    await runtime.fs.remove(workspace.root, { recursive: true });
  }
});
