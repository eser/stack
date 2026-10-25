// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as assert from "@eserstack/test-kit/assert";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as rscAnalyze from "./rsc-analyze.ts";

Deno.test("getAllComponents lists the script files at any depth, without tests and other files", async () => {
  const srcDir = await runtime.fs.makeTempDir({ prefix: "laroux-analyze-" });
  try {
    const files = [
      "main.ts",
      "app/layout.tsx",
      "app/routes/home/page.tsx",
      "app/routes/api/hello/route.ts",
      "app/legacy/widget.jsx",
      "app/legacy/helpers.js",
      "app/routes/home/page.test.tsx",
      "app/routes/home/page.module.css",
      "app/notes.md",
    ];
    await Promise.all(files.map(async (file) => {
      const filePath = runtime.path.join(srcDir, file);
      await runtime.fs.ensureDir(runtime.path.dirname(filePath));
      await runtime.fs.writeTextFile(filePath, "\n");
    }));

    const components = await rscAnalyze.getAllComponents(srcDir);

    assert.assertEquals(
      components.map((filePath) => runtime.path.relative(srcDir, filePath))
        .map((filePath) => filePath.replaceAll("\\", "/"))
        .toSorted(),
      [
        "app/layout.tsx",
        "app/legacy/helpers.js",
        "app/legacy/widget.jsx",
        "app/routes/api/hello/route.ts",
        "app/routes/home/page.tsx",
        "main.ts",
      ],
    );
  } finally {
    await runtime.fs.remove(srcDir, { recursive: true });
  }
});
