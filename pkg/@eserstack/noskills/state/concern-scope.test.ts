// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

// One test replaces console.error to capture the warning persistence writes.
/* oxlint-disable no-console */

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as concernScope from "./concern-scope.ts";
import * as persistence from "./persistence.ts";
import type * as schema from "./schema.ts";
import * as defaultConcerns from "../defaults/concerns/mod.ts";
import * as defaultPacks from "../defaults/packs/mod.ts";

const noFlags: schema.SpecClassification = {
  involvesWebUI: false,
  involvesCLI: false,
  involvesPublicAPI: false,
  involvesMigration: false,
  involvesDataHandling: false,
};

bdd.describe("scopeMatchesClassification", () => {
  const cases: {
    name: string;
    scope: readonly schema.ConcernScope[];
    classification: schema.SpecClassification;
    expected: boolean;
  }[] = [
    {
      name: "an empty scope matches every spec",
      scope: [],
      classification: noFlags,
      expected: true,
    },
    {
      name: "ui matches involvesWebUI",
      scope: ["ui"],
      classification: { ...noFlags, involvesWebUI: true },
      expected: true,
    },
    {
      name: "api matches involvesPublicAPI",
      scope: ["api"],
      classification: { ...noFlags, involvesPublicAPI: true },
      expected: true,
    },
    {
      name: "data matches involvesDataHandling",
      scope: ["data"],
      classification: { ...noFlags, involvesDataHandling: true },
      expected: true,
    },
    {
      name: "migration matches involvesMigration",
      scope: ["migration"],
      classification: { ...noFlags, involvesMigration: true },
      expected: true,
    },
    {
      name: "one matching value is enough",
      scope: ["ui", "api"],
      classification: { ...noFlags, involvesPublicAPI: true },
      expected: true,
    },
    {
      name: "no value matches a CLI-only spec",
      scope: ["ui", "api", "data", "migration"],
      classification: { ...noFlags, involvesCLI: true },
      expected: false,
    },
  ];

  for (const { name, scope, classification, expected } of cases) {
    bdd.it(name, () => {
      assert.assertEquals(
        concernScope.scopeMatchesClassification(scope, classification),
        expected,
      );
    });
  }
});

bdd.describe("scopeMatchesFile", () => {
  const uiSpec = { ...noFlags, involvesWebUI: true };
  const cases: {
    name: string;
    scope: readonly schema.ConcernScope[];
    filePath: string;
    classification: schema.SpecClassification | null;
    expected: boolean;
  }[] = [
    {
      name: "an empty scope matches no file",
      scope: [],
      filePath: "src/app.tsx",
      classification: null,
      expected: false,
    },
    {
      name: "ui covers a UI file in a UI spec",
      scope: ["ui"],
      filePath: "src/app.tsx",
      classification: uiSpec,
      expected: true,
    },
    {
      name: "ui covers a Windows path to a UI file",
      scope: ["ui"],
      filePath: "src\\styles\\main.css",
      classification: uiSpec,
      expected: true,
    },
    {
      name: "ui does not cover a source file",
      scope: ["ui"],
      filePath: "src/server.ts",
      classification: uiSpec,
      expected: false,
    },
    {
      name: "ui does not cover a UI file in a spec without UI",
      scope: ["ui"],
      filePath: "src/app.tsx",
      classification: noFlags,
      expected: false,
    },
    {
      name: "a dot in a directory name is not an extension",
      scope: ["api"],
      filePath: "pkg/v1.ts/Makefile",
      classification: null,
      expected: false,
    },
    {
      name: "data covers any file in a data spec",
      scope: ["data"],
      filePath: "README.md",
      classification: { ...noFlags, involvesDataHandling: true },
      expected: true,
    },
    {
      name: "an unclassified spec matches every value",
      scope: ["api"],
      filePath: "main.go",
      classification: null,
      expected: true,
    },
  ];

  for (const { name, scope, filePath, classification, expected } of cases) {
    bdd.it(name, () => {
      assert.assertEquals(
        concernScope.scopeMatchesFile(scope, filePath, classification),
        expected,
      );
    });
  }
});

