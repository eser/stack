// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Section 7: Behavioral Guardrails
 * Tests that behavioral rules are phase-correct and contain required constraints.
 */

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as crossRuntime from "@eserstack/standards/cross-runtime";
import * as compiler from "./compiler.ts";
import * as machine from "../state/machine.ts";
import * as schema from "../state/schema.ts";
import * as defaultConcerns from "../defaults/concerns/mod.ts";
import * as cmd from "../output/cmd.ts";
import * as discoveryAnswers from "./discovery-answers.ts";
import * as next from "../commands/next.ts";

// =============================================================================
// Helpers
// =============================================================================

const allConcerns = defaultConcerns.DEFAULT_CONCERNS;
const noRules: readonly string[] = [];
const noConcerns: readonly schema.ConcernDefinition[] = [];
const openSource = allConcerns.find((c) => c.id === "open-source")!;

const idle = (): schema.StateFile => schema.createInitialState();

const inDiscovery = (): schema.StateFile =>
  machine.startSpec(idle(), "test-spec", "spec/test-spec");

const inExecuting = (): schema.StateFile => {
  const s = machine.startSpec(
    schema.createInitialState(),
    "test-spec",
    "spec/test-spec",
  );
  const sd = machine.completeDiscovery(s);
  const sdr = machine.approveDiscoveryReview(sd);
  const sa = machine.approveSpec(sdr);
  return machine.startExecution(sa);
};

const inBlocked = (): schema.StateFile =>
  machine.blockExecution(inExecuting(), "need decision");

const inCompleted = (): schema.StateFile =>
  machine.completeSpec(inExecuting(), "done");

const config15 = schema.createInitialManifest([], [], [], {
  languages: [],
  frameworks: [],
  ci: [],
  testRunner: null,
});

// =============================================================================
// 7.1 EXECUTING behavioral includes anti-exploration rules
// =============================================================================

bdd.describe("EXECUTING behavioral guardrails", () => {
  bdd.it("includes anti-exploration rule", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);
    const hasAntiExplore = output.behavioral.rules.some((r) =>
      r.includes("Do not explore"),
    );
    assert.assertEquals(hasAntiExplore, true);
  });

  bdd.it("includes no-refactor rule", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);
    const hasNoRefactor = output.behavioral.rules.some((r) =>
      r.includes("Do not refactor"),
    );
    assert.assertEquals(hasNoRefactor, true);
  });

  bdd.it("includes no-unasked-features rule", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("Do not add features"),
    );
    assert.assertEquals(has, true);
  });

  bdd.it("keeps work inside the current task's scope", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("Do not refactor outside scope"),
    );
    assert.assertEquals(has, true);
  });
});

// =============================================================================
// 7.2 EXECUTING tone
// =============================================================================

bdd.describe("EXECUTING tone", () => {
  bdd.it("says 'Orchestrate immediately'", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);
    assert.assertEquals(
      output.behavioral.tone.includes("Orchestrate immediately"),
      true,
    );
  });
});

// =============================================================================
// 7.3 DISCOVERY behavioral
// =============================================================================

