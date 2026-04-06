// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Section 15 + Piece 4: Agentless flow verification.
 *
 * Tests the complete CLI-driven lifecycle without any agent running.
 * Simulates: init → spec new → discovery → approve → execute → done.
 * All through library calls (same code paths as CLI commands).
 */

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as machine from "./machine.ts";
import * as schema from "./schema.ts";
import * as compiler from "../context/compiler.ts";
import * as questions from "../context/questions.ts";
import * as template from "../spec/template.ts";
import * as formatter from "../output/formatter.ts";
import { loadDefaultConcerns } from "../context/concerns.ts";

// =============================================================================
// Helpers
// =============================================================================

const allConcerns = await loadDefaultConcerns();
const openSource = allConcerns.find((c) => c.id === "open-source")!;
const beautiful = allConcerns.find((c) => c.id === "beautiful-product")!;
const activeConcerns = [openSource, beautiful];
const rules = ["Use Deno for all TypeScript"];

const config = (): schema.NosManifest => ({
  ...schema.createInitialManifest(
    ["open-source", "beautiful-product"],
    ["claude-code"],
    ["anthropic"],
    {
      languages: ["typescript"],
      frameworks: ["react"],
      ci: ["github-actions"],
      testRunner: "deno",
    },
  ),
});

// =============================================================================
// Full agentless lifecycle
// =============================================================================

