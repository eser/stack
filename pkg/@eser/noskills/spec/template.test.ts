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
  it("splits ambition by sentences, not commas", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "ambition",
        answer:
          "Add upload endpoint with validation. Support multiple file types.",
      },
    ];
    const tasks = template.deriveTasks(answers);

    assertEquals(tasks.length, 2);
    assertEquals(
      tasks[0]!.includes("upload endpoint with validation"),
      true,
    );
    assertEquals(tasks[1]!.includes("multiple file types"), true);
  });

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
    assertEquals(tasks[0]!.includes("Phase Transition Protocol"), true);
  });

  it("strips garbled prefixes like 'the target:'", () => {
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

  it("does not split ambition on commas or 'and'", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "ambition",
        answer:
          "Build a dashboard with filtering, sorting, and pagination support",
      },
    ];
    const tasks = template.deriveTasks(answers);

    // Should be 1 task, not 3
    assertEquals(tasks.length, 1);
    assertEquals(tasks[0]!.includes("filtering"), true);
    assertEquals(tasks[0]!.includes("sorting"), true);
    assertEquals(tasks[0]!.includes("pagination"), true);
  });

  it("splits ambition on newlines into separate tasks", () => {
    const answers: schema.DiscoveryAnswer[] = [
      {
        questionId: "ambition",
        answer: "Add photo upload endpoint\nAdd video upload endpoint",
      },
    ];
    const tasks = template.deriveTasks(answers);

    assertEquals(tasks.length, 2);
    assertEquals(tasks[0]!.includes("photo upload"), true);
    assertEquals(tasks[1]!.includes("video upload"), true);
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
});