bdd.describe("DISCOVERY behavioral", () => {
  bdd.it("tone is curious interviewer with a stake", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    assert.assertEquals(
      output.behavioral.tone.includes("stake in the answers"),
      true,
    );
  });

  bdd.it("tone says comes PREPARED", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    assert.assertEquals(output.behavioral.tone.includes("PREPARED"), true);
  });

  bdd.it("has plan mode override", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    assert.assertEquals(output.behavioral.modeOverride !== undefined, true);
    assert.assertEquals(
      output.behavioral.modeOverride!.includes("plan mode"),
      true,
    );
  });

  bdd.it("blocks file writes", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("create or edit nothing"),
    );
    assert.assertEquals(has, true);
  });

  bdd.it("says push back on vague answers", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("Push back on vague"),
    );
    assert.assertEquals(has, true);
  });

  bdd.it("includes pre-discovery codebase scan rule", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("pre-discovery codebase scan"),
    );
    assert.assertEquals(has, true);
  });

  bdd.it("includes premise challenge rule", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("challenge the user's initial spec description"),
    );
    assert.assertEquals(has, true);
  });

  bdd.it("includes options over open-ended rule", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("offer concrete options"),
    );
    assert.assertEquals(has, true);
  });

  bdd.it("includes dream state framing rule", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some(
      (r) => r.includes("CURRENT STATE") && r.includes("6-MONTH IDEAL"),
    );
    assert.assertEquals(has, true);
  });

  bdd.it("includes expansion proposals with scoring rule", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some(
      (r) =>
        r.includes("expansion opportunities") &&
        r.includes("completeness delta"),
    );
    assert.assertEquals(has, true);
  });

  bdd.it("includes architectural decision resolution rule", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some(
      (r) =>
        r.includes("Architectural decisions") ||
        (r.includes("architectural decisions") && r.includes("RECOMMENDATION")),
    );
    assert.assertEquals(has, true);
  });

  bdd.it("includes error and rescue map rule", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some(
      (r) =>
        r.includes("Error/rescue map") ||
        (r.includes("error") && r.includes("CRITICAL GAPS")),
    );
    assert.assertEquals(has, true);
  });

  bdd.it("includes post-discovery synthesis rule", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some(
      (r) => r.includes("DISCOVERY SUMMARY") || r.includes("confirmation"),
    );
    assert.assertEquals(has, true);
  });

  bdd.it("blocks state-modifying shell commands", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("run nothing that changes state"),
    );
    assert.assertEquals(has, true);
  });

  bdd.it("allows read-only commands", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some(
      (r) => r.includes("read files") && r.includes("read-only commands"),
    );
    assert.assertEquals(has, true);
  });

  bdd.it(
    "asks the base questions together and each follow-up on its own",
    async () => {
      const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
      const rules = output.behavioral.rules;

      assert.assertEquals(
        rules.filter((r) => r === discoveryAnswers.discoveryQuestionRule())
          .length,
        1,
      );
      assert.assertEquals(
        rules.some(
          (r) =>
            r.includes("each follow-up in a call of its own") &&
            r.includes("as many as fit in each call (it takes up to 4)"),
        ),
        true,
      );
      assert.assertEquals(
        rules.some(
          (r) =>
            r.includes("ONE AT A TIME") || r.includes("One question per call"),
        ),
        false,
      );
    },
  );

  bdd.it(
    "registers follow-ups before the answers go in, then hands them out one at a time",
    async () => {
      const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
      const followUpRule = output.behavioral.rules.find((r) =>
        r.startsWith("Discovery questions are adaptive."),
      );

      assert.assertExists(followUpRule);
      assert.assertStringIncludes(
        followUpRule,
        "before you submit the answers",
      );
      assert.assertStringIncludes(
        followUpRule,
        "noskills then gives you the follow-ups one at a time",
      );
    },
  );

  bdd.it("includes vague answer pushback", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const has = output.behavioral.rules.some(
      (r) =>
        r.includes("vague") ||
        (r.includes("short answer") && r.includes("more specific")),
    );
    assert.assertEquals(has, true);
  });

  bdd.it("includes answer submission rule", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    // The submit command goes through the configured prefix and names the
    // spec, so it reads "<prefix> spec test-spec next --answer".
    const submit = cmd.cmd("spec test-spec next --answer");
    const answerRules = output.behavioral.rules.filter(
      (r) => r.includes(submit) && r.includes("transition.onComplete"),
    );
    assert.assertEquals(answerRules.length, 1);
    assert.assertStringIncludes(answerRules[0]!, "[STATED]");
    assert.assertStringIncludes(answerRules[0]!, "[INFERRED]");
    assert.assertStringIncludes(answerRules[0]!, "confirm");
  });

  bdd.it(
    "has no rule that forbids pre-filling or batch submission",
    async () => {
      const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
      const conflicting = output.behavioral.rules.filter(
        (r) =>
          r.includes("batch-submit") ||
          r.includes("Do NOT pre-fill") ||
          r.includes("One noskills call per interaction"),
      );
      assert.assertEquals(conflicting, []);
    },
  );

  bdd.it(
    "states the read-only rule once, not in several wordings",
    async () => {
      const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
      const readOnly = output.behavioral.rules.filter((r) =>
        r.includes("This phase is read-only"),
      );
      const repeats = output.behavioral.rules.filter((r) =>
        r.includes("DO NOT create, edit, or write any files"),
      );
      assert.assertEquals(readOnly.length, 1);
      assert.assertEquals(repeats, []);
      assert.assertEquals(output.behavioral.modeOverride, "plan mode");
    },
  );
});

// =============================================================================
// 7.4 BLOCKED behavioral
// =============================================================================

