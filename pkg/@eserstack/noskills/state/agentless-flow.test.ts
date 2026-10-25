// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Section 15 + Piece 4: Agentless flow verification.
 *
 * Tests the complete CLI-driven lifecycle without any agent running.
 * Simulates: init → spec new → discovery → approve → execute → done.
 * All through library calls (same code paths as CLI commands).
 */

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as machine from "./machine.ts";
import * as schema from "./schema.ts";
import * as compiler from "../context/compiler.ts";
import * as questions from "../context/questions.ts";
import * as template from "../spec/template.ts";
import * as formatter from "../output/formatter.ts";
import * as defaultConcerns from "../defaults/concerns/mod.ts";

// =============================================================================
// Helpers
// =============================================================================

const allConcerns = defaultConcerns.DEFAULT_CONCERNS;
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

bdd.describe("Agentless flow: complete lifecycle via CLI", () => {
  bdd.it(
    "walks IDLE → DISCOVERY → all questions → SPEC_PROPOSAL → SPEC_APPROVED → EXECUTING → COMPLETED",
    async () => {
      // === Step 1: Start from IDLE ===
      let state = schema.createInitialState();
      const output0 = await compiler.compile(
        state,
        activeConcerns,
        rules,
        config(),
      );
      assert.assertEquals(output0.phase, "IDLE");

      // Text output works for human
      const text0 = formatter.format(output0, "text");
      assert.assertEquals(text0.includes("[IDLE]"), true);

      // === Step 2: Create spec ===
      state = machine.startSpec(state, "photo-upload", "spec/photo-upload");
      assert.assertEquals(state.phase, "DISCOVERY");

      // === Step 3: Answer all 6 discovery questions via CLI ===
      const qs = questions.getQuestionsWithExtras(activeConcerns);
      assert.assertEquals(qs.length, 6);

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
      assert.assertEquals(output3.phase, "DISCOVERY");
      const discovery = output3 as compiler.DiscoveryOutput;
      assert.assertEquals(discovery.questions.length, 6);

      // Text format shows questions
      const textOut = formatter.format(output3, "text");
      assert.assertEquals(textOut.includes("Question ["), true);

      // Markdown format shows questions
      const mdOut = formatter.format(output3, "markdown");
      assert.assertEquals(mdOut.includes("## Question:"), true);

      // Simulate: answer all questions at once (batched JSON)
      for (const q of qs) {
        state = machine.addDiscoveryAnswer(
          state,
          q.id,
          answers[q.id] ??
            "default answer with enough detail to pass validation",
        );
      }

      assert.assertEquals(state.discovery.answers.length, 6);

      // === Step 4: Complete discovery → DISCOVERY_REFINEMENT ===
      assert.assertEquals(
        questions.isDiscoveryComplete(state.discovery.answers),
        true,
      );
      state = machine.completeDiscovery(state);
      assert.assertEquals(state.phase, "DISCOVERY_REFINEMENT");

      // Approve discovery review → SPEC_PROPOSAL
      state = machine.approveDiscoveryReview(state);
      assert.assertEquals(state.phase, "SPEC_PROPOSAL");
      // approveDiscoveryReview now auto-infers classification via
      // autoClassifyIfMissing (task-10), so it is never null at this point.
      assert.assertEquals(state.classification !== null, true);
      assert.assertEquals(state.classification?.source, "inferred");

      // Force classification back to null to exercise the compiler's
      // null-handling branch (classificationRequired path).
      state = { ...state, classification: null };

      // SPEC_PROPOSAL without classification → asks for classification
      const output4a = await compiler.compile(
        state,
        activeConcerns,
        rules,
        config(),
      );
      assert.assertEquals(output4a.phase, "SPEC_PROPOSAL");
      assert.assertEquals(
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
      assert.assertEquals(specMd.includes("# Spec: photo-upload"), true);
      assert.assertEquals(specMd.includes("Users drag files manually"), true);
      assert.assertEquals(specMd.includes("## Out of Scope"), true);
      assert.assertEquals(specMd.includes("## Tasks"), true);
      // Conditional sections hidden (classification flags all false)
      assert.assertEquals(specMd.includes("Design States"), false);
      // Unconditional sections (condition: null) always shown
      assert.assertEquals(specMd.includes("Contributor Guide"), true);

      // Output now shows approve transition (classification provided)
      const output4b = await compiler.compile(
        state,
        activeConcerns,
        rules,
        config(),
      );
      assert.assertEquals(output4b.phase, "SPEC_PROPOSAL");
      const specDraft = output4b as compiler.SpecDraftOutput;
      assert.assertEquals(
        specDraft.transition.onApprove.includes("approve"),
        true,
      );

      // === Step 5: Approve → SPEC_APPROVED ===
      state = machine.approveSpec(state);
      assert.assertEquals(state.phase, "SPEC_APPROVED");
      assert.assertEquals(state.specState.status, "approved");

      const output5 = await compiler.compile(
        state,
        activeConcerns,
        rules,
        config(),
      );
      assert.assertEquals(output5.phase, "SPEC_APPROVED");

      // === Step 6: Start execution ===
      state = machine.startExecution(state);
      assert.assertEquals(state.phase, "EXECUTING");
      assert.assertEquals(state.execution.iteration, 0);

      const output6 = await compiler.compile(
        state,
        activeConcerns,
        rules,
        config(),
      );
      assert.assertEquals(output6.phase, "EXECUTING");
      const execOutput = output6 as compiler.ExecutionOutput;
      assert.assertEquals(
        execOutput.instruction.includes("task") ||
          execOutput.instruction.includes("completed"),
        true,
      );

      // Behavioral guardrails present
      assert.assertEquals(
        output6.behavioral.tone.includes("Orchestrate immediately"),
        true,
      );
      assert.assertEquals(
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
      assert.assertEquals(execWithReport.statusReportRequired, true);
      assert.assertEquals(execWithReport.statusReport !== undefined, true);
      // Classification filters keyword-specific ACs — involvesWebUI=false means no "Mobile layout" etc.
      assert.assertEquals(
        execWithReport.statusReport!.criteria.some((c) =>
          c.text.includes("Mobile layout"),
        ),
        false,
      );
      assert.assertEquals(
        execWithReport.statusReport!.criteria.some((c) =>
          c.text.includes("Public API documented"),
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
      assert.assertEquals(state.phase, "COMPLETED");

      const output8 = await compiler.compile(
        state,
        activeConcerns,
        rules,
        config(),
      );
      assert.assertEquals(output8.phase, "COMPLETED");
      const completed = output8 as compiler.CompletedOutput;
      assert.assertEquals(completed.summary.spec, "photo-upload");

      // Text format shows summary
      const textDone = formatter.format(output8, "text");
      assert.assertEquals(textDone.includes("photo-upload"), true);

      // Markdown format shows summary
      const mdDone = formatter.format(output8, "markdown");
      assert.assertEquals(mdDone.includes("## Summary"), true);
    },
  );
});

// =============================================================================
// Output format consistency
// =============================================================================

bdd.describe("Output format consistency across phases", () => {
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

  /** Compiles every phase concurrently; the result keeps the phase order. */
  const compilePhases = async () => {
    const list = phases();
    const outputs = await Promise.all(
      list.map((p) => compiler.compile(p.state, [], [], config())),
    );

    return list.map((p, i) => ({ name: p.name, output: outputs[i]! }));
  };

  bdd.it("every phase produces valid JSON output", async () => {
    for (const p of await compilePhases()) {
      const json = formatter.format(p.output, "json");
      const parsed = JSON.parse(json);
      assert.assertEquals(parsed.phase, p.name);
      assert.assertEquals(parsed.meta !== undefined, true);
      assert.assertEquals(parsed.behavioral !== undefined, true);
    }
  });

  bdd.it("every phase produces non-empty text output", async () => {
    for (const p of await compilePhases()) {
      const text = formatter.format(p.output, "text");
      assert.assertEquals(text.length > 0, true);
      assert.assertEquals(text.includes(`[${p.name}]`), true);
    }
  });

  bdd.it("every phase produces non-empty markdown output", async () => {
    for (const p of await compilePhases()) {
      const md = formatter.format(p.output, "markdown");
      assert.assertEquals(md.length > 0, true);
      assert.assertEquals(md.includes(`# noskills — ${p.name}`), true);
    }
  });
});

// =============================================================================
// Dual entry points (Section 15.1-15.2)
// =============================================================================

bdd.describe("Dual entry: CLI and agent produce identical state", () => {
  bdd.it("half CLI, half agent continues seamlessly", async () => {
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

    assert.assertEquals(state.discovery.answers.length, 3);

    // Agent picks up — noskills next should return Q4, not Q1
    const output = await compiler.compile(state, [], []);
    assert.assertEquals(output.phase, "DISCOVERY");
    const disc = output as compiler.DiscoveryOutput;
    assert.assertEquals(disc.questions.length, 3); // 3 remaining unanswered
    assert.assertEquals(disc.answeredCount, 3);
  });
});

// =============================================================================
// Formatter arg parsing
// =============================================================================

bdd.describe("Formatter arg parsing", () => {
  bdd.it("defaults to json with no args", () => {
    assert.assertEquals(formatter.parseOutputFormat(undefined), "json");
    assert.assertEquals(formatter.parseOutputFormat([]), "json");
  });

  bdd.it("parses -o json", () => {
    assert.assertEquals(formatter.parseOutputFormat(["-o", "json"]), "json");
  });

  bdd.it("parses -o markdown", () => {
    assert.assertEquals(
      formatter.parseOutputFormat(["-o", "markdown"]),
      "markdown",
    );
  });

  bdd.it("parses -o md as markdown", () => {
    assert.assertEquals(formatter.parseOutputFormat(["-o", "md"]), "markdown");
  });

  bdd.it("parses -o text", () => {
    assert.assertEquals(formatter.parseOutputFormat(["-o", "text"]), "text");
  });

  bdd.it("parses --output=text", () => {
    assert.assertEquals(formatter.parseOutputFormat(["--output=text"]), "text");
  });

  bdd.it("strips -o flag from args", () => {
    const result = formatter.stripOutputFlag([
      "--answer=hello",
      "-o",
      "markdown",
      "extra",
    ]);
    assert.assertEquals(result.length, 2);
    assert.assertEquals(result[0], "--answer=hello");
    assert.assertEquals(result[1], "extra");
  });

  bdd.it("strips --output=value from args", () => {
    const result = formatter.stripOutputFlag([
      "--output=json",
      "--answer=hello",
    ]);
    assert.assertEquals(result.length, 1);
    assert.assertEquals(result[0], "--answer=hello");
  });
});

// =============================================================================
// Spec naming
// =============================================================================

bdd.describe("Spec naming via slugify", () => {
  bdd.it("slug from description is lowercase with hyphens", () => {
    // Test via startSpec which receives the slug
    const state = machine.startSpec(
      schema.createInitialState(),
      "photo-upload-feature",
      "spec/photo-upload-feature",
    );
    assert.assertEquals(state.spec, "photo-upload-feature");
  });

  bdd.it("explicit name preserved as-is", () => {
    const state = machine.startSpec(
      schema.createInitialState(),
      "SPC0001",
      "spec/SPC0001",
    );
    assert.assertEquals(state.spec, "SPC0001");
  });
});
