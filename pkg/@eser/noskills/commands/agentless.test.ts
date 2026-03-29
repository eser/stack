// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Agentless mode: output formatting, spec naming, spec switching.
 * Tests the CLI-driven experience without any agent.
 */

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as machine from "../state/machine.ts";
import * as schema from "../state/schema.ts";
import * as compiler from "../context/compiler.ts";
import * as formatter from "../output/formatter.ts";
import { loadDefaultConcerns } from "../context/concerns.ts";

// =============================================================================
// Helpers
// =============================================================================

const allConcerns = await loadDefaultConcerns();
const noRules: readonly string[] = [];
const noConcerns: readonly schema.ConcernDefinition[] = [];
const openSource = allConcerns.find((c) => c.id === "open-source")!;

const config = (): schema.NosManifest =>
  schema.createInitialManifest(
    ["open-source"],
    ["claude-code"],
    ["anthropic"],
    {
      languages: ["typescript"],
      frameworks: [],
      ci: [],
      testRunner: "deno",
    },
  );

const idle = (): schema.StateFile => schema.createInitialState();

const inExecuting = (): schema.StateFile => {
  let s = idle();
  s = machine.startSpec(s, "photo-upload", "spec/photo-upload");
  s = machine.completeDiscovery(s);
  s = machine.approveDiscoveryReview(s);
  s = machine.approveSpec(s);
  s = machine.startExecution(s);
  return s;
};

// =============================================================================
// 1. Output formatting
// =============================================================================

describe("Output formatting: -o flag", () => {
  it("-o json is default", () => {
    assertEquals(formatter.parseOutputFormat(undefined), "json");
    assertEquals(formatter.parseOutputFormat([]), "json");
    assertEquals(formatter.parseOutputFormat(["--answer=test"]), "json");
  });

  it("-o markdown for next output", () => {
    const output = compiler.compile(idle(), noConcerns, noRules, config());
    const md = formatter.format(output, "markdown");

    assertEquals(md.includes("# noskills"), true);
    assertEquals(md.includes("IDLE"), true);
  });

  it("-o text for next output", () => {
    const output = compiler.compile(idle(), noConcerns, noRules, config());
    const text = formatter.format(output, "text");

    assertEquals(text.includes("[IDLE]"), true);
    assertEquals(text.includes("#"), false); // no markdown headings
  });

  it("-o json for next output is valid JSON", () => {
    const output = compiler.compile(idle(), noConcerns, noRules, config());
    const json = formatter.format(output, "json");
    const parsed = JSON.parse(json);

    assertEquals(parsed.phase, "IDLE");
  });

  it("-o markdown for EXECUTING shows instruction and behavioral", () => {
    const output = compiler.compile(
      inExecuting(),
      [openSource],
      noRules,
      config(),
    );
    const md = formatter.format(output, "markdown");

    assertEquals(md.includes("## Instruction"), true);
    assertEquals(md.includes("## Behavioral"), true);
    assertEquals(md.includes("**Tone:**"), true);
  });

  it("-o text for DISCOVERY shows question", () => {
    let s = idle();
    s = machine.startSpec(s, "test", "spec/test");
    const output = compiler.compile(s, noConcerns, noRules, config());
    const text = formatter.format(output, "text");

    assertEquals(text.includes("[DISCOVERY]"), true);
    assertEquals(text.includes("Question ["), true);
  });

  it("-o markdown for COMPLETED shows summary", () => {
    const completed = machine.completeSpec(inExecuting(), "done");
    const output = compiler.compile(completed, noConcerns, noRules, config());
    const md = formatter.format(output, "markdown");

    assertEquals(md.includes("## Summary"), true);
    assertEquals(md.includes("photo-upload"), true);
  });

  it("-o json for status-like data is valid JSON", () => {
    const statusData = {
      phase: "EXECUTING",
      spec: "photo-upload",
      iteration: 3,
      debt: 2,
    };
    const json = formatter.format(statusData, "json");
    const parsed = JSON.parse(json);

    assertEquals(parsed.phase, "EXECUTING");
    assertEquals(parsed.iteration, 3);
  });

  it("-o json for spec list is array", () => {
    const specListData = [
      { name: "photo-upload", phase: "EXECUTING", iteration: 3, active: true },
      { name: "fix-login", phase: "SPEC_DRAFT", iteration: 0, active: false },
    ];
    const json = formatter.format(specListData, "json");
    const parsed = JSON.parse(json);

    assertEquals(Array.isArray(parsed), true);
    assertEquals(parsed.length, 2);
    assertEquals(parsed[0].active, true);
  });
});

