// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import * as bdd from "@std/testing/bdd";
import * as assert from "@std/assert";
import * as template from "./template.ts";
import type * as schema from "../state/schema.ts";
import * as defaultConcerns from "../defaults/concerns/mod.ts";

// =============================================================================
// Helpers
// =============================================================================

const allConcerns = defaultConcerns.DEFAULT_CONCERNS;
const openSource = allConcerns.find((c) => c.id === "open-source")!;
const beautiful = allConcerns.find((c) => c.id === "beautiful-product")!;

const sampleAnswers: readonly schema.DiscoveryAnswer[] = [
  { questionId: "status_quo", answer: "Users manually upload files" },
  {
    questionId: "ambition",
    answer: "1-star: basic upload. 10-star: smart listing",
  },
  {
    questionId: "verification",
    answer: "Unit tests + e2e test of upload flow",
  },
];

const sampleDecisions: readonly schema.Decision[] = [
  {
    id: "d1",
    question: "Which storage backend?",
    choice: "S3",
    promoted: false,
    timestamp: "2026-03-27T10:00:00Z",
  },
  {
    id: "d2",
    question: "Auth method?",
    choice: "OAuth2",
    promoted: true,
    timestamp: "2026-03-27T10:05:00Z",
  },
];

// =============================================================================
// renderSpec
// =============================================================================

bdd.describe("renderSpec", () => {
  bdd.it("includes spec name as heading", () => {
    const md = template.renderSpec("photo-upload", [], [], []);

    assert.assertEquals(md.includes("# Spec: photo-upload"), true);
  });

  bdd.it("includes all discovery answers under their questionIds", () => {
    const md = template.renderSpec("test", sampleAnswers, [], []);

    assert.assertEquals(md.includes("### status_quo"), true);
    assert.assertEquals(md.includes("Users manually upload files"), true);
    assert.assertEquals(md.includes("### ambition"), true);
    assert.assertEquals(md.includes("### verification"), true);
  });

  bdd.it("includes concern sections when classification says relevant", () => {
    const apiClassification = {
      involvesWebUI: false,
      involvesCLI: false,
      involvesPublicAPI: true,
      involvesMigration: false,
      involvesDataHandling: false,
    };
    const md = template.renderSpec(
      "test",
      [],
      [openSource],
      [],
      apiClassification,
    );

    assert.assertEquals(
      md.includes("## Contributor Guide (open-source)"),
      true,
    );
    assert.assertEquals(
      md.includes("## Public API Surface (open-source)"),
      true,
    );
  });

  bdd.it("skips irrelevant concern sections based on classification", () => {
    const noUiClassification = {
      involvesWebUI: false,
      involvesCLI: false,
      involvesPublicAPI: false,
      involvesMigration: false,
      involvesDataHandling: false,
    };
    const md = template.renderSpec(
      "test",
      [],
      [beautiful],
      [],
      noUiClassification,
    );

    assert.assertEquals(md.includes("## Design States"), false);
    assert.assertEquals(md.includes("## Mobile Layout"), false);
  });

  bdd.it(
    "skips concern sections when no classification provided (clean default)",
    () => {
      const md = template.renderSpec("test", [], [beautiful], []);

      assert.assertEquals(md.includes("## Design States"), false);
    },
  );

  bdd.it("includes decisions table when decisions exist", () => {
    const md = template.renderSpec("test", [], [], sampleDecisions);

    assert.assertEquals(md.includes("## Decisions"), true);
    assert.assertEquals(md.includes("Which storage backend?"), true);
    assert.assertEquals(md.includes("S3"), true);
    assert.assertEquals(md.includes("OAuth2"), true);
    assert.assertEquals(md.includes("| yes |"), true);
    assert.assertEquals(md.includes("| no |"), true);
  });

  bdd.it("omits decisions section when empty", () => {
    const md = template.renderSpec("test", [], [], []);

    assert.assertEquals(md.includes("## Decisions"), false);
  });

  bdd.it("includes status as draft", () => {
    const md = template.renderSpec("test", [], [], []);

    assert.assertEquals(md.includes("## Status: draft"), true);
  });
});

// =============================================================================
// deriveTasks — sentence splitting and clean titles
// =============================================================================

