// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as folderRules from "./folder-rules.ts";

const withProject = async (
  fn: (outer: string, root: string) => Promise<void>,
): Promise<void> => {
  const outer = await runtime.fs.makeTempDir({ prefix: "noskills-folders-" });
  const root = `${outer}/project`;
  try {
    await runtime.fs.mkdir(`${root}/src/app`, { recursive: true });
    await runtime.fs.writeTextFile(`${root}/.folder-rules.md`, "- root rule\n");
    await runtime.fs.writeTextFile(
      `${root}/src/.folder-rules.md`,
      "- src rule\n",
    );
    await runtime.fs.mkdir(`${outer}/secret`, { recursive: true });
    await runtime.fs.writeTextFile(
      `${outer}/secret/.folder-rules.md`,
      "- outside rule\n",
    );
    await runtime.fs.writeTextFile(
      `${outer}/.folder-rules.md`,
      "- parent rule\n",
    );
    await fn(outer, root);
  } finally {
    await runtime.fs.remove(outer, { recursive: true });
  }
};

Deno.test("collectFolderRules walks from the file up to the root", async () => {
  await withProject(async (_outer, root) => {
    const rules = await folderRules.collectFolderRules(root, [
      "src/app/page.tsx",
    ]);
    assert.assertEquals(
      rules.map((r) => `${r.folder}: ${r.rule}`),
      ["src: src rule", ".: root rule"],
    );
  });
});

// TASK-323: a path with .. segments used to read .folder-rules.md files
// outside the project.
Deno.test("collectFolderRules never reads outside the project", async () => {
  await withProject(async (_outer, root) => {
    for (const file of ["../secret/a.ts", "src/../../secret/a.ts", "../a.ts"]) {
      // One path at a time, so a failure names it.
      // deno-lint-ignore no-await-in-loop
      const rules = await folderRules.collectFolderRules(root, [file]);
      const texts = rules.map((r) => r.rule);
      assert.assertEquals(texts.includes("outside rule"), false, file);
      assert.assertEquals(texts.includes("parent rule"), false, file);
    }

    // A path that only passes through .. and stays inside still works.
    const inside = await folderRules.collectFolderRules(root, [
      "src/app/../page.ts",
    ]);
    assert.assertEquals(
      inside.map((r) => r.rule),
      ["src rule", "root rule"],
    );
  });
});