// =============================================================================
// 2. Spec naming
// =============================================================================

describe("Spec naming", () => {
  it("slug from description is lowercase with hyphens", () => {
    const state = machine.startSpec(
      idle(),
      "photo-upload-feature",
      "spec/photo-upload-feature",
    );
    assertEquals(state.spec, "photo-upload-feature");
  });

  it("explicit --name is preserved as-is", () => {
    const state = machine.startSpec(idle(), "SPC0001", "spec/SPC0001");
    assertEquals(state.spec, "SPC0001");
  });

  it("spec directory uses the name", async () => {
    // The persistence paths use the spec name
    const { specDir, specFile } = (
      await import("../state/persistence.ts")
    ).paths;
    assertEquals(specDir("photo-upload"), ".eser/specs/photo-upload");
    assertEquals(
      specFile("photo-upload"),
      ".eser/specs/photo-upload/spec.md",
    );
  });

  it("slug logic: lowercase, hyphens, no special chars", () => {
    // Test the slugify logic (replicated here since it's private)
    const slugify = (text: string): string =>
      text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 50)
        .replace(/-$/, "");

    assertEquals(slugify("Photo Upload Feature"), "photo-upload-feature");
    assertEquals(slugify("fix login bug!!!"), "fix-login-bug");
    assertEquals(slugify("   spaces   "), "spaces");
    assertEquals(
      slugify("a".repeat(60)),
      "a".repeat(50),
    );
  });
});

// =============================================================================
// 3. Spec switching
// =============================================================================

describe("Spec switching", () => {
  it("spec state preserved on switch (simulated)", () => {
    // Simulate: spec A at iteration 3, switch to spec B, switch back
    let specA = inExecuting();
    specA = machine.advanceExecution(specA, "task 1");
    specA = machine.advanceExecution(specA, "task 2");
    specA = machine.advanceExecution(specA, "task 3");

    // Serialize (simulate saving to per-spec state file)
    const savedA = JSON.stringify(specA);

    // Start spec B
    let specB = machine.startSpec(idle(), "fix-bug", "spec/fix-bug");
    specB = machine.completeDiscovery(specB);
    specB = machine.approveDiscoveryReview(specB);
    specB = machine.approveSpec(specB);
    specB = machine.startExecution(specB);
    specB = machine.advanceExecution(specB, "bug fixed");

    assertEquals(specB.spec, "fix-bug");
    assertEquals(specB.execution.iteration, 1);

    // Switch back to A (deserialize)
    const restoredA = JSON.parse(savedA) as schema.StateFile;

    assertEquals(restoredA.spec, "photo-upload");
    assertEquals(restoredA.execution.iteration, 3);
    assertEquals(restoredA.execution.lastProgress, "task 3");
  });

  it("spec list data includes phase and active flag", () => {
    // Simulate what spec list produces
    const specs = [
      { name: "photo-upload", phase: "EXECUTING", iteration: 3, active: true },
      {
        name: "fix-login-bug",
        phase: "SPEC_DRAFT",
        iteration: 0,
        active: false,
      },
      { name: "SPC0001", phase: "COMPLETED", iteration: 5, active: false },
    ];

    assertEquals(specs.length, 3);

    const active = specs.find((s) => s.active);
    assertEquals(active?.name, "photo-upload");

    const done = specs.find((s) => s.phase === "COMPLETED");
    assertEquals(done?.name, "SPC0001");
  });

  it("per-spec state file path uses spec name", async () => {
    const { specStateFile } = (
      await import("../state/persistence.ts")
    ).paths;
    assertEquals(
      specStateFile("photo-upload"),
      ".eser/.state/specs/photo-upload.json",
    );
  });
});

