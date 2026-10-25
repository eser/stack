// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as diagrams from "./diagrams.ts";
import * as persistence from "../state/persistence.ts";
import { runtime } from "@eserstack/standards/cross-runtime";

// =============================================================================
// Helpers
// =============================================================================

let tempCounter = 0;
const makeTempDir = async (): Promise<string> => {
  const base = await runtime.fs.makeTempDir();
  const dir = `${base}/noskills-diagrams-test-${tempCounter++}`;
  await persistence.scaffoldEserDir(dir);
  return dir;
};

// =============================================================================
// Scanning
// =============================================================================

bdd.describe("diagram scanner", () => {
  bdd.it("finds mermaid blocks in markdown", async () => {
    const root = await makeTempDir();
    await runtime.fs.writeTextFile(
      `${root}/README.md`,
      `# Project

Some text.

\`\`\`mermaid
graph LR
  A[machine.ts] --> B[compiler.ts]
  B --> C[output.ts]
\`\`\`

More text.
`,
    );

    const entries = await diagrams.scanProject(root);
    assert.assertEquals(entries.length, 1);
    assert.assertEquals(entries[0]!.type, "mermaid");
    assert.assertEquals(entries[0]!.file, "README.md");
    assert.assert(entries[0]!.referencedFiles.includes("machine.ts"));
    assert.assert(entries[0]!.referencedFiles.includes("compiler.ts"));
  });

  bdd.it("finds multiple mermaid blocks", async () => {
    const root = await makeTempDir();
    await runtime.fs.writeTextFile(
      `${root}/docs.md`,
      `\`\`\`mermaid
graph TD
  A --> B
\`\`\`

text

\`\`\`mermaid
sequenceDiagram
  Client->>Server: request
\`\`\`
`,
    );

    const entries = await diagrams.scanProject(root);
    assert.assertEquals(entries.length, 2);
  });

  bdd.it("extracts file references from diagrams", async () => {
    const root = await makeTempDir();
    await runtime.fs.writeTextFile(
      `${root}/arch.md`,
      `\`\`\`mermaid
graph LR
  state/machine.ts --> context/compiler.ts
  dashboard/state.ts --> dashboard/events.ts
\`\`\`
`,
    );

    const entries = await diagrams.scanProject(root);
    assert.assertEquals(entries.length, 1);
    const refs = entries[0]!.referencedFiles;
    assert.assert(refs.some((r) => r.includes("machine.ts")));
    assert.assert(refs.some((r) => r.includes("compiler.ts")));
  });
});

// =============================================================================
// Registry
// =============================================================================

bdd.describe("diagram registry", () => {
  bdd.it("reads empty when no registry file", async () => {
    const root = await makeTempDir();
    const registry = await diagrams.readRegistry(root);
    assert.assertEquals(registry.length, 0);
  });

  bdd.it("write and read round-trip", async () => {
    const root = await makeTempDir();
    const entries: diagrams.DiagramEntry[] = [
      {
        file: "README.md",
        line: 10,
        type: "mermaid",
        hash: "abc",
        referencedFiles: ["machine.ts"],
        lastVerified: "2026-04-01",
      },
    ];

    await diagrams.writeRegistry(root, entries);
    const read = await diagrams.readRegistry(root);
    assert.assertEquals(read.length, 1);
    assert.assertEquals(read[0]!.file, "README.md");
    assert.assertEquals(read[0]!.referencedFiles[0], "machine.ts");
  });
});

// =============================================================================
// Verify
// =============================================================================

bdd.describe("verifyDiagram", () => {
  bdd.it("updates lastVerified timestamp", async () => {
    const root = await makeTempDir();
    await diagrams.writeRegistry(root, [
      {
        file: "README.md",
        line: 10,
        type: "mermaid",
        hash: "abc",
        referencedFiles: [],
        lastVerified: "2026-01-01",
      },
    ]);

    const verified = await diagrams.verifyDiagram(root, "README.md");
    assert.assertEquals(verified, true);

    const registry = await diagrams.readRegistry(root);
    assert.assert(registry[0]!.lastVerified > "2026-01-01");
  });

  bdd.it("returns false for unknown diagram", async () => {
    const root = await makeTempDir();
    await diagrams.writeRegistry(root, []);

    const verified = await diagrams.verifyDiagram(root, "nonexistent.md");
    assert.assertEquals(verified, false);
  });
});