bdd.describe("BLOCKED behavioral", () => {
  bdd.it("says present decision as described", async () => {
    const output = await compiler.compile(inBlocked(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("exactly as described"),
    );
    assert.assertEquals(has, true);
  });

  bdd.it("says don't suggest preference unless asked", async () => {
    const output = await compiler.compile(inBlocked(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("Do not suggest"),
    );
    assert.assertEquals(has, true);
  });

  bdd.it("tone is Brief", async () => {
    const output = await compiler.compile(inBlocked(), noConcerns, noRules);
    assert.assertEquals(output.behavioral.tone.includes("Brief"), true);
  });

  bdd.it(
    "says how to submit the decision instead of 'Do not elaborate'",
    async () => {
      const output = await compiler.compile(inBlocked(), noConcerns, noRules);
      const submit = output.behavioral.rules.filter((r) =>
        r.includes(cmd.cmd("spec test-spec next --answer")),
      );
      assert.assertEquals(submit.length, 1);
      assert.assertEquals(
        output.behavioral.rules.some((r) => r.includes("Do not elaborate")),
        false,
      );
    },
  );
});

// =============================================================================
// 7.5 No iteration countdown for the agent
// =============================================================================

bdd.describe("No iteration countdown", () => {
  const atIteration = (count: number): schema.StateFile => {
    let state = inExecuting();
    for (let i = 0; i < count; i++) {
      state = machine.advanceExecution(state, `step ${i}`);
    }
    return state;
  };

  bdd.it(
    "iteration=15, threshold=15 → no urgency or restart prose",
    async () => {
      const output = await compiler.compile(
        atIteration(15),
        noConcerns,
        noRules,
        config15,
      );
      assert.assertEquals("urgency" in output.behavioral, false);
      assert.assertEquals("restartInstruction" in output, false);
      assert.assertEquals(
        output.behavioral.rules.some(
          (r) => r.includes("degrading") || r.includes("fresh session"),
        ),
        false,
      );
    },
  );

  bdd.it(
    "iteration=15, threshold=15 → restartRecommended flag stays",
    async () => {
      const output = (await compiler.compile(
        atIteration(15),
        noConcerns,
        noRules,
        config15,
      )) as compiler.ExecutionOutput;
      assert.assertEquals(output.restartRecommended, true);
    },
  );

  bdd.it("still tells the agent to work through the tasks", async () => {
    const output = await compiler.compile(
      atIteration(15),
      noConcerns,
      noRules,
      config15,
    );
    assert.assertEquals(
      output.behavioral.rules.some((r) =>
        r.includes("Work through the spec's tasks to the end"),
      ),
      true,
    );
  });
});

// =============================================================================
// 7.6 Git read-only rule
// =============================================================================

bdd.describe("Git read-only rule", () => {
  bdd.it("EXECUTING includes git read-only in behavioral rules", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);
    const hasGitRule = output.behavioral.rules.some((r) =>
      r.includes("git write commands"),
    );
    assert.assertEquals(hasGitRule, true);
  });

  bdd.it("DISCOVERY includes git read-only", async () => {
    const output = await compiler.compile(inDiscovery(), noConcerns, noRules);
    const hasGitRule = output.behavioral.rules.some((r) =>
      r.includes("git write commands"),
    );
    assert.assertEquals(hasGitRule, true);
  });

  bdd.it("git rule omitted when allowGit=true", async () => {
    const config = { ...config15, allowGit: true };
    const output = await compiler.compile(
      inExecuting(),
      noConcerns,
      noRules,
      config,
    );
    const hasGitRule = output.behavioral.rules.some((r) =>
      r.includes("git write commands"),
    );
    assert.assertEquals(hasGitRule, false);
  });
});

// =============================================================================
// 7.7 No "commit" in behavioral instructions
// =============================================================================

bdd.describe("No commit in behavioral", () => {
  bdd.it("EXECUTING behavioral rules do not tell agent to commit", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);

    for (const rule of output.behavioral.rules) {
      // "commit" as an action verb (not inside "git commit" which is a block)
      const lower = rule.toLowerCase();
      const hasCommitAction =
        lower.includes("then commit") ||
        lower.includes("make a commit") ||
        lower.includes("create a commit");
      assert.assertEquals(hasCommitAction, false);
    }
  });
});

// =============================================================================
// COMPLETED behavioral
// =============================================================================

