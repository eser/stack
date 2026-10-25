// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as fsPromises from "node:fs/promises"; // symlinks are not available in runtime
import * as nodeTest from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as plugin from "./plugin.ts";

/** Link linkPath to target, creating the parent directories of linkPath. */
async function linkDir(target: string, linkPath: string): Promise<void> {
  await fsPromises.mkdir(runtime.path.dirname(linkPath), { recursive: true });
  await fsPromises.symlink(target, linkPath, "dir");
}

nodeTest.test(
  "the Tailwind plugin compiles the utilities that source files use, at any depth",
  async () => {
    const projectRoot = await runtime.fs.makeTempDir({ prefix: "laroux-tw-" });
    try {
      const files = {
        // One source file directly under src/, one nested, one that is not a
        // source file
        "src/main.ts": 'export const root = "underline";\n',
        "src/app/routes/home/page.tsx":
          'export function HomePage() {\n  return <main className="flex" />;\n}\n',
        "src/app/notes.md": "The italic class is only mentioned here.\n",
      };
      await Promise.all(
        Object.entries(files).map(async ([file, content]) => {
          const filePath = runtime.path.join(projectRoot, file);
          await runtime.fs.ensureDir(runtime.path.dirname(filePath));
          await runtime.fs.writeTextFile(filePath, content);
        }),
      );
      // The stylesheet's @import resolves from the app's node_modules
      await linkDir(
        runtime.path.resolve(
          import.meta.dirname ?? ".",
          "../../node_modules/tailwindcss",
        ),
        runtime.path.join(projectRoot, "node_modules", "tailwindcss"),
      );
      const tailwind = plugin.createTailwindPlugin();

      const css = await tailwind.compile?.(
        '@import "tailwindcss/utilities";\n',
        {
          projectRoot,
          cssPath: runtime.path.join(projectRoot, "src/app/styles/global.css"),
          isModule: false,
        },
      );

      assert.assertExists(css);
      assert.assertMatch(css, /\.flex\s*\{\s*display:\s*flex/);
      assert.assertMatch(css, /\.underline\s*\{/);
      assert.assertEquals(/\.italic\s*\{/.test(css), false);
    } finally {
      await runtime.fs.remove(projectRoot, { recursive: true });
    }
  },
);
