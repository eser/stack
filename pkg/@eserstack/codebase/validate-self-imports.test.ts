// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for validate-self-imports.
 *
 * Fixtures mirror the workspace layout (`pkg/@eserstack/<name>/...`) because
 * the tool derives the package's own name from the path.
 *
 * @module
 */

import * as assert from "@std/assert";
import * as path from "@std/path";
import { runtime } from "@eserstack/standards/cross-runtime";
import { tool } from "./validate-self-imports.ts";

const HEADER =
  "// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.\n";

const makeWorkspace = async (): Promise<string> => {
  const root = await runtime.fs.makeTempDir({
    prefix: "validate-self-imports-test-",
  });
  await runtime.fs.mkdir(path.join(root, "pkg/@eserstack/shell/tui"), {
    recursive: true,
  });

  return root;
};

const writeShellFile = async (
  root: string,
  name: string,
  body: string,
): Promise<void> => {
  await runtime.fs.writeTextFile(
    path.join(root, "pkg/@eserstack/shell", name),
    HEADER + body,
  );
};

// sanitizeResources: false — file-tool.ts transitively loads the FFI DynamicLibrary
Deno.test({
  name: "validate-self-imports: flags a package importing itself by name",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const root = await makeWorkspace();
    try {
      await writeShellFile(
        root,
        "tui/types.ts",
        [
          'import * as streams from "@eserstack/streams";',
          'import type { Audience } from "@eserstack/shell/env";',
          "import {",
          "  detectShell,",
          '} from "@eserstack/shell";',
          'const lazy = () => import("@eserstack/shell/exec");',
          "export { lazy };",
          "",
        ].join("\n"),
      );

      const result = await tool.run({ root });

      assert.assertEquals(result.issues.length, 3);
      assert.assertEquals(
        result.issues.map((issue) => issue.line),
        [3, 6, 7],
      );
      assert.assertStringIncludes(
        result.issues[0]!.message,
        '"@eserstack/shell/env"',
      );
    } finally {
      await runtime.fs.remove(root, { recursive: true });
    }
  },
});

Deno.test({
  name:
    "validate-self-imports: relative, sibling-package and documented imports pass",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const root = await makeWorkspace();
    try {
      await writeShellFile(
        root,
        "tui/types.ts",
        [
          "/**",
          " * Usage:",
          " * ```ts",
          ' * import { detectShell } from "@eserstack/shell/env";',
          " * ```",
          " */",
          'import type { Audience } from "../env/mod.ts";',
          'import * as streams from "@eserstack/streams";',
          'import * as shellArgs from "@eserstack/shell-args";',
          '// import * as env from "@eserstack/shell/env";',
          "export type { Audience };",
          "",
        ].join("\n"),
      );

      const result = await tool.run({ root });

      assert.assertEquals(result.issues, []);
    } finally {
      await runtime.fs.remove(root, { recursive: true });
    }
  },
});

Deno.test({
  name: "validate-self-imports: files outside pkg/@eserstack are ignored",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    const root = await runtime.fs.makeTempDir({
      prefix: "validate-self-imports-test-",
    });
    try {
      await runtime.fs.mkdir(path.join(root, "etc/scripts"), {
        recursive: true,
      });
      await runtime.fs.writeTextFile(
        path.join(root, "etc/scripts/tool.ts"),
        HEADER +
          'import * as env from "@eserstack/shell/env";\nexport { env };\n',
      );

      const result = await tool.run({ root });

      assert.assertEquals(result.issues, []);
    } finally {
      await runtime.fs.remove(root, { recursive: true });
    }
  },
});