bdd.describe("COMPLETED behavioral", () => {
  bdd.it("says report summary, do not start new work", async () => {
    const output = await compiler.compile(inCompleted(), noConcerns, noRules);
    const hasStop = output.behavioral.rules.some((r) =>
      r.includes("Do not start new work"),
    );
    assert.assertEquals(hasStop, true);
  });

  bdd.it("tone says Concise", async () => {
    const output = await compiler.compile(inCompleted(), noConcerns, noRules);
    assert.assertEquals(output.behavioral.tone.includes("Concise"), true);
  });
});

// =============================================================================
// Behavioral with active concerns
// =============================================================================

bdd.describe("Behavioral with concerns active", () => {
  bdd.it(
    "EXECUTING with open-source still includes all base rules",
    async () => {
      const output = await compiler.compile(
        inExecuting(),
        [openSource],
        noRules,
      );
      assert.assertEquals(output.behavioral.rules.length >= 6, true);
      assert.assertEquals(
        output.behavioral.rules.some((r) => r.includes("Do not explore")),
        true,
      );
    },
  );

  bdd.it("concern reminders appear in context, not behavioral", async () => {
    const output = await compiler.compile(inExecuting(), [openSource], noRules);
    const exec = output as compiler.ExecutionOutput;
    assert.assertEquals(exec.context.concernReminders.length > 0, true);
    assert.assertEquals(
      exec.context.concernReminders.some((r) => r.includes("open-source")),
      true,
    );
  });
});

// =============================================================================
// IDLE behavioral — AskUserQuestion format + concerns + user intent
// =============================================================================

bdd.describe("IDLE behavioral — AskUserQuestion, concerns, user intent", () => {
  bdd.it(
    "tells agent to pass interactiveOptions DIRECTLY and use commandMap",
    async () => {
      const output = await compiler.compile(idle(), noConcerns, noRules);
      const has = output.behavioral.rules.some((r) => r.includes("commandMap"));
      assert.assertEquals(has, true);
    },
  );

  bdd.it("tells agent to use multiSelect for concerns", async () => {
    const output = await compiler.compile(idle(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("multiSelect:true"),
    );
    assert.assertEquals(has, true);
  });

  bdd.it(
    "IDLE instruction — zero specs state — says ask what to build",
    async () => {
      // idle() creates a fresh state with no existing specs → zero-specs branch
      const output = await compiler.compile(idle(), noConcerns, noRules);
      const idleOutput = output as compiler.IdleOutput;
      assert.assertEquals(
        idleOutput.instruction.includes("What do you want to build"),
        true,
      );
    },
  );

  bdd.it("IDLE behavioral includes user intent rule", async () => {
    const output = await compiler.compile(idle(), noConcerns, noRules);
    const has = output.behavioral.rules.some(
      (r) =>
        r.includes("described a feature") ||
        r.includes("create a spec immediately") ||
        r.includes("Do NOT present menus"),
    );
    assert.assertEquals(has, true);
  });

  bdd.it("IDLE output phase is IDLE", async () => {
    const output = await compiler.compile(idle(), noConcerns, noRules);
    assert.assertEquals(output.phase, "IDLE");
  });
});

// =============================================================================
// DISCOVERY_REFINEMENT behavioral — split proposal rule
// =============================================================================

bdd.describe("DISCOVERY_REFINEMENT behavioral", () => {
  const inDiscoveryReview = (): schema.StateFile =>
    machine.completeDiscovery(inDiscovery());

  bdd.it("contains completeness assessment rule (stage-a)", async () => {
    const output = await compiler.compile(
      inDiscoveryReview(),
      noConcerns,
      noRules,
    );
    const has = output.behavioral.rules.some((r) =>
      r.includes("COMPLETENESS ASSESSMENT"),
    );
    assert.assertEquals(has, true);
  });

  bdd.it("contains the read-only rule once", async () => {
    const output = await compiler.compile(
      inDiscoveryReview(),
      noConcerns,
      noRules,
    );
    const readOnly = output.behavioral.rules.filter(
      (r) =>
        r.includes("This phase is read-only") &&
        r.includes("create or edit nothing"),
    );
    assert.assertEquals(readOnly.length, 1);
    assert.assertEquals(output.behavioral.modeOverride, "plan mode");
  });

  bdd.it("tone says 'Structured evaluator' in stage-a", async () => {
    const output = await compiler.compile(
      inDiscoveryReview(),
      noConcerns,
      noRules,
    );
    assert.assertEquals(
      output.behavioral.tone.includes("Structured evaluator"),
      true,
    );
  });
});

// =============================================================================
// EXECUTING behavioral — sub-agent (Issue 2) + fallback (E3)
// =============================================================================

bdd.describe("EXECUTING sub-agent behavioral rules", () => {
  bdd.it("includes sub-agent spawning rule", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);
    const has = output.behavioral.rules.some(
      (r) => r.includes("noskills-executor") || r.includes("sub-agent"),
    );
    assert.assertEquals(has, true);
  });

  bdd.it("includes sub-agent failure fallback rule", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);
    const has = output.behavioral.rules.some(
      (r) => r.includes("fall back") || r.includes("failure"),
    );
    assert.assertEquals(has, true);
  });
});

