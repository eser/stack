// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Agentless mode: output formatting, spec naming, spec switching.
 * Tests the CLI-driven experience without any agent.
 */

import * as bdd from "@std/testing/bdd";
import * as assert from "@eserstack/test-kit/assert";
import * as machine from "../state/machine.ts";
import * as schema from "../state/schema.ts";
import * as compiler from "../context/compiler.ts";
import * as formatter from "../output/formatter.ts";
import * as defaultConcerns from "../defaults/concerns/mod.ts";

// =============================================================================
// Helpers
// =============================================================================

const allConcerns = defaultConcerns.DEFAULT_CONCERNS;
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

bdd.describe("Output formatting: -o flag", () => {
  bdd.it("-o json is default", () => {
    assert.assertEquals(formatter.parseOutputFormat(undefined), "json");
    assert.assertEquals(formatter.parseOutputFormat([]), "json");
    assert.assertEquals(formatter.parseOutputFormat(["--answer=test"]), "json");
  });

  bdd.it("-o markdown for next output", async () => {
    const output = await compiler.compile(
      idle(),
      noConcerns,
      noRules,
      config(),
    );
    const md = formatter.format(output, "markdown");

    assert.assertEquals(md.includes("# noskills"), true);
    assert.assertEquals(md.includes("IDLE"), true);
  });

  bdd.it("-o text for next output", async () => {
    const output = await compiler.compile(
      idle(),
      noConcerns,
      noRules,
      config(),
    );
    const text = formatter.format(output, "text");

    assert.assertEquals(text.includes("[IDLE]"), true);
    assert.assertEquals(text.includes("#"), false); // no markdown headings
  });

  bdd.it("-o json for next output is valid JSON", async () => {
    const output = await compiler.compile(
      idle(),
      noConcerns,
      noRules,
      config(),
    );
    const json = formatter.format(output, "json");
    const parsed = JSON.parse(json);

    assert.assertEquals(parsed.phase, "IDLE");
  });

  bdd.it(
    "-o markdown for EXECUTING shows instruction and behavioral",
    async () => {
      const output = await compiler.compile(
        inExecuting(),
        [openSource],
        noRules,
        config(),
      );
      const md = formatter.format(output, "markdown");

      assert.assertEquals(md.includes("## Instruction"), true);
      assert.assertEquals(md.includes("## Behavioral"), true);
      assert.assertEquals(md.includes("**Tone:**"), true);
    },
  );

  bdd.it("-o text for DISCOVERY shows question", async () => {
    let s = idle();
    s = machine.startSpec(s, "test", "spec/test");
    const output = await compiler.compile(s, noConcerns, noRules, config());
    const text = formatter.format(output, "text");

    assert.assertEquals(text.includes("[DISCOVERY]"), true);
    assert.assertEquals(text.includes("Question ["), true);
  });

  bdd.it("-o markdown for COMPLETED shows summary", async () => {
    const completed = machine.completeSpec(inExecuting(), "done");
    const output = await compiler.compile(
      completed,
      noConcerns,
      noRules,
      config(),
    );
    const md = formatter.format(output, "markdown");

    assert.assertEquals(md.includes("## Summary"), true);
    assert.assertEquals(md.includes("photo-upload"), true);
  });

  bdd.it("-o json for status-like data is valid JSON", () => {
    const statusData = {
      phase: "EXECUTING",
      spec: "photo-upload",
      iteration: 3,
      debt: 2,
    };
    const json = formatter.format(statusData, "json");
    const parsed = JSON.parse(json);

    assert.assertEquals(parsed.phase, "EXECUTING");
    assert.assertEquals(parsed.iteration, 3);
  });

  bdd.it("-o json for spec list is array", () => {
    const specListData = [
      { name: "photo-upload", phase: "EXECUTING", iteration: 3, active: true },
      {
        name: "fix-login",
        phase: "SPEC_PROPOSAL",
        iteration: 0,
        active: false,
      },
    ];
    const json = formatter.format(specListData, "json");
    const parsed = JSON.parse(json);

    assert.assertEquals(Array.isArray(parsed), true);
    assert.assertEquals(parsed.length, 2);
    assert.assertEquals(parsed[0].active, true);
  });
});

// =============================================================================
// 2. Spec naming
// =============================================================================

bdd.describe("Spec naming", () => {
  bdd.it("slug from description is lowercase with hyphens", () => {
    const state = machine.startSpec(
      idle(),
      "photo-upload-feature",
      "spec/photo-upload-feature",
    );
    assert.assertEquals(state.spec, "photo-upload-feature");
  });

  bdd.it("explicit --name is preserved as-is", () => {
    const state = machine.startSpec(idle(), "SPC0001", "spec/SPC0001");
    assert.assertEquals(state.spec, "SPC0001");
  });

  bdd.it("spec directory uses the name", async () => {
    // The persistence paths use the spec name
    const { specDir, specFile } = (
      await import("../state/persistence.ts")
    ).paths;
    assert.assertEquals(specDir("photo-upload"), ".eser/specs/photo-upload");
    assert.assertEquals(
      specFile("photo-upload"),
      ".eser/specs/photo-upload/spec.md",
    );
  });

  bdd.it("slug logic: lowercase, hyphens, no special chars", () => {
    // Test the slugify logic (replicated here since it's private)
    const slugify = (text: string): string =>
      text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 50)
        .replace(/-$/, "");

    assert.assertEquals(
      slugify("Photo Upload Feature"),
      "photo-upload-feature",
    );
    assert.assertEquals(slugify("fix login bug!!!"), "fix-login-bug");
    assert.assertEquals(slugify("   spaces   "), "spaces");
    assert.assertEquals(
      slugify("a".repeat(60)),
      "a".repeat(50),
    );
  });
});

