// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as template from "./template.ts";
import * as schema from "../state/schema.ts";
import { loadDefaultConcerns } from "../context/concerns.ts";

// =============================================================================
// Helpers
// =============================================================================

const allConcerns = await loadDefaultConcerns();
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

describe("renderSpec", () => {
  it("includes spec name as heading", () => {
    const md = template.renderSpec("photo-upload", [], [], []);

    assertEquals(md.includes("# Spec: photo-upload"), true);
  });

  it("includes all discovery answers under their questionIds", () => {
    const md = template.renderSpec("test", sampleAnswers, [], []);

    assertEquals(md.includes("### status_quo"), true);
    assertEquals(md.includes("Users manually upload files"), true);
    assertEquals(md.includes("### ambition"), true);
    assertEquals(md.includes("### verification"), true);
  });

  it("includes concern sections when classification says relevant", () => {
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

    assertEquals(md.includes("## Contributor Guide (open-source)"), true);
    assertEquals(md.includes("## Public API Surface (open-source)"), true);
  });

  it("skips irrelevant concern sections based on classification", () => {
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

    assertEquals(md.includes("## Design States"), false);
    assertEquals(md.includes("## Mobile Layout"), false);
  });

  it("skips concern sections when no classification provided (clean default)", () => {
    const md = template.renderSpec("test", [], [beautiful], []);

    assertEquals(md.includes("## Design States"), false);
  });

  it("includes decisions table when decisions exist", () => {
    const md = template.renderSpec("test", [], [], sampleDecisions);

    assertEquals(md.includes("## Decisions"), true);
    assertEquals(md.includes("Which storage backend?"), true);
    assertEquals(md.includes("S3"), true);
    assertEquals(md.includes("OAuth2"), true);
    assertEquals(md.includes("| yes |"), true);
    assertEquals(md.includes("| no |"), true);
  });

  it("omits decisions section when empty", () => {
    const md = template.renderSpec("test", [], [], []);

    assertEquals(md.includes("## Decisions"), false);
  });

  it("includes status as draft", () => {
    const md = template.renderSpec("test", [], [], []);

    assertEquals(md.includes("## Status: draft"), true);
  });
});

// =============================================================================
// deriveTasks — sentence splitting and clean titles
// =============================================================================

