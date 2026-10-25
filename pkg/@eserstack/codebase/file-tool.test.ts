// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for the standalone CLI that createFileTool builds.
 *
 * Each test writes a few files into a temporary root and runs a tool whose
 * checkFile records the files it was given, so a test sees exactly which files
 * the flags let through.
 *
 * @module
 */

import * as assert from "@eserstack/test-kit/assert";
import * as primitives from "@eserstack/primitives";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as fileTool from "./file-tool.ts";

const FIXTURE_FILES = ["keep.txt", "skip-a.txt", "skip-b.txt"];

/** A tool that reports no issues and records the name of every file it checks. */
const recordingTool = (checked: string[]): fileTool.FileTool =>
  fileTool.createFileTool({
    name: "record-files",
    description: "Records the files it checks",
    canFix: false,
    stacks: [],
    defaults: {},
    checkFile: (file) => {
      checked.push(file.name);
      return [];
    },
  });

const withFixtureRoot = async (
  fn: (root: string) => Promise<void>,
): Promise<void> => {
  const root = await runtime.fs.makeTempDir({ prefix: "file-tool-cli-" });
  try {
    await Promise.all(
      FIXTURE_FILES.map((name) =>
        runtime.fs.writeTextFile(runtime.path.join(root, name), "content\n"),
      ),
    );
    await fn(root);
  } finally {
    await runtime.fs.remove(root, { recursive: true });
  }
};

const cases: ReadonlyArray<{
  readonly name: string;
  readonly flags: readonly string[];
  readonly expected: readonly string[];
}> = [
  {
    name: "checks every file without --exclude",
    flags: [],
    expected: ["keep.txt", "skip-a.txt", "skip-b.txt"],
  },
  {
    name: "applies a single --exclude",
    flags: ["--exclude", "skip-a"],
    expected: ["keep.txt", "skip-b.txt"],
  },
  {
    name: "applies every repeated --exclude",
    flags: ["--exclude", "skip-a", "--exclude", "skip-b"],
    expected: ["keep.txt"],
  },
  {
    name: "applies repeated --exclude=<p> forms",
    flags: ["--exclude=skip-a", "--exclude=skip-b"],
    expected: ["keep.txt"],
  },
];

for (const { name, flags, expected } of cases) {
  // sanitizeResources is off because file-tool.ts loads the FFI
  // DynamicLibrary, which stays open after the test.
  Deno.test({
    name: `createFileTool main: ${name}`,
    sanitizeResources: false,
    fn: () =>
      withFixtureRoot(async (root) => {
        const checked: string[] = [];
        const result = await recordingTool(checked).main([
          "--root",
          root,
          ...flags,
        ]);

        assert.assert(primitives.results.isOk(result));
        assert.assertEquals([...checked].sort(), [...expected]);
      }),
  });
}

Deno.test({
  name: "createFileTool main: rejects an --exclude with no pattern",
  fn: () =>
    withFixtureRoot(async (root) => {
      const checked: string[] = [];
      const result = await recordingTool(checked).main([
        "--root",
        root,
        "--exclude",
        "skip-a",
        "--exclude",
      ]);

      assert.assert(primitives.results.isFail(result));
      assert.assertEquals(result.error.exitCode, 1);
      assert.assertEquals(checked, []);
    }),
});