// =============================================================================
// Staleness check
// =============================================================================

bdd.describe("checkStaleness", () => {
  bdd.it("flags diagrams when referenced files change", async () => {
    const root = await makeTempDir();
    await diagrams.writeRegistry(root, [
      {
        file: "README.md",
        line: 10,
        type: "mermaid",
        hash: "abc",
        referencedFiles: ["machine.ts", "compiler.ts"],
        lastVerified: "2026-01-01",
      },
    ]);

    const stale = await diagrams.checkStaleness(root, ["machine.ts"]);
    assert.assertEquals(stale.length, 1);
    assert.assert(stale[0]!.reason.includes("machine.ts"));
  });

  bdd.it("returns empty when no referenced files changed", async () => {
    const root = await makeTempDir();
    await diagrams.writeRegistry(root, [
      {
        file: "README.md",
        line: 10,
        type: "mermaid",
        hash: "abc",
        referencedFiles: ["machine.ts"],
        lastVerified: "2026-01-01",
      },
    ]);

    const stale = await diagrams.checkStaleness(root, ["other-file.ts"]);
    assert.assertEquals(stale.length, 0);
  });

  bdd.it("handles partial path matches", async () => {
    const root = await makeTempDir();
    await diagrams.writeRegistry(root, [
      {
        file: "docs/arch.md",
        line: 5,
        type: "mermaid",
        hash: "xyz",
        referencedFiles: ["dashboard/state.ts"],
        lastVerified: "2026-01-01",
      },
    ]);

    const stale = await diagrams.checkStaleness(root, [
      "pkg/@eserstack/noskills/dashboard/state.ts",
    ]);
    assert.assertEquals(stale.length, 1);
  });
});

// =============================================================================
// TASK-328: the scan and staleness bugs found while porting them to Go
// =============================================================================

bdd.describe("diagram scan and staleness (TASK-328)", () => {
  bdd.it(
    "reports a diagram once when it names several modified files",
    async () => {
      const root = await makeTempDir();
      await diagrams.writeRegistry(root, [
        {
          file: "README.md",
          line: 3,
          type: "mermaid",
          hash: "abc",
          referencedFiles: ["src/login.ts", "src/store.ts"],
          lastVerified: "2026-01-01",
        },
      ]);

      const stale = await diagrams.checkStaleness(root, [
        "src/login.ts",
        "src/store.ts",
      ]);

      assert.assertEquals(stale.length, 1);
      assert.assertEquals(
        stale[0]!.reason,
        "src/login.ts was modified but diagram references src/login.ts",
      );
    },
  );

  bdd.it("gives one entry for one box drawing", async () => {
    const root = await makeTempDir();
    await runtime.fs.writeTextFile(
      `${root}/arch.md`,
      "# Architecture\n\n" +
        "┌──────────┐    ┌──────────┐\n" +
        "│ main.go  │───▶│ store.go │\n" +
        "└──────────┘    └──────────┘\n" +
        "\n" +
        "┌────┐\n" +
        "│ db │\n" +
        "└────┘\n",
    );

    const entries = await diagrams.scanProject(root);

    assert.assertEquals(
      entries.map((e) => [e.type, e.line]),
      [
        ["ascii", 3],
        ["ascii", 7],
      ],
    );
  });

  bdd.it("does not take a file path's prefix as a module name", async () => {
    const root = await makeTempDir();
    await runtime.fs.writeTextFile(
      `${root}/README.md`,
      "```mermaid\ngraph TD\n  A[src/login.ts] --> B[dashboard/state]\n" +
        "  B --> C[pkg/@eserstack/noskills/main.ts]\n```\n",
    );

    const entries = await diagrams.scanProject(root);

    assert.assertEquals(entries.length, 1);
    assert.assertEquals(entries[0]!.referencedFiles, [
      "src/login.ts",
      "pkg/@eserstack/noskills/main.ts",
      "dashboard/state",
    ]);
  });

  bdd.it("writes the registry when .eser/ does not exist yet", async () => {
    const root = await runtime.fs.makeTempDir({ prefix: "nos_diagrams_" });
    try {
      await diagrams.writeRegistry(root, []);

      assert.assertEquals(
        await runtime.fs.readTextFile(`${root}/.eser/diagrams.json`),
        "[]\n",
      );
    } finally {
      await runtime.fs.remove(root, { recursive: true });
    }
  });
});
