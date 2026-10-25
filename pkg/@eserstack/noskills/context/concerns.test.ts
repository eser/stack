// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import type * as schema from "../state/schema.ts";
import * as concerns from "./concerns.ts";
import * as defaultConcerns from "../defaults/concerns/mod.ts";

// =============================================================================
// Helpers
// =============================================================================

const allConcerns = defaultConcerns.DEFAULT_CONCERNS;

const openSource = allConcerns.find((c) => c.id === "open-source")!;
const beautiful = allConcerns.find((c) => c.id === "beautiful-product")!;
const moveFast = allConcerns.find((c) => c.id === "move-fast")!;
const compliance = allConcerns.find((c) => c.id === "compliance")!;
const longLived = allConcerns.find((c) => c.id === "long-lived")!;

// =============================================================================
// getConcernExtras
// =============================================================================

bdd.describe("getConcernExtras", () => {
  bdd.it("returns empty for no concerns", () => {
    const result = concerns.getConcernExtras([], "status_quo");

    assert.assertEquals(result.length, 0);
  });

  bdd.it("returns matching extras for given questionId", () => {
    const result = concerns.getConcernExtras([openSource], "status_quo");

    assert.assertEquals(result.length, 1);
    assert.assertEquals(
      result[0]?.text,
      "Is this workaround common in the community?",
    );
  });

  bdd.it("ignores extras for non-matching questionIds", () => {
    const result = concerns.getConcernExtras([openSource], "reversibility");

    assert.assertEquals(result.length, 0);
  });
});

// =============================================================================
// getReminders
// =============================================================================

bdd.describe("getReminders", () => {
  bdd.it("prefixes each reminder with concern id", () => {
    const result = concerns.getReminders([openSource]);

    for (const reminder of result) {
      assert.assertEquals(reminder.startsWith("open-source: "), true);
    }
  });

  bdd.it("flattens reminders across multiple concerns", () => {
    const result = concerns.getReminders([openSource, moveFast]);

    const osCount = result.filter((r) => r.startsWith("open-source:")).length;
    const mfCount = result.filter((r) => r.startsWith("move-fast:")).length;

    assert.assertEquals(osCount, openSource.reminders.length);
    assert.assertEquals(mfCount, moveFast.reminders.length);
    assert.assertEquals(result.length, osCount + mfCount);
  });
});

// =============================================================================
// detectTensions
// =============================================================================

bdd.describe("detectTensions", () => {
  bdd.it("returns empty when no conflicting concerns active", () => {
    const result = concerns.detectTensions([openSource, longLived]);

    assert.assertEquals(result.length, 0);
  });

  bdd.it("detects move-fast + compliance tension", () => {
    const result = concerns.detectTensions([moveFast, compliance]);

    assert.assertEquals(result.length, 1);
    assert.assertEquals(result[0]?.between.includes("move-fast"), true);
    assert.assertEquals(result[0]?.between.includes("compliance"), true);
  });

  bdd.it("detects move-fast + long-lived tension", () => {
    const result = concerns.detectTensions([moveFast, longLived]);

    assert.assertEquals(result.length, 1);
    assert.assertEquals(result[0]?.between.includes("long-lived"), true);
  });

  bdd.it("detects beautiful-product + move-fast tension", () => {
    const result = concerns.detectTensions([beautiful, moveFast]);

    assert.assertEquals(result.length, 1);
    assert.assertEquals(result[0]?.between.includes("beautiful-product"), true);
  });

  bdd.it(
    "returns multiple tensions when 3+ conflicting concerns active",
    () => {
      const result = concerns.detectTensions([
        moveFast,
        compliance,
        longLived,
        beautiful,
      ]);

      // move-fast conflicts with: compliance, long-lived, beautiful-product
      assert.assertEquals(result.length, 3);
    },
  );

  bdd.it("detects well-engineered vs move-fast tension", () => {
    const wellEngineered = allConcerns.find((c) => c.id === "well-engineered")!;
    const result = concerns.detectTensions([wellEngineered, moveFast]);

    assert.assertEquals(result.length, 1);
    assert.assertEquals(result[0]?.between.includes("well-engineered"), true);
    assert.assertEquals(result[0]?.between.includes("move-fast"), true);
  });
});

// =============================================================================
// getReviewDimensions
// =============================================================================