describe("Agentless flow: complete lifecycle via CLI", () => {
  it("walks IDLE → DISCOVERY → all questions → SPEC_PROPOSAL → SPEC_APPROVED → EXECUTING → COMPLETED", async () => {
    // === Step 1: Start from IDLE ===
    let state = schema.createInitialState();
    const output0 = await compiler.compile(
      state,
      activeConcerns,
      rules,
      config(),
    );
    assertEquals(output0.phase, "IDLE");

    // Text output works for human
    const text0 = formatter.format(output0, "text");
    assertEquals(text0.includes("[IDLE]"), true);

    // === Step 2: Create spec ===
    state = machine.startSpec(state, "photo-upload", "spec/photo-upload");
    assertEquals(state.phase, "DISCOVERY");

    // === Step 3: Answer all 6 discovery questions via CLI ===
    const qs = questions.getQuestionsWithExtras(activeConcerns);
    assertEquals(qs.length, 6);

    const answers: Record<string, string> = {
      status_quo: "Users drag files manually into a folder",
      ambition: "1-star: basic upload. 10-star: AI auto-categorization",
      reversibility: "No irreversible decisions - can always re-upload",
      user_impact: "New feature, no breaking changes",
      verification: "Unit tests for endpoint, e2e test for upload flow",
      scope_boundary: "No video support, no batch upload in v1",
    };

    // Simulate: noskills next → returns ALL questions at once
    const output3 = await compiler.compile(
      state,
      activeConcerns,
      rules,
      config(),
    );
    assertEquals(output3.phase, "DISCOVERY");
    const discovery = output3 as compiler.DiscoveryOutput;
    assertEquals(discovery.questions.length, 6);

    // Text format shows questions
    const textOut = formatter.format(output3, "text");
    assertEquals(textOut.includes("Question ["), true);

    // Markdown format shows questions
    const mdOut = formatter.format(output3, "markdown");
    assertEquals(mdOut.includes("## Question:"), true);

    // Simulate: answer all questions at once (batched JSON)
    for (const q of qs) {
      state = machine.addDiscoveryAnswer(
        state,
        q.id,
        answers[q.id] ?? "default answer with enough detail to pass validation",
      );
    }

    assertEquals(state.discovery.answers.length, 6);

    // === Step 4: Complete discovery → DISCOVERY_REFINEMENT ===
    assertEquals(questions.isDiscoveryComplete(state.discovery.answers), true);
    state = machine.completeDiscovery(state);
    assertEquals(state.phase, "DISCOVERY_REFINEMENT");

    // Approve discovery review → SPEC_PROPOSAL
    state = machine.approveDiscoveryReview(state);
    assertEquals(state.phase, "SPEC_PROPOSAL");
    assertEquals(state.classification, null); // not yet classified

    // SPEC_PROPOSAL without classification → asks for classification
    const output4a = await compiler.compile(
      state,
      activeConcerns,
      rules,
      config(),
    );
    assertEquals(output4a.phase, "SPEC_PROPOSAL");
    assertEquals(
      (output4a as compiler.SpecDraftOutput).classificationRequired,
      true,
    );

    // Provide classification (no UI, no API — simple template change)
    state = {
      ...state,
      classification: {
        involvesWebUI: false,
        involvesCLI: false,
        involvesPublicAPI: false,
        involvesMigration: false,
        involvesDataHandling: false,
      },
    };

    // Generate spec with classification
    const specMd = template.renderSpec(
      "photo-upload",
      state.discovery.answers,
      activeConcerns,
      state.decisions,
      state.classification,
    );
    assertEquals(specMd.includes("# Spec: photo-upload"), true);
    assertEquals(specMd.includes("Users drag files manually"), true);
    assertEquals(specMd.includes("## Out of Scope"), true);
    assertEquals(specMd.includes("## Tasks"), true);
    // All concern sections skipped (classification says nothing relevant)
    assertEquals(specMd.includes("Design States"), false);
    assertEquals(specMd.includes("Contributor Guide"), false);

    // Output now shows approve transition (classification provided)
    const output4b = await compiler.compile(
      state,
      activeConcerns,
      rules,
      config(),
    );
    assertEquals(output4b.phase, "SPEC_PROPOSAL");
    const specDraft = output4b as compiler.SpecDraftOutput;
    assertEquals(specDraft.transition.onApprove.includes("approve"), true);

    // === Step 5: Approve → SPEC_APPROVED ===
    state = machine.approveSpec(state);
    assertEquals(state.phase, "SPEC_APPROVED");
    assertEquals(state.specState.status, "approved");

    const output5 = await compiler.compile(
      state,
      activeConcerns,
      rules,
      config(),
    );
    assertEquals(output5.phase, "SPEC_APPROVED");

    // === Step 6: Start execution ===
    state = machine.startExecution(state);
    assertEquals(state.phase, "EXECUTING");
    assertEquals(state.execution.iteration, 0);

    const output6 = await compiler.compile(
      state,
      activeConcerns,
      rules,
      config(),
    );
    assertEquals(output6.phase, "EXECUTING");
    const execOutput = output6 as compiler.ExecutionOutput;
    assertEquals(
      execOutput.instruction.includes("task") ||
        execOutput.instruction.includes("completed"),
      true,
    );

    // Behavioral guardrails present
    assertEquals(
      output6.behavioral.tone.includes("Orchestrate immediately"),
      true,
    );
    assertEquals(
      output6.behavioral.rules.some((r) => r.includes("Do not explore")),
      true,
    );

    // === Step 7: Report progress (simulating --answer) ===
    // Agent (or human) says "done" → triggers status report
    state = {
      ...state,
      execution: {
        ...state.execution,
        lastProgress: "task-1 done",
        awaitingStatusReport: true,
      },
    };

    const output7 = await compiler.compile(
      state,
      activeConcerns,
      rules,
      config(),
    );
    const execWithReport = output7 as compiler.ExecutionOutput;
    assertEquals(execWithReport.statusReportRequired, true);
    assertEquals(execWithReport.statusReport !== undefined, true);
    // Classification filters keyword-specific ACs — involvesWebUI=false means no "Mobile layout" etc.
    assertEquals(
      execWithReport.statusReport!.criteria.some((c) =>
        c.text.includes("Mobile layout")
      ),
      false,
    );
    assertEquals(
      execWithReport.statusReport!.criteria.some((c) =>
        c.text.includes("Public API documented")
      ),
      false,
    );

    // Submit status report — everything complete, no debt
    state = {
      ...state,
      execution: {
        ...state.execution,
        awaitingStatusReport: false,
        debt: null,
      },
    };

    // === Step 8: Advance and complete ===
    state = machine.advanceExecution(state, "all tasks done");
    state = machine.completeSpec(state, "done");
    assertEquals(state.phase, "COMPLETED");

    const output8 = await compiler.compile(
      state,
      activeConcerns,
      rules,
      config(),
    );
    assertEquals(output8.phase, "COMPLETED");
    const completed = output8 as compiler.CompletedOutput;
    assertEquals(completed.summary.spec, "photo-upload");

    // Text format shows summary
    const textDone = formatter.format(output8, "text");
    assertEquals(textDone.includes("photo-upload"), true);

    // Markdown format shows summary
    const mdDone = formatter.format(output8, "markdown");
    assertEquals(mdDone.includes("## Summary"), true);
  });
});

// =============================================================================
// Output format consistency
// =============================================================================