describe("deriveTasks", () => {
  // ---------------------------------------------------------------------------
  // Q2 ambition — always ONE task using highest star description
  // ---------------------------------------------------------------------------

  it("Q2 produces ONE task from 10-star description", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "ambition",
        answer:
          "1-star: basic upload. 10-star: full system with validation, preview, and batch processing",
      },
    ];
    const tasks = template.deriveTasks(answers);

    assertEquals(tasks.length, 1);
    assertEquals(tasks[0]!.includes("validation"), true);
    assertEquals(tasks[0]!.includes("preview"), true);
    assertEquals(tasks[0]!.includes("batch processing"), true);
  });

  it("Q2 uses 1-star when no 10-star provided", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "ambition",
        answer: "Build a dashboard with filtering and sorting",
      },
    ];
    const tasks = template.deriveTasks(answers);

    assertEquals(tasks.length, 1);
    assertEquals(tasks[0]!.includes("filtering"), true);
    assertEquals(tasks[0]!.includes("sorting"), true);
  });

  it("Q2 does not split 1-star and 10-star into separate tasks", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "ambition",
        answer:
          "1-star: Add a sentence about --validate. 10-star: Full protocol section with human->AgentA->AgentB->human cycle, usage examples, and mermaid diagram",
      },
    ];
    const tasks = template.deriveTasks(answers);

    // Must be ONE task, not two
    assertEquals(tasks.length, 1);
    assertEquals(tasks[0]!.includes("protocol section"), true);
    // Must NOT contain 1-star content
    assertEquals(tasks[0]!.includes("1-star"), false);
  });

  it("Q2 strips garbled prefixes like 'the target:'", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "ambition",
        answer:
          "10-star: the target: Full protocol section with phase transition docs",
      },
    ];
    const tasks = template.deriveTasks(answers);

    assertEquals(tasks.length, 1);
    assertEquals(
      tasks[0],
      "Full protocol section with phase transition docs",
    );
  });

  it("Q2 does not add 'Implement:' prefix", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "ambition",
        answer:
          "10-star: comprehensive analytics dashboard with real-time updates, drill-down charts, cohort analysis, and export to CSV and PDF formats for all user segments",
      },
    ];
    const tasks = template.deriveTasks(answers);

    assertEquals(tasks.length, 1);
    assertEquals(tasks[0]!.startsWith("Implement"), false);
  });

  // ---------------------------------------------------------------------------
  // Q5 verification — kept whole, no splitting on file extensions
  // ---------------------------------------------------------------------------

  it("keeps verification as single task even with commas", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "verification",
        answer:
          "Run noskills sync, check CLAUDE.md contains Phase Transition Protocol section and --validate docs",
      },
    ];
    const tasks = template.deriveTasks(answers);

    assertEquals(tasks.length, 1);
    assertEquals(tasks[0]!.includes("Run noskills sync"), true);
    assertEquals(tasks[0]!.includes("CLAUDE.md"), true);
    assertEquals(tasks[0]!.includes("Phase Transition Protocol"), true);
  });

  it("verification with newlines produces multiple tasks", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "verification",
        answer: "Run unit tests\nCheck e2e tests pass\nVerify deployment",
      },
    ];
    const tasks = template.deriveTasks(answers);

    assertEquals(tasks.length, 3);
    assertEquals(tasks[0], "Run unit tests");
    assertEquals(tasks[1], "Check e2e tests pass");
    assertEquals(tasks[2], "Verify deployment");
  });

  it("verification does not add 'Verify:' prefix", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "verification",
        answer: "Run noskills sync",
      },
    ];
    const tasks = template.deriveTasks(answers);

    assertEquals(tasks.length, 1);
    assertEquals(tasks[0]!.startsWith("Verify:"), false);
    assertEquals(tasks[0], "Run noskills sync");
  });

  // ---------------------------------------------------------------------------
  // Bug A: sentence splitting must not break on file extensions/abbreviations
  // ---------------------------------------------------------------------------

  it("does not split on periods inside file extensions like CLAUDE.md", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "verification",
        answer: "Run noskills sync, check CLAUDE.md contains protocol section",
      },
    ];
    const tasks = template.deriveTasks(answers);

    assertEquals(tasks.length, 1);
    assertEquals(tasks[0]!.includes("CLAUDE.md"), true);
  });

  it("does not split on version numbers like v0.1", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "verification",
        answer: "Check v0.1 compatibility with the new API",
      },
    ];
    const tasks = template.deriveTasks(answers);

    assertEquals(tasks.length, 1);
    assertEquals(tasks[0]!.includes("v0.1"), true);
  });

  it("does not split on file paths like src/api/v1/endpoint.ts", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "verification",
        answer: "Verify src/api/v1/endpoint.ts handles errors correctly",
      },
    ];
    const tasks = template.deriveTasks(answers);

    assertEquals(tasks.length, 1);
    assertEquals(tasks[0]!.includes("endpoint.ts"), true);
  });

  // ---------------------------------------------------------------------------
  // Bug B: Q2 ambition produces ONE task, not per-star tasks
  // ---------------------------------------------------------------------------

  it("1-star/10-star answer produces ONE task using 10-star", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "ambition",
        answer: "1-star: basic. 10-star: full system with X, Y, Z",
      },
    ];
    const tasks = template.deriveTasks(answers);

    assertEquals(tasks.length, 1);
    assertEquals(tasks[0]!.toLowerCase().includes("full system"), true);
    assertEquals(tasks[0]!.includes("1-star"), false);
  });

  // ---------------------------------------------------------------------------
  // Bug C: no raw prefixes like "Implement:" in task descriptions
  // ---------------------------------------------------------------------------

  it("task descriptions do not start with Implement: prefix", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "ambition",
        answer:
          "10-star: noskills is indistinguishable between Claude Code and Kiro with adapter-based sync engine with capabilities dispatch and multi-file steering",
      },
    ];
    const tasks = template.deriveTasks(answers);

    assertEquals(tasks.length, 1);
    assertEquals(tasks[0]!.startsWith("Implement:"), false);
    assertEquals(tasks[0]!.startsWith("Implement "), false);
  });
});