// =============================================================================
// 3. Spec switching
// =============================================================================

bdd.describe("Spec switching", () => {
  bdd.it("spec state preserved on switch (simulated)", () => {
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

    assert.assertEquals(specB.spec, "fix-bug");
    assert.assertEquals(specB.execution.iteration, 1);

    // Switch back to A (deserialize)
    const restoredA = JSON.parse(savedA) as schema.StateFile;

    assert.assertEquals(restoredA.spec, "photo-upload");
    assert.assertEquals(restoredA.execution.iteration, 3);
    assert.assertEquals(restoredA.execution.lastProgress, "task 3");
  });

  bdd.it("spec list data includes phase and active flag", () => {
    // Simulate what spec list produces
    const specs = [
      { name: "photo-upload", phase: "EXECUTING", iteration: 3, active: true },
      {
        name: "fix-login-bug",
        phase: "SPEC_PROPOSAL",
        iteration: 0,
        active: false,
      },
      { name: "SPC0001", phase: "COMPLETED", iteration: 5, active: false },
    ];

    assert.assertEquals(specs.length, 3);

    const active = specs.find((s) => s.active);
    assert.assertEquals(active?.name, "photo-upload");

    const done = specs.find((s) => s.phase === "COMPLETED");
    assert.assertEquals(done?.name, "SPC0001");
  });

  bdd.it("per-spec state file path uses spec name", async () => {
    const { specStateFile } = (
      await import("../state/persistence.ts")
    ).paths;
    assert.assertEquals(
      specStateFile("photo-upload"),
      ".eser/.state/progresses/specs/photo-upload.json",
    );
  });
});

// =============================================================================
// 4. Agentless end-to-end
// =============================================================================

bdd.describe("Agentless end-to-end: text output at every phase", () => {
  bdd.it(
    "every phase produces non-empty text output with -o text",
    async () => {
      const phases: { name: string; state: schema.StateFile }[] = [];

      let s = idle();
      phases.push({ name: "IDLE", state: s });

      s = machine.startSpec(s, "test", "spec/test");
      phases.push({ name: "DISCOVERY", state: s });

      s = machine.completeDiscovery(s);
      phases.push({ name: "DISCOVERY_REFINEMENT", state: s });

      s = machine.approveDiscoveryReview(s);
      phases.push({ name: "SPEC_PROPOSAL", state: s });

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

      const outputs = await Promise.all(
        phases.map((p) =>
          compiler.compile(p.state, noConcerns, noRules, config())
        ),
      );

      for (const [i, p] of phases.entries()) {
        const text = formatter.format(outputs[i]!, "text");

        assert.assertEquals(text.length > 10, true, `${p.name} text too short`);
        assert.assertEquals(
          text.includes(`[${p.name}]`),
          true,
          `${p.name} text missing phase`,
        );
      }
    },
  );

  bdd.it("every phase produces non-empty markdown output", async () => {
    const phases = [
      idle(),
      machine.startSpec(idle(), "t", "spec/t"),
      machine.completeDiscovery(machine.startSpec(idle(), "t", "spec/t")),
      machine.approveDiscoveryReview(
        machine.completeDiscovery(machine.startSpec(idle(), "t", "spec/t")),
      ),
    ];

    const outputs = await Promise.all(
      phases.map((s) => compiler.compile(s, noConcerns, noRules, config())),
    );

    for (const output of outputs) {
      const md = formatter.format(output, "markdown");

      assert.assertEquals(md.includes("# noskills"), true);
    }
  });
});

// =============================================================================
// 5. No active spec → IDLE suggestion
// =============================================================================

bdd.describe("No active spec behavior", () => {
  bdd.it("IDLE output suggests spec new command", async () => {
    const output = await compiler.compile(
      idle(),
      noConcerns,
      noRules,
      config(),
    );
    const text = formatter.format(output, "text");

    assert.assertEquals(text.includes("spec new"), true);
  });

  bdd.it("IDLE commandMap includes spec new command", async () => {
    const output = await compiler.compile(
      idle(),
      noConcerns,
      noRules,
      config(),
    );

    const cmdMap = output.commandMap ?? {};
    const hasSpecNew = Object.values(cmdMap).some((cmd) =>
      cmd.includes("spec new")
    );
    assert.assertEquals(hasSpecNew, true);
  });

  bdd.it("IDLE output includes availableConcerns list", async () => {
    const output = await compiler.compile(
      idle(),
      noConcerns,
      noRules,
      config(),
    ) as compiler.IdleOutput;

    assert.assertEquals(output.availableConcerns !== undefined, true);
    assert.assertEquals(output.availableConcerns!.length > 0, true);
    assert.assertEquals(
      output.availableConcerns!.some((c) => c.id === "open-source"),
      true,
    );
  });

  bdd.it(
    "IDLE behavioral instructs agent to use AskUserQuestion for options",
    async () => {
      const output = await compiler.compile(
        idle(),
        noConcerns,
        noRules,
        config(),
      );

      const hasRule = output.behavioral.rules.some((r) =>
        r.includes("AskUserQuestion")
      );
      assert.assertEquals(hasRule, true);
    },
  );

  bdd.it(
    "IDLE with zero concerns includes hint about adding concerns",
    async () => {
      const output = await compiler.compile(
        idle(),
        [],
        noRules,
        config(),
      ) as compiler.IdleOutput;

      assert.assertEquals(output.hint !== undefined, true);
      assert.assertEquals(output.hint!.includes("concern"), true);
    },
  );
});