bdd.describe("deriveTasks", () => {
  // ---------------------------------------------------------------------------
  // Q2 ambition — always ONE task using highest star description
  // ---------------------------------------------------------------------------

  bdd.it("Q2 produces ONE task from 10-star description", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "ambition",
        answer:
          "1-star: basic upload. 10-star: full system with validation, preview, and batch processing",
      },
    ];
    const tasks = template.deriveTasks(answers);

    // +2 mandatory test/docs tasks appended
    assert.assertEquals(tasks.length, 3);
    assert.assertEquals(tasks[0]!.includes("validation"), true);
    assert.assertEquals(tasks[0]!.includes("preview"), true);
    assert.assertEquals(tasks[0]!.includes("batch processing"), true);
  });

  bdd.it("Q2 uses 1-star when no 10-star provided", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "ambition",
        answer: "Build a dashboard with filtering and sorting",
      },
    ];
    const tasks = template.deriveTasks(answers);

    // +2 mandatory test/docs tasks appended
    assert.assertEquals(tasks.length, 3);
    assert.assertEquals(tasks[0]!.includes("filtering"), true);
    assert.assertEquals(tasks[0]!.includes("sorting"), true);
  });

  bdd.it("Q2 does not split 1-star and 10-star into separate tasks", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "ambition",
        answer:
          "1-star: Add a sentence about --validate. 10-star: Full protocol section with human->AgentA->AgentB->human cycle, usage examples, and mermaid diagram",
      },
    ];
    const tasks = template.deriveTasks(answers);

    // Must be ONE task, not two
    // +2 mandatory test/docs tasks appended
    assert.assertEquals(tasks.length, 3);
    assert.assertEquals(tasks[0]!.includes("protocol section"), true);
    // Must NOT contain 1-star content
    assert.assertEquals(tasks[0]!.includes("1-star"), false);
  });

  bdd.it("Q2 strips garbled prefixes like 'the target:'", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "ambition",
        answer:
          "10-star: the target: Full protocol section with phase transition docs",
      },
    ];
    const tasks = template.deriveTasks(answers);

    // +2 mandatory test/docs tasks appended
    assert.assertEquals(tasks.length, 3);
    assert.assertEquals(
      tasks[0],
      "Full protocol section with phase transition docs",
    );
  });

  bdd.it("Q2 does not add 'Implement:' prefix", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "ambition",
        answer:
          "10-star: comprehensive analytics dashboard with real-time updates, drill-down charts, cohort analysis, and export to CSV and PDF formats for all user segments",
      },
    ];
    const tasks = template.deriveTasks(answers);

    // +2 mandatory test/docs tasks appended
    assert.assertEquals(tasks.length, 3);
    assert.assertEquals(tasks[0]!.startsWith("Implement"), false);
  });

  // ---------------------------------------------------------------------------
  // Q5 verification — kept whole, no splitting on file extensions
  // ---------------------------------------------------------------------------

  bdd.it("keeps verification as single task even with commas", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "verification",
        answer:
          "Run noskills sync, check CLAUDE.md contains Phase Transition Protocol section and --validate docs",
      },
    ];
    const tasks = template.deriveTasks(answers);

    // +2 mandatory test/docs tasks appended
    assert.assertEquals(tasks.length, 3);
    assert.assertEquals(tasks[0]!.includes("Run noskills sync"), true);
    assert.assertEquals(tasks[0]!.includes("CLAUDE.md"), true);
    assert.assertEquals(tasks[0]!.includes("Phase Transition Protocol"), true);
  });

  bdd.it("verification with newlines produces multiple tasks", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "verification",
        answer: "Run unit tests\nCheck e2e tests pass\nVerify deployment",
      },
    ];
    const tasks = template.deriveTasks(answers);

    // 3 verification + 2 mandatory test/docs tasks
    assert.assertEquals(tasks.length, 5);
    assert.assertEquals(tasks[0], "Run unit tests");
    assert.assertEquals(tasks[1], "Check e2e tests pass");
    assert.assertEquals(tasks[2], "Verify deployment");
  });

  bdd.it("verification does not add 'Verify:' prefix", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "verification",
        answer: "Run noskills sync",
      },
    ];
    const tasks = template.deriveTasks(answers);

    // +2 mandatory test/docs tasks appended
    assert.assertEquals(tasks.length, 3);
    assert.assertEquals(tasks[0]!.startsWith("Verify:"), false);
    assert.assertEquals(tasks[0], "Run noskills sync");
  });

  // ---------------------------------------------------------------------------
  // Bug A: sentence splitting must not break on file extensions/abbreviations
  // ---------------------------------------------------------------------------

  bdd.it(
    "does not split on periods inside file extensions like CLAUDE.md",
    () => {
      const answers: schema.DiscoveryAnswer[] = [
        {
          questionId: "verification",
          answer:
            "Run noskills sync, check CLAUDE.md contains protocol section",
        },
      ];
      const tasks = template.deriveTasks(answers);

      // +2 mandatory test/docs tasks appended
      assert.assertEquals(tasks.length, 3);
      assert.assertEquals(tasks[0]!.includes("CLAUDE.md"), true);
    },
  );

  bdd.it("does not split on version numbers like v0.1", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "verification",
        answer: "Check v0.1 compatibility with the new API",
      },
    ];
    const tasks = template.deriveTasks(answers);

    // +2 mandatory test/docs tasks appended
    assert.assertEquals(tasks.length, 3);
    assert.assertEquals(tasks[0]!.includes("v0.1"), true);
  });

  bdd.it("does not split on file paths like src/api/v1/endpoint.ts", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "verification",
        answer: "Verify src/api/v1/endpoint.ts handles errors correctly",
      },
    ];
    const tasks = template.deriveTasks(answers);

    // +2 mandatory test/docs tasks appended
    assert.assertEquals(tasks.length, 3);
    assert.assertEquals(tasks[0]!.includes("endpoint.ts"), true);
  });

  // ---------------------------------------------------------------------------
  // Bug B: Q2 ambition produces ONE task, not per-star tasks
  // ---------------------------------------------------------------------------

  bdd.it("1-star/10-star answer produces ONE task using 10-star", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "ambition",
        answer: "1-star: basic. 10-star: full system with X, Y, Z",
      },
    ];
    const tasks = template.deriveTasks(answers);

    // +2 mandatory test/docs tasks appended
    assert.assertEquals(tasks.length, 3);
    assert.assertEquals(tasks[0]!.toLowerCase().includes("full system"), true);
    assert.assertEquals(tasks[0]!.includes("1-star"), false);
  });

  // ---------------------------------------------------------------------------
  // Bug C: no raw prefixes like "Implement:" in task descriptions
  // ---------------------------------------------------------------------------

  bdd.it("task descriptions do not start with Implement: prefix", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "ambition",
        answer:
          "10-star: noskills is indistinguishable between Claude Code and Kiro with adapter-based sync engine with capabilities dispatch and multi-file steering",
      },
    ];
    const tasks = template.deriveTasks(answers);

    // +2 mandatory test/docs tasks appended
    assert.assertEquals(tasks.length, 3);
    assert.assertEquals(tasks[0]!.startsWith("Implement:"), false);
    assert.assertEquals(tasks[0]!.startsWith("Implement "), false);
  });
});

