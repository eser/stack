// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Remote pack installs write files named by the pack's own content, so a
 * hostile or broken pack must not reach outside its folders (TASK-327).
 *
 * @module
 */

import * as assert from "@eserstack/test-kit/assert";
import * as mock from "@eserstack/test-kit/mock";
import { runtime } from "@eserstack/standards/cross-runtime";
import type * as packSchema from "../pack/schema.ts";
import * as pack from "./pack.ts";

const SPECIFIER = "github:acme/packs#demo";

/** Serves every remote pack file with `body`, and counts the requests. */
const serving = (body: string) => {
  const urls: string[] = [];
  const stub = mock.stub(
    globalThis,
    "fetch",
    (input: string | URL | Request) => {
      urls.push(String(input));
      return Promise.resolve(new Response(body));
    },
  );

  return { urls, stub };
};

const manifest = (
  extra: Partial<packSchema.PackManifest>,
): packSchema.PackManifest => ({
  name: "demo",
  version: "1.0.0",
  description: "a test pack",
  ...extra,
});

const withProject = async (
  fn: (outer: string, root: string) => Promise<void>,
): Promise<void> => {
  const outer = await runtime.fs.makeTempDir({ prefix: "nos_pack_" });
  const root = `${outer}/project`;
  await runtime.fs.mkdir(root, { recursive: true });
  try {
    await fn(outer, root);
  } finally {
    await runtime.fs.remove(outer, { recursive: true });
  }
};

const listFiles = async (dir: string): Promise<string[]> => {
  const files: string[] = [];
  for await (const entry of runtime.fs.walk(dir, { includeDirs: false })) {
    files.push(entry.path.slice(dir.length + 1));
  }
  return files.sort();
};

Deno.test("checkPackFileName refuses names that leave their folder", () => {
  for (const name of ["", ".", "..", "../x", "a/b", "a\\b", "a\0b"]) {
    assert.assertThrows(
      () => pack.checkPackFileName("rule", name),
      Error,
      "must be a single file name",
    );
  }
  pack.checkPackFileName("rule", "style-guide");
});

Deno.test("projectFolderOf keeps folder rules inside the project", () => {
  assert.assertEquals(pack.projectFolderOf("src/api"), "src/api");
  assert.assertEquals(pack.projectFolderOf("src/../lib"), "lib");
  assert.assertEquals(pack.projectFolderOf("."), "");
  for (const dir of ["../x", "src/../../x", "/etc", "C:/x", "\\\\host\\x"]) {
    assert.assertEquals(pack.projectFolderOf(dir), null, dir);
  }
});

Deno.test("a remote pack cannot write outside its folders", async () => {
  const hostile: readonly Partial<packSchema.PackManifest>[] = [
    { name: "../../evil" },
    { rules: ["rules/../../../evil.md"] },
    { concerns: ["concerns/c.json"] },
    { folderRules: { "../outside": "rules/f.md" } },
  ];

  for (const extra of hostile) {
    // deno-lint-ignore no-await-in-loop
    await withProject(async (outer, root) => {
      // The concern case serves a concern whose id climbs out.
      const { stub } = serving(
        extra.concerns !== undefined
          ? JSON.stringify({ id: "../../evil", name: "x", reminders: [] })
          : "content",
      );
      try {
        await assert.assertRejects(
          () => pack.installRemotePack(root, SPECIFIER, manifest(extra)),
          Error,
        );
      } finally {
        stub.restore();
      }

      // Nothing appeared next to the project.
      const outside = (await listFiles(outer)).filter((f) =>
        !f.startsWith("project/")
      );
      assert.assertEquals(outside, [], JSON.stringify(extra));
    });
  }
});

Deno.test("a remote pack installs its files when they stay inside", async () => {
  await withProject(async (_outer, root) => {
    const { stub } = serving("- a rule\n");
    try {
      const installed = await pack.installRemotePack(
        root,
        SPECIFIER,
        manifest({ rules: ["rules/style.md"], folderRules: { "src": "f.md" } }),
      );
      assert.assertEquals(installed.rules, ["pack-demo-style.md"]);
      assert.assertEquals(installed.folderRules, ["src/.folder-rules.md"]);
      assert.assertEquals(
        await runtime.fs.readTextFile(`${root}/src/.folder-rules.md`),
        "- a rule\n",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("a remote pack file over the size limit is refused", async () => {
  await withProject(async (_outer, root) => {
    const { stub } = serving("x".repeat(pack.MAX_REMOTE_PACK_FILE_BYTES + 1));
    try {
      await assert.assertRejects(
        () =>
          pack.installRemotePack(
            root,
            SPECIFIER,
            manifest({ rules: ["rules/big.md"] }),
          ),
        Error,
        "is larger than",
      );
    } finally {
      stub.restore();
    }
  });
});

Deno.test("uninstall leaves files outside the pack's folders alone", async () => {
  await withProject((_outer, root) => {
    const paths = pack.installedPackPaths(root, {
      name: "demo",
      version: "1.0.0",
      installedAt: "2026-10-25T00:00:00.000Z",
      source: SPECIFIER,
      rules: ["pack-demo-style.md", "../../../etc/passwd"],
      concerns: ["001-a.json", "../manifest.yml"],
      folderRules: ["src/.folder-rules.md", "../../.folder-rules.md", "x.txt"],
    });

    assert.assertEquals(
      paths.map((p) => p.slice(root.length + 1)),
      [
        ".eser/rules/pack-demo-style.md",
        ".eser/concerns/001-a.json",
        "src/.folder-rules.md",
      ],
    );

    return Promise.resolve();
  });
});