bdd.describe("getReviewDimensions", () => {
  bdd.it("collects dimensions from all active concerns", () => {
    const result = concerns.getReviewDimensions([longLived, beautiful]);

    // long-lived has 7 dimensions, beautiful-product has 7
    assert.assertEquals(result.length >= 10, true);
    assert.assertEquals(result.some((d) => d.concernId === "long-lived"), true);
    assert.assertEquals(
      result.some((d) => d.concernId === "beautiful-product"),
      true,
    );
  });

  bdd.it("returns empty for concerns without dimensions", () => {
    const result = concerns.getReviewDimensions([moveFast]);

    // move-fast has scope-knife, lake-check, feedback-loop
    assert.assertEquals(result.length, 3);
  });

  bdd.it("filters UI-scoped dimensions when classification excludes UI", () => {
    const result = concerns.getReviewDimensions([beautiful], {
      involvesWebUI: false,
      involvesCLI: false,
      involvesPublicAPI: false,
      involvesMigration: false,
      involvesDataHandling: false,
    });

    // beautiful-product dimensions are all scope: "ui" — should be filtered out
    assert.assertEquals(result.length, 0);
  });

  bdd.it("includes all dimensions when classification is null", () => {
    const result = concerns.getReviewDimensions([beautiful], null);

    // null classification = include all (safe default for pre-classification phases)
    assert.assertEquals(result.length >= 5, true);
  });
});

// =============================================================================
// getRegistryDimensionIds
// =============================================================================

bdd.describe("getRegistryDimensionIds", () => {
  bdd.it("collects registry IDs from concerns", () => {
    const result = concerns.getRegistryDimensionIds([longLived]);

    // long-lived has registries: ["error-rescue", "failure-modes"]
    assert.assertEquals(result.includes("error-rescue"), true);
    assert.assertEquals(result.includes("failure-modes"), true);
  });

  bdd.it("deduplicates across concerns", () => {
    const mockConcern = {
      ...longLived,
      id: "test-dup",
      registries: ["error-rescue"],
    };
    const result = concerns.getRegistryDimensionIds([
      longLived,
      mockConcern as unknown as typeof longLived,
    ]);

    const errorRescueCount = result.filter((id) => id === "error-rescue")
      .length;
    assert.assertEquals(errorRescueCount, 1);
  });

  bdd.it("returns empty for concerns without registries", () => {
    const result = concerns.getRegistryDimensionIds([moveFast, beautiful]);

    assert.assertEquals(result.length, 0);
  });
});

// =============================================================================
// getDreamStatePrompts
// =============================================================================

bdd.describe("getDreamStatePrompts", () => {
  bdd.it("collects dream state prompts from concerns", () => {
    const result = concerns.getDreamStatePrompts([longLived]);

    // long-lived has dreamStatePrompt
    assert.assertEquals(result.length, 1);
    assert.assertEquals(result[0]?.includes("CURRENT STATE"), true);
  });

  bdd.it("returns empty for concerns without dream state", () => {
    const result = concerns.getDreamStatePrompts([moveFast, compliance]);

    assert.assertEquals(result.length, 0);
  });
});

// =============================================================================
// loadConcerns — promptFile resolution
// =============================================================================

bdd.describe("loadConcerns — promptFile", () => {
  let tempDir: string;

  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "nos_concerns_",
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  const writeJson = async (path: string, data: unknown): Promise<void> => {
    await crossRuntime.runtime.fs.writeTextFile(path, JSON.stringify(data));
  };

  bdd.it(
    "appends promptFile content to reminders when file exists",
    async () => {
      const extraContent = "Extra rule from markdown companion file.";
      const concernJson = {
        id: "test-concern",
        name: "Test",
        description: "Test concern",
        extras: [],
        specSections: [],
        reminders: ["Inline reminder"],
        acceptanceCriteria: [],
        promptFile: "companion.md",
      };

      await writeJson(`${tempDir}/100-test-concern.json`, concernJson);
      await crossRuntime.runtime.fs.writeTextFile(
        `${tempDir}/companion.md`,
        extraContent,
      );

      const loaded = await concerns.loadConcerns(tempDir);

      assert.assertEquals(loaded.length, 1);
      assert.assertEquals(loaded[0]!.reminders.length, 2);
      assert.assertEquals(loaded[0]!.reminders[0], "Inline reminder");
      assert.assertEquals(loaded[0]!.reminders[1], extraContent);
    },
  );

  bdd.it("throws a clear error when promptFile is missing", async () => {
    const concernJson = {
      id: "test-concern",
      name: "Test",
      description: "Test concern",
      extras: [],
      specSections: [],
      reminders: [],
      acceptanceCriteria: [],
      promptFile: "missing.md",
    };

    await writeJson(`${tempDir}/100-test-concern.json`, concernJson);

    await assert.assertRejects(
      () => concerns.loadConcerns(tempDir),
      Error,
      "promptFile not found",
    );
  });

  bdd.it("skips promptFile field when it is not set", async () => {
    const concernJson = {
      id: "test-concern",
      name: "Test",
      description: "Test concern",
      extras: [],
      specSections: [],
      reminders: ["Only this"],
      acceptanceCriteria: [],
    };

    await writeJson(`${tempDir}/100-test-concern.json`, concernJson);

    const loaded = await concerns.loadConcerns(tempDir);

    assert.assertEquals(loaded[0]!.reminders.length, 1);
    assert.assertEquals(loaded[0]!.reminders[0], "Only this");
  });

  bdd.it(
    "ignores empty promptFile content (no extra reminder added)",
    async () => {
      const concernJson = {
        id: "test-concern",
        name: "Test",
        description: "Test concern",
        extras: [],
        specSections: [],
        reminders: ["Inline"],
        acceptanceCriteria: [],
        promptFile: "empty.md",
      };

      await writeJson(`${tempDir}/100-test-concern.json`, concernJson);
      // Write a file with only whitespace
      await crossRuntime.runtime.fs.writeTextFile(
        `${tempDir}/empty.md`,
        "   \n",
      );

      const loaded = await concerns.loadConcerns(tempDir);

      // Whitespace-only content → not appended
      assert.assertEquals(loaded[0]!.reminders.length, 1);
    },
  );
});