// =============================================================================
// SpecSectionDefinition object shape in renderSpec
// =============================================================================

bdd.describe("renderSpec: SpecSectionDefinition object shape", () => {
  bdd.it("renders sections from object-shape specSections correctly", () => {
    const concernWithObjects: schema.ConcernDefinition = {
      id: "test-object-concern",
      name: "Object Concern",
      description: "Uses SpecSectionDefinition objects",
      extras: [],
      specSections: [
        {
          id: "my-object-section",
          title: "My Object Section",
          placeholder: "_This is the object section placeholder_",
          condition: null,
          position: "after:acceptance-criteria",
        },
      ],
      reminders: [],
      acceptanceCriteria: ["ok"],
    };

    const md = template.renderSpec("test", [], [concernWithObjects], [], null);
    assert.assertEquals(md.includes("## My Object Section"), true);
    assert.assertEquals(
      md.includes("_This is the object section placeholder_"),
      true,
    );
  });

  bdd.it("renders legacy string specSections (backward compat ramp)", () => {
    const legacyConcern: schema.ConcernDefinition = {
      id: "legacy-template-concern",
      name: "Legacy",
      description: "Old string format",
      extras: [],
      specSections: ["Legacy Section Title"],
      reminders: [],
      acceptanceCriteria: ["ok"],
    };

    const md = template.renderSpec("test", [], [legacyConcern], [], null);
    assert.assertEquals(md.includes("## Legacy Section Title"), true);
  });

  bdd.it("conditional section with true flag is included", () => {
    const uiConcern: schema.ConcernDefinition = {
      id: "ui-concern",
      name: "UI Concern",
      description: "Has conditional UI section",
      extras: [],
      specSections: [
        {
          id: "ui-section",
          title: "UI Section",
          placeholder: "_UI placeholder_",
          condition: "involvesWebUI",
          position: "after:acceptance-criteria",
        },
      ],
      reminders: [],
      acceptanceCriteria: ["ok"],
    };

    const uiClassification: schema.SpecClassification = {
      involvesWebUI: true,
      involvesCLI: false,
      involvesPublicAPI: false,
      involvesMigration: false,
      involvesDataHandling: false,
    };

    const md = template.renderSpec(
      "test",
      [],
      [uiConcern],
      [],
      uiClassification,
    );
    assert.assertEquals(md.includes("## UI Section"), true);
    assert.assertEquals(md.includes("_UI placeholder_"), true);
  });

  bdd.it("conditional section with false flag is excluded", () => {
    const uiConcern: schema.ConcernDefinition = {
      id: "ui-concern2",
      name: "UI Concern 2",
      description: "Has conditional UI section",
      extras: [],
      specSections: [
        {
          id: "ui-section2",
          title: "UI Section 2",
          placeholder: "_UI placeholder 2_",
          condition: "involvesWebUI",
          position: "after:acceptance-criteria",
        },
      ],
      reminders: [],
      acceptanceCriteria: ["ok"],
    };

    const noUiClassification: schema.SpecClassification = {
      involvesWebUI: false,
      involvesCLI: false,
      involvesPublicAPI: false,
      involvesMigration: false,
      involvesDataHandling: false,
    };

    const md = template.renderSpec(
      "test",
      [],
      [uiConcern],
      [],
      noUiClassification,
    );
    assert.assertEquals(md.includes("## UI Section 2"), false);
  });

  bdd.it("multiple concerns stack their sections in load order", () => {
    const firstConcern: schema.ConcernDefinition = {
      id: "first",
      name: "First",
      description: "First concern",
      extras: [],
      specSections: [
        {
          id: "first-section",
          title: "First Section",
          placeholder: "_first_",
          condition: null,
          position: "after:acceptance-criteria",
        },
      ],
      reminders: [],
      acceptanceCriteria: ["ok"],
    };
    const secondConcern: schema.ConcernDefinition = {
      id: "second",
      name: "Second",
      description: "Second concern",
      extras: [],
      specSections: [
        {
          id: "second-section",
          title: "Second Section",
          placeholder: "_second_",
          condition: null,
          position: "after:acceptance-criteria",
        },
      ],
      reminders: [],
      acceptanceCriteria: ["ok"],
    };

    const md = template.renderSpec(
      "test",
      [],
      [firstConcern, secondConcern],
      [],
      null,
    );
    const firstIdx = md.indexOf("## First Section");
    const secondIdx = md.indexOf("## Second Section");
    assert.assertEquals(firstIdx < secondIdx, true);
  });
});