describe("Output format consistency across phases", () => {
  const phases = (): { name: string; state: schema.StateFile }[] => {
    let s = schema.createInitialState();
    const idle = { name: "IDLE", state: s };

    s = machine.startSpec(s, "test", "spec/test");
    const disc = { name: "DISCOVERY", state: s };

    s = machine.completeDiscovery(s);
    const discReview = { name: "DISCOVERY_REFINEMENT", state: s };

    s = machine.approveDiscoveryReview(s);
    const draft = { name: "SPEC_PROPOSAL", state: s };

    s = machine.approveSpec(s);
    const approved = { name: "SPEC_APPROVED", state: s };

    s = machine.startExecution(s);
    const exec = { name: "EXECUTING", state: s };

    const blocked = {
      name: "BLOCKED",
      state: machine.blockExecution(s, "decision needed"),
    };

    const completed = {
      name: "COMPLETED",
      state: machine.completeSpec(s, "done"),
    };

    return [idle, disc, discReview, draft, approved, exec, blocked, completed];
  };

  it("every phase produces valid JSON output", async () => {
    for (const p of phases()) {
      const output = await compiler.compile(p.state, [], [], config());
      const json = formatter.format(output, "json");
      const parsed = JSON.parse(json);
      assertEquals(parsed.phase, p.name);
      assertEquals(parsed.meta !== undefined, true);
      assertEquals(parsed.behavioral !== undefined, true);
    }
  });

  it("every phase produces non-empty text output", async () => {
    for (const p of phases()) {
      const output = await compiler.compile(p.state, [], [], config());
      const text = formatter.format(output, "text");
      assertEquals(text.length > 0, true);
      assertEquals(text.includes(`[${p.name}]`), true);
    }
  });

  it("every phase produces non-empty markdown output", async () => {
    for (const p of phases()) {
      const output = await compiler.compile(p.state, [], [], config());
      const md = formatter.format(output, "markdown");
      assertEquals(md.length > 0, true);
      assertEquals(md.includes(`# noskills — ${p.name}`), true);
    }
  });
});

// =============================================================================
// Dual entry points (Section 15.1-15.2)
// =============================================================================

describe("Dual entry: CLI and agent produce identical state", () => {
  it("half CLI, half agent continues seamlessly", async () => {
    // CLI answers Q1-Q3
    let state = machine.startSpec(
      schema.createInitialState(),
      "dual-test",
      "spec/dual-test",
    );
    const qs = questions.getQuestionsWithExtras([]);
    state = machine.addDiscoveryAnswer(
      state,
      qs[0]!.id,
      "cli answer 1 with detailed explanation of the requirement",
    );
    state = machine.addDiscoveryAnswer(
      state,
      qs[1]!.id,
      "cli answer 2 covering the implementation approach",
    );
    state = machine.addDiscoveryAnswer(
      state,
      qs[2]!.id,
      "cli answer 3 describing the verification strategy",
    );

    assertEquals(state.discovery.answers.length, 3);

    // Agent picks up — noskills next should return Q4, not Q1
    const output = await compiler.compile(state, [], []);
    assertEquals(output.phase, "DISCOVERY");
    const disc = output as compiler.DiscoveryOutput;
    assertEquals(disc.questions.length, 3); // 3 remaining unanswered
    assertEquals(disc.answeredCount, 3);
  });
});

// =============================================================================
// Formatter arg parsing
// =============================================================================

describe("Formatter arg parsing", () => {
  it("defaults to json with no args", () => {
    assertEquals(formatter.parseOutputFormat(undefined), "json");
    assertEquals(formatter.parseOutputFormat([]), "json");
  });

  it("parses -o json", () => {
    assertEquals(formatter.parseOutputFormat(["-o", "json"]), "json");
  });

  it("parses -o markdown", () => {
    assertEquals(formatter.parseOutputFormat(["-o", "markdown"]), "markdown");
  });

  it("parses -o md as markdown", () => {
    assertEquals(formatter.parseOutputFormat(["-o", "md"]), "markdown");
  });

  it("parses -o text", () => {
    assertEquals(formatter.parseOutputFormat(["-o", "text"]), "text");
  });

  it("parses --output=text", () => {
    assertEquals(formatter.parseOutputFormat(["--output=text"]), "text");
  });

  it("strips -o flag from args", () => {
    const result = formatter.stripOutputFlag([
      "--answer=hello",
      "-o",
      "markdown",
      "extra",
    ]);
    assertEquals(result.length, 2);
    assertEquals(result[0], "--answer=hello");
    assertEquals(result[1], "extra");
  });

  it("strips --output=value from args", () => {
    const result = formatter.stripOutputFlag([
      "--output=json",
      "--answer=hello",
    ]);
    assertEquals(result.length, 1);
    assertEquals(result[0], "--answer=hello");
  });
});

// =============================================================================
// Spec naming
// =============================================================================

describe("Spec naming via slugify", () => {
  it("slug from description is lowercase with hyphens", () => {
    // Test via startSpec which receives the slug
    const state = machine.startSpec(
      schema.createInitialState(),
      "photo-upload-feature",
      "spec/photo-upload-feature",
    );
    assertEquals(state.spec, "photo-upload-feature");
  });

  it("explicit name preserved as-is", () => {
    const state = machine.startSpec(
      schema.createInitialState(),
      "SPC0001",
      "spec/SPC0001",
    );
    assertEquals(state.spec, "SPC0001");
  });
});