// =============================================================================
// SpecSectionDefinition object shape
// =============================================================================

bdd.describe("loadConcerns with SpecSectionDefinition object shape", () => {
  let tempDir: string;

  const writeJson = (path: string, data: unknown) =>
    crossRuntime.runtime.fs.writeTextFile(path, JSON.stringify(data));

  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "concerns_section_def_",
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it(
    "loads concern with SpecSectionDefinition specSections correctly",
    async () => {
      const concernJson = {
        id: "test-concern",
        name: "Test",
        description: "Test concern",
        extras: [],
        specSections: [
          {
            id: "my-section",
            title: "My Section",
            placeholder: "_placeholder_",
            condition: null,
            position: "after:acceptance-criteria",
          },
        ],
        reminders: [],
        acceptanceCriteria: ["One criterion"],
      };

      await writeJson(`${tempDir}/100-test-concern.json`, concernJson);
      const loaded = await concerns.loadConcerns(tempDir);

      assert.assertEquals(loaded.length, 1);
      const sec = loaded[0]!.specSections[0];
      assert.assertEquals(typeof sec, "object");
      // Type narrowing: the object shape has an `id` property
      assert.assertEquals(typeof (sec as { id: string }).id, "string");
      assert.assertEquals((sec as { id: string }).id, "my-section");
      assert.assertEquals((sec as { title: string }).title, "My Section");
      assert.assertEquals((sec as { condition: null }).condition, null);
    },
  );

  bdd.it(
    "loads concern with legacy string specSections (backward compat)",
    async () => {
      const concernJson = {
        id: "legacy-concern",
        name: "Legacy",
        description: "Legacy format",
        extras: [],
        specSections: ["Legacy Section One", "Legacy Section Two"],
        reminders: [],
        acceptanceCriteria: ["ok"],
      };

      await writeJson(`${tempDir}/200-legacy-concern.json`, concernJson);
      const loaded = await concerns.loadConcerns(tempDir);

      assert.assertEquals(loaded.length, 1);
      assert.assertEquals(loaded[0]!.specSections.length, 2);
      // The strings are preserved as-is in the loaded concern; living.ts normalizes them
      assert.assertEquals(loaded[0]!.specSections[0], "Legacy Section One");
    },
  );

  bdd.it("loads concern with conductRules correctly", async () => {
    const concernJson = {
      id: "conduct-concern",
      name: "Conduct",
      description: "Has per-phase rules",
      extras: [],
      specSections: [],
      reminders: [],
      acceptanceCriteria: ["ok"],
      conductRules: {
        DISCOVERY: [
          "Ask about failure modes first.",
          "Ask about recovery paths next.",
        ],
      },
    };

    await writeJson(`${tempDir}/300-conduct-concern.json`, concernJson);
    const loaded = await concerns.loadConcerns(tempDir);

    assert.assertEquals(loaded.length, 1);
    const rules = loaded[0]!.conductRules?.["DISCOVERY"] ?? [];
    assert.assertEquals(rules.length, 2);
    assert.assertEquals(rules[0], "Ask about failure modes first.");
  });
});

// =============================================================================
// Declared scopes: custom concerns with and without a scope
// =============================================================================