bdd.describe("sectionMatchesClassification", () => {
  const cliSpec = { ...noFlags, involvesCLI: true };

  bdd.it("needs both the scope and the legacy condition to hold", () => {
    const section = { scope: ["ui"] as const, condition: "involvesCLI" };

    assert.assertEquals(
      concernScope.sectionMatchesClassification(section, {
        ...cliSpec,
        involvesWebUI: true,
      }),
      true,
    );
    assert.assertEquals(
      concernScope.sectionMatchesClassification(section, cliSpec),
      false,
    );
  });

  bdd.it("never matches a condition that names no flag", () => {
    assert.assertEquals(
      concernScope.sectionMatchesClassification(
        { scope: [], condition: "involvesEverything" },
        cliSpec,
      ),
      false,
    );
  });

  bdd.it("treats a section with neither as unconditional", () => {
    assert.assertEquals(
      concernScope.isConditionalSection({ scope: [], condition: null }),
      false,
    );
  });
});

bdd.describe("concernScopeProblem", () => {
  const base = {
    id: "custom",
    name: "Custom",
    description: "A project concern",
    extras: [],
    specSections: [],
    reminders: [],
    acceptanceCriteria: [],
  };

  bdd.it("accepts plain reminders, scoped ones and sections", () => {
    assert.assertEquals(
      concernScope.concernScopeProblem({
        ...base,
        reminders: [
          "Plain",
          { text: "Scoped", scope: ["ui", "data"] },
          {
            text: "No scope",
          },
        ],
        specSections: [
          "Legacy title",
          {
            id: "s",
            title: "S",
            placeholder: "_s_",
            scope: ["migration"],
            position: "after:tasks",
          },
        ],
      }),
      null,
    );
  });

  bdd.it("names the concern shape when it is not an object", () => {
    assert.assertEquals(
      concernScope.concernScopeProblem(["not", "a", "concern"]),
      "the concern must be a JSON object",
    );
  });

  bdd.it("names the entry and the allowed values", () => {
    assert.assertEquals(
      concernScope.concernScopeProblem({
        ...base,
        reminders: ["Plain", { text: "Scoped", scope: ["ui", "frontend"] }],
      }),
      'reminders[1].scope has "frontend"; expected a list of ui, api, data, migration',
    );
  });

  bdd.it("finds no problem in the built-in concerns and packs", () => {
    const packConcerns = [...defaultPacks.BUILTIN_PACKS.values()].flatMap(
      (pack) => pack.concernContents,
    );

    for (const concern of [
      ...defaultConcerns.DEFAULT_CONCERNS,
      ...packConcerns,
    ]) {
      assert.assertEquals(
        concernScope.concernScopeProblem(concern),
        null,
        concern.id,
      );
    }
  });
});

bdd.describe("listConcerns: declared scopes", () => {
  let tempDir: string;

  bdd.beforeEach(async () => {
    tempDir = await crossRuntime.runtime.fs.makeTempDir({
      prefix: "nos_list_concern_scope_",
    });
  });

  bdd.afterEach(async () => {
    await crossRuntime.runtime.fs.remove(tempDir, { recursive: true });
  });

  bdd.it("skips a concern with an unknown scope and says why", async () => {
    const dir = `${tempDir}/${persistence.paths.concernsDir}`;
    await crossRuntime.runtime.fs.mkdir(dir, { recursive: true });

    const concern = (id: string, reminders: readonly unknown[]) =>
      JSON.stringify({
        id,
        name: id,
        description: id,
        extras: [],
        specSections: [],
        reminders,
        acceptanceCriteria: [],
      });
    await crossRuntime.runtime.fs.writeTextFile(
      `${dir}/broken.json`,
      concern("broken", [{ text: "Check it", scope: ["UI"] }]),
    );
    await crossRuntime.runtime.fs.writeTextFile(
      `${dir}/fine.json`,
      concern("fine", ["Plain", { text: "Scoped", scope: ["ui"] }]),
    );

    const warnings: string[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]): void => {
      warnings.push(args.map(String).join(" "));
    };

    try {
      const listed = await persistence.listConcerns(tempDir);

      assert.assertEquals(
        listed.map((c) => c.id),
        ["fine"],
      );
      assert.assert(
        warnings.some(
          (line) =>
            line.includes("broken.json") &&
            line.includes('reminders[0].scope has "UI"'),
        ),
        `expected a scope warning, got: ${JSON.stringify(warnings)}`,
      );
    } finally {
      console.error = originalError;
    }
  });
});
