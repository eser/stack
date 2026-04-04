// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assert, assertEquals } from "@std/assert";
import * as diagrams from "./diagrams.ts";
import * as persistence from "../state/persistence.ts";
import { runtime } from "@eser/standards/cross-runtime";

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

describe("diagram scanner", () => {
  it("finds mermaid blocks in markdown", async () => {
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
    assertEquals(entries.length, 1);
    assertEquals(entries[0]!.type, "mermaid");
    assertEquals(entries[0]!.file, "README.md");
    assert(entries[0]!.referencedFiles.includes("machine.ts"));
    assert(entries[0]!.referencedFiles.includes("compiler.ts"));
  });

  it("finds multiple mermaid blocks", async () => {
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
    assertEquals(entries.length, 2);
  });

  it("extracts file references from diagrams", async () => {
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
    assertEquals(entries.length, 1);
    const refs = entries[0]!.referencedFiles;
    assert(refs.some((r) => r.includes("machine.ts")));
    assert(refs.some((r) => r.includes("compiler.ts")));
  });
});

// =============================================================================
// Registry
// =============================================================================

describe("diagram registry", () => {
  it("reads empty when no registry file", async () => {
    const root = await makeTempDir();
    const registry = await diagrams.readRegistry(root);
    assertEquals(registry.length, 0);
  });

  it("write and read round-trip", async () => {
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
    assertEquals(read.length, 1);
    assertEquals(read[0]!.file, "README.md");
    assertEquals(read[0]!.referencedFiles[0], "machine.ts");
  });
});

// =============================================================================
// Verify
// =============================================================================

describe("verifyDiagram", () => {
  it("updates lastVerified timestamp", async () => {
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
    assertEquals(verified, true);

    const registry = await diagrams.readRegistry(root);
    assert(registry[0]!.lastVerified > "2026-01-01");
  });

  it("returns false for unknown diagram", async () => {
    const root = await makeTempDir();
    await diagrams.writeRegistry(root, []);

    const verified = await diagrams.verifyDiagram(root, "nonexistent.md");
    assertEquals(verified, false);
  });
});

// =============================================================================
// Staleness check
// =============================================================================

describe("checkStaleness", () => {
  it("flags diagrams when referenced files change", async () => {
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
    assertEquals(stale.length, 1);
    assert(stale[0]!.reason.includes("machine.ts"));
  });

  it("returns empty when no referenced files changed", async () => {
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
    assertEquals(stale.length, 0);
  });

  it("handles partial path matches", async () => {
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
      "pkg/@eser/noskills/dashboard/state.ts",
    ]);
    assertEquals(stale.length, 1);
  });
});