const noFlags: schema.SpecClassification = {
  involvesWebUI: false,
  involvesCLI: false,
  involvesPublicAPI: false,
  involvesMigration: false,
  involvesDataHandling: false,
};
const uiSpec: schema.SpecClassification = { ...noFlags, involvesWebUI: true };
const apiSpec: schema.SpecClassification = {
  ...noFlags,
  involvesPublicAPI: true,
};
const migrationSpec: schema.SpecClassification = {
  ...noFlags,
  involvesMigration: true,
};
// A CLI-only spec has none of the flags a scope names.
const otherSpec: schema.SpecClassification = { ...noFlags, involvesCLI: true };

const PLAIN =
  "custom: Plain: the migration, the loading state and the API docs";
const UI = "custom: UI: design every state";
const API = "custom: API: document every endpoint";
const MIGRATION = "custom: Migration: write a rollback for each schema change";
const EITHER = "custom: Either: name things for the reader";

// The plain reminder holds the words the old keyword filter matched; without
// a scope it still applies to every spec.
const scopedConcern: schema.ConcernDefinition = {
  id: "custom",
  name: "Custom",
  description: "A project concern with scoped and plain reminders",
  extras: [],
  specSections: [],
  reminders: [
    "Plain: the migration, the loading state and the API docs",
    { text: "UI: design every state", scope: ["ui"] },
    { text: "API: document every endpoint", scope: ["api"] },
    {
      text: "Migration: write a rollback for each schema change",
      scope: ["migration"],
    },
    { text: "Either: name things for the reader", scope: ["ui", "api"] },
  ],
  acceptanceCriteria: [],
};

// Reminders written with the old keywords and no scope: none is UI-, API- or
// file-specific any more.
const unscopedConcern: schema.ConcernDefinition = {
  id: "legacy",
  name: "Legacy",
  description: "A project concern written before scopes existed",
  extras: [],
  specSections: [],
  reminders: [
    "No AI slop: every UI element is intentional",
    "Endpoint should be documented in API docs",
    "Plan the migration and its rollback",
  ],
  acceptanceCriteria: [],
};
const LEGACY = unscopedConcern.reminders.map((r) => `legacy: ${r as string}`);

bdd.describe("getReminders: declared scopes", () => {
  const cases = [
    {
      name: "keeps every reminder before the spec is classified",
      classification: null,
      expected: [PLAIN, UI, API, MIGRATION, EITHER],
    },
    {
      name: "keeps UI-scoped reminders for a UI spec",
      classification: uiSpec,
      expected: [PLAIN, UI, EITHER],
    },
    {
      name: "keeps API-scoped reminders for an API spec",
      classification: apiSpec,
      expected: [PLAIN, API, EITHER],
    },
    {
      name: "keeps migration-scoped reminders for a migration spec",
      classification: migrationSpec,
      expected: [PLAIN, MIGRATION],
    },
    {
      name: "keeps only unscoped reminders for another spec",
      classification: otherSpec,
      expected: [PLAIN],
    },
  ];

  for (const { name, classification, expected } of cases) {
    bdd.it(name, () => {
      assert.assertEquals(
        concerns.getReminders([scopedConcern], classification),
        expected,
      );
    });
  }

  bdd.it("keeps every unscoped reminder for every spec", () => {
    for (const classification of [uiSpec, apiSpec, otherSpec, null]) {
      assert.assertEquals(
        concerns.getReminders([unscopedConcern], classification),
        LEGACY,
      );
    }
  });
});

bdd.describe("splitRemindersByTier: declared scopes", () => {
  bdd.it("puts unscoped reminders in tier1 and scoped ones in tier2", () => {
    const split = concerns.splitRemindersByTier([
      scopedConcern,
      unscopedConcern,
    ]);

    assert.assertEquals(split.tier1, [PLAIN, ...LEGACY]);
    assert.assertEquals(split.tier2, [UI, API, MIGRATION, EITHER]);
  });

  bdd.it("keeps only the tier2 reminders the classification matches", () => {
    const split = concerns.splitRemindersByTier([scopedConcern], uiSpec);

    assert.assertEquals(split.tier1, [PLAIN]);
    assert.assertEquals(split.tier2, [UI, EITHER]);
  });
});

// TASK-323: a concern file without reminders used to throw here, and the hook
// caught it and dropped every rule of the edited file, scoped and folder rules
// included.
bdd.it("getTier2RemindersForFile skips a concern without reminders", () => {
  const withoutReminders = {
    id: "bare",
    name: "Bare",
    description: "",
    extras: [],
    specSections: [],
  } as unknown as schema.ConcernDefinition;

  assert.assertEquals(
    concerns.getTier2RemindersForFile([withoutReminders], "src/a.ts", null),
    [],
  );
});