// =============================================================================
// renderSpec: declared section scopes
// =============================================================================

bdd.describe("renderSpec: declared section scopes", () => {
  const noFlags: schema.SpecClassification = {
    involvesWebUI: false,
    involvesCLI: false,
    involvesPublicAPI: false,
    involvesMigration: false,
    involvesDataHandling: false,
  };
  const concern: schema.ConcernDefinition = {
    id: "custom",
    name: "Custom",
    description: "A project concern with scoped and plain sections",
    extras: [],
    specSections: [
      {
        id: "screens",
        title: "Screens",
        placeholder: "_List every screen._",
        scope: ["ui"],
        position: "after:acceptance-criteria",
      },
      {
        id: "endpoints",
        title: "Endpoints",
        placeholder: "_List every endpoint._",
        scope: ["api"],
        position: "after:acceptance-criteria",
      },
      {
        id: "rollout",
        title: "Rollout",
        placeholder: "_Describe the rollout._",
        position: "after:acceptance-criteria",
      },
    ],
    reminders: [],
    acceptanceCriteria: [],
  };

  const headings = (classification: schema.SpecClassification | null) =>
    template.renderSpec("scoped", [], [concern], [], classification)
      .split("\n")
      .filter((line) => line.endsWith("(custom)"));

  const cases = [
    {
      name: "renders only unscoped sections before classification",
      classification: null,
      expected: ["## Rollout (custom)"],
    },
    {
      name: "renders the ui section for a UI spec",
      classification: { ...noFlags, involvesWebUI: true },
      expected: ["## Screens (custom)", "## Rollout (custom)"],
    },
    {
      name: "renders the api section for an API spec",
      classification: { ...noFlags, involvesPublicAPI: true },
      expected: ["## Endpoints (custom)", "## Rollout (custom)"],
    },
    {
      name: "renders only unscoped sections for another spec",
      classification: { ...noFlags, involvesCLI: true },
      expected: ["## Rollout (custom)"],
    },
  ];

  for (const { name, classification, expected } of cases) {
    bdd.it(name, () => {
      assert.assertEquals(headings(classification), expected);
    });
  }
});