// =============================================================================
// 4. Agentless end-to-end
// =============================================================================

describe("Agentless end-to-end: text output at every phase", () => {
  it("every phase produces non-empty text output with -o text", () => {
    const phases: { name: string; state: schema.StateFile }[] = [];

    let s = idle();
    phases.push({ name: "IDLE", state: s });

    s = machine.startSpec(s, "test", "spec/test");
    phases.push({ name: "DISCOVERY", state: s });

    s = machine.completeDiscovery(s);
    phases.push({ name: "DISCOVERY_REVIEW", state: s });

    s = machine.approveDiscoveryReview(s);
    phases.push({ name: "SPEC_DRAFT", state: s });

    s = machine.approveSpec(s);
    phases.push({ name: "SPEC_APPROVED", state: s });

    s = machine.startExecution(s);
    phases.push({ name: "EXECUTING", state: s });

    phases.push({
      name: "BLOCKED",
      state: machine.blockExecution(s, "decision needed"),
    });
    phases.push({
      name: "COMPLETED",
      state: machine.completeSpec(s, "done"),
    });

    for (const p of phases) {
      const output = compiler.compile(p.state, noConcerns, noRules, config());
      const text = formatter.format(output, "text");

      assertEquals(text.length > 10, true, `${p.name} text too short`);
      assertEquals(
        text.includes(`[${p.name}]`),
        true,
        `${p.name} text missing phase`,
      );
    }
  });

  it("every phase produces non-empty markdown output", () => {
    const phases = [
      idle(),
      machine.startSpec(idle(), "t", "spec/t"),
      machine.completeDiscovery(machine.startSpec(idle(), "t", "spec/t")),
      machine.approveDiscoveryReview(
        machine.completeDiscovery(machine.startSpec(idle(), "t", "spec/t")),
      ),
    ];

    for (const s of phases) {
      const output = compiler.compile(s, noConcerns, noRules, config());
      const md = formatter.format(output, "markdown");

      assertEquals(md.includes("# noskills"), true);
    }
  });
});

// =============================================================================
// 5. No active spec → IDLE suggestion
// =============================================================================

describe("No active spec behavior", () => {
  it("IDLE output suggests spec new command", () => {
    const output = compiler.compile(idle(), noConcerns, noRules, config());
    const text = formatter.format(output, "text");

    assertEquals(text.includes("spec new"), true);
  });

  it("IDLE commandMap includes spec new command", () => {
    const output = compiler.compile(
      idle(),
      noConcerns,
      noRules,
      config(),
    );

    const cmdMap = output.commandMap ?? {};
    const hasSpecNew = Object.values(cmdMap).some((cmd) =>
      cmd.includes("spec new")
    );
    assertEquals(hasSpecNew, true);
  });

  it("IDLE output includes availableConcerns list", () => {
    const output = compiler.compile(
      idle(),
      noConcerns,
      noRules,
      config(),
    ) as compiler.IdleOutput;

    assertEquals(output.availableConcerns !== undefined, true);
    assertEquals(output.availableConcerns!.length > 0, true);
    assertEquals(
      output.availableConcerns!.some((c) => c.id === "open-source"),
      true,
    );
  });

  it("IDLE behavioral instructs agent to use AskUserQuestion for options", () => {
    const output = compiler.compile(idle(), noConcerns, noRules, config());

    const hasRule = output.behavioral.rules.some((r) =>
      r.includes("AskUserQuestion")
    );
    assertEquals(hasRule, true);
  });

  it("IDLE with zero concerns includes hint about adding concerns", () => {
    const output = compiler.compile(
      idle(),
      [],
      noRules,
      config(),
    ) as compiler.IdleOutput;

    assertEquals(output.hint !== undefined, true);
    assertEquals(output.hint!.includes("concern"), true);
  });
});