bdd.describe("getTier2RemindersForFile: declared scopes", () => {
  const cases = [
    {
      name: "UI spec, UI file",
      classification: uiSpec,
      filePath: "src/app/page.tsx",
      expected: [UI, EITHER],
    },
    {
      name: "UI spec, source file",
      classification: uiSpec,
      filePath: "src/server/routes.ts",
      expected: [],
    },
    {
      name: "API spec, source file",
      classification: apiSpec,
      filePath: "pkg/server/routes.go",
      expected: [API, EITHER],
    },
    {
      name: "API spec, UI file",
      classification: apiSpec,
      filePath: "src/app/page.tsx",
      expected: [],
    },
    {
      name: "migration spec, any file",
      classification: migrationSpec,
      filePath: "db/001_init.sql",
      expected: [MIGRATION],
    },
    {
      name: "other spec, UI file",
      classification: otherSpec,
      filePath: "src/app/page.tsx",
      expected: [],
    },
    {
      name: "other spec, source file",
      classification: otherSpec,
      filePath: "src/cli.ts",
      expected: [],
    },
    {
      name: "unclassified spec, UI file",
      classification: null,
      filePath: "src/app/page.tsx",
      expected: [UI, MIGRATION, EITHER],
    },
    {
      name: "unclassified spec, file of no listed type",
      classification: null,
      filePath: "README.md",
      expected: [MIGRATION],
    },
  ];

  for (const { name, classification, filePath, expected } of cases) {
    bdd.it(name, () => {
      assert.assertEquals(
        concerns.getTier2RemindersForFile(
          [scopedConcern, unscopedConcern],
          filePath,
          classification,
        ),
        expected,
      );
    });
  }
});

bdd.describe("getReviewDimensions: migration scope", () => {
  const dimension = (
    id: string,
    scope: schema.ReviewDimensionScope,
  ): schema.ReviewDimension => ({
    id,
    label: id,
    prompt: "Check it.",
    evidenceRequired: false,
    scope,
  });
  const withDimensions: schema.ConcernDefinition = {
    ...unscopedConcern,
    reviewDimensions: [
      dimension("everywhere", "all"),
      dimension("schema-change", "migration"),
    ],
  };

  bdd.it("keeps a migration dimension for a migration spec only", () => {
    const ids = (classification: schema.SpecClassification) =>
      concerns.getReviewDimensions([withDimensions], classification).map((
        d,
      ) => d.id);

    assert.assertEquals(ids(migrationSpec), ["everywhere", "schema-change"]);
    assert.assertEquals(ids(otherSpec), ["everywhere"]);
  });
});

bdd.describe("loadConcerns: declared scopes", () => {
  let tempDir: string;

  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "nos_concern_scope_",
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  const write = (data: unknown): Promise<void> =>
    crossRuntime.runtime.fs.writeTextFile(
      `${tempDir}/100-custom.json`,
      JSON.stringify(data),
    );

  bdd.it("loads plain and scoped reminders as written", async () => {
    await write(scopedConcern);

    const loaded = await concerns.loadConcerns(tempDir);

    assert.assertEquals(loaded[0]!.reminders, scopedConcern.reminders);
  });

  const invalid = [
    {
      name: "refuses a reminder scope value it does not know",
      reminders: [{ text: "Check it", scope: ["UI"] }],
      specSections: [],
      message: 'reminders[0].scope has "UI"',
    },
    {
      name: "refuses a reminder scope that is not a list",
      reminders: [{ text: "Check it", scope: "ui" }],
      specSections: [],
      message: 'reminders[0].scope is "ui"',
    },
    {
      name: "refuses a reminder object without text",
      reminders: [{ scope: ["ui"] }],
      specSections: [],
      message: 'reminders[0] must be a string or an object with a "text"',
    },
    {
      name: "refuses a spec section scope value it does not know",
      reminders: [],
      specSections: [{
        id: "cli-help",
        title: "CLI Help",
        placeholder: "_Describe the help text._",
        scope: ["cli"],
        position: "after:acceptance-criteria",
      }],
      message: 'specSections[0].scope has "cli"',
    },
  ];

  for (const { name, reminders, specSections, message } of invalid) {
    bdd.it(name, async () => {
      await write({ ...scopedConcern, reminders, specSections });

      await assert.assertRejects(
        () => concerns.loadConcerns(tempDir),
        Error,
        message,
      );
    });
  }
});