// =============================================================================
// DISCOVERY flow: base questions together, follow-ups one at a time
// =============================================================================

bdd.describe("DISCOVERY flow in agent mode", () => {
  const manifest = schema.createInitialManifest([], ["claude-code"], [], {
    languages: [],
    frameworks: [],
    ci: [],
    testRunner: null,
  });

  // Keys are the discovery question ids `next` takes, so they keep snake case.
  const baseAnswers = {
    status_quo: "Users email files to support and wait a day",
    ambition: "1-star: upload button; 10-star: drag and drop with previews",
    reversibility: "Nothing irreversible; uploads land in a new bucket",
    user_impact: "Existing users keep email and gain the upload page",
    verification: "Integration test that uploads a file and reads it back",
    scope_boundary: "No image editing and no admin moderation queue",
  };

  const discoveryOf = async (
    state: schema.StateFile,
  ): Promise<compiler.DiscoveryOutput> =>
    (await compiler.compile(
      state,
      noConcerns,
      noRules,
    )) as compiler.DiscoveryOutput;

  bdd.it(
    "takes the base answers in one call, then hands out each follow-up alone",
    async () => {
      const root = await crossRuntime.runtime.fs.makeTempDir({
        prefix: "nos_discovery_flow_",
      });
      try {
        let state: schema.StateFile = {
          ...inDiscovery(),
          discovery: { ...inDiscovery().discovery, audience: "agent" },
        };

        // 1. Every base question comes in one output.
        const first = await discoveryOf(state);
        assert.assertEquals(first.questions.length, 6);
        assert.assertStringIncludes(
          first.instruction,
          "6 discovery questions together",
        );

        // 2. The agent registers two follow-ups, then submits one JSON answer.
        state = machine.addFollowUp(
          state,
          "reversibility",
          "Which bucket policy makes a rollback safe?",
          "agent",
        );
        state = machine.addFollowUp(
          state,
          "verification",
          "Which file sizes does the test cover?",
          "agent",
        );
        state = await next.handleAnswer(
          root,
          state,
          manifest,
          noConcerns,
          JSON.stringify(baseAnswers),
        );
        assert.assertEquals(state.phase, "DISCOVERY");
        assert.assertEquals(state.discovery.answers.length, 6);

        // 3. The follow-ups come one per output.
        const second = await discoveryOf(state);
        assert.assertEquals(
          second.questions.map((q) => q.id),
          ["reversibilitya"],
        );
        state = machine.completeDiscoveryWhenReady(
          machine.answerFollowUp(
            state,
            "reversibilitya",
            "Versioned bucket, so old objects stay",
          ),
        );
        assert.assertEquals(state.phase, "DISCOVERY");

        const third = await discoveryOf(state);
        assert.assertEquals(
          third.questions.map((q) => q.id),
          ["verificationa"],
        );

        // 4. Settling the last follow-up completes discovery.
        state = machine.completeDiscoveryWhenReady(
          machine.skipFollowUp(state, "verificationa"),
        );
        assert.assertEquals(state.phase, "DISCOVERY_REFINEMENT");
      } finally {
        await crossRuntime.runtime.fs.remove(root, { recursive: true });
      }
    },
  );

  bdd.it(
    "completes discovery with the base answers when no follow-up is pending",
    async () => {
      const root = await crossRuntime.runtime.fs.makeTempDir({
        prefix: "nos_discovery_flow_",
      });
      try {
        const state: schema.StateFile = {
          ...inDiscovery(),
          discovery: { ...inDiscovery().discovery, audience: "agent" },
        };

        const result = await next.handleAnswer(
          root,
          state,
          manifest,
          noConcerns,
          JSON.stringify(baseAnswers),
        );

        assert.assertEquals(result.phase, "DISCOVERY_REFINEMENT");
      } finally {
        await crossRuntime.runtime.fs.remove(root, { recursive: true });
      }
    },
  );
});
