// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for per-tool interaction hints in the compiler output.
 *
 * Verifies that behavioral rules adapt based on the active tool's
 * InteractionHints (AskUserQuestion vs numbered lists, sub-agent
 * delegation vs sequential execution).
 */

import * as bdd from "node:test";
import * as assert from "@eserstack/test-kit/assert";
import * as compiler from "./compiler.ts";
import * as schema from "../state/schema.ts";
import * as machine from "../state/machine.ts";
import * as questions from "./questions.ts";
import * as engine from "../sync/engine.ts";
import type { InteractionHints } from "../sync/adapter.ts";
import * as claudeCode from "../sync/adapters/claude-code.ts";
import * as kiro from "../sync/adapters/kiro.ts";
import * as cursor from "../sync/adapters/cursor.ts";
import * as copilot from "../sync/adapters/copilot.ts";
import * as windsurf from "../sync/adapters/windsurf.ts";
import * as defaultConcerns from "../defaults/concerns/mod.ts";

// =============================================================================
// Helpers
// =============================================================================

const noRules: readonly string[] = [];
const noConcerns: readonly schema.ConcernDefinition[] = [];

const CLAUDE_CODE_HINTS: InteractionHints = {
  hasAskUserTool: true,
  optionPresentation: "tool",
  hasSubAgentDelegation: true,
  subAgentMethod: "task",
};

const KIRO_HINTS: InteractionHints = {
  hasAskUserTool: false,
  optionPresentation: "prose",
  hasSubAgentDelegation: true,
  subAgentMethod: "delegation",
};

const CURSOR_HINTS: InteractionHints = {
  hasAskUserTool: false,
  optionPresentation: "prose",
  hasSubAgentDelegation: false,
  subAgentMethod: "none",
};

const idle = (): schema.StateFile => schema.createInitialState();

const inDiscovery = (): schema.StateFile =>
  machine.startSpec(idle(), "test-spec", "spec/test-spec");

const inDiscoveryReview = (): schema.StateFile =>
  machine.completeDiscovery(inDiscovery());

const inSpecDraft = (): schema.StateFile =>
  machine.approveDiscoveryReview(inDiscoveryReview());

const inSpecApproved = (): schema.StateFile =>
  machine.approveSpec(inSpecDraft());

const inExecuting = (): schema.StateFile =>
  machine.startExecution(inSpecApproved());

// =============================================================================
// 1. Adapter capabilities have correct interaction hints
// =============================================================================

bdd.describe("Adapter interaction hints", () => {
  bdd.it("Claude Code adapter has hasAskUserTool: true", () => {
    assert.assertEquals(
      claudeCode.claudeCodeAdapter.capabilities.interaction.hasAskUserTool,
      true,
    );
  });

  bdd.it("Claude Code adapter has optionPresentation: tool", () => {
    assert.assertEquals(
      claudeCode.claudeCodeAdapter.capabilities.interaction.optionPresentation,
      "tool",
    );
  });

  bdd.it("Claude Code adapter has subAgentMethod: task", () => {
    assert.assertEquals(
      claudeCode.claudeCodeAdapter.capabilities.interaction.subAgentMethod,
      "task",
    );
  });

  bdd.it("Kiro adapter has hasAskUserTool: false", () => {
    assert.assertEquals(
      kiro.kiroAdapter.capabilities.interaction.hasAskUserTool,
      false,
    );
  });

  bdd.it("Kiro adapter has optionPresentation: prose", () => {
    assert.assertEquals(
      kiro.kiroAdapter.capabilities.interaction.optionPresentation,
      "prose",
    );
  });

  bdd.it("Kiro adapter has subAgentMethod: delegation", () => {
    assert.assertEquals(
      kiro.kiroAdapter.capabilities.interaction.subAgentMethod,
      "delegation",
    );
  });

  bdd.it("Kiro adapter has hasSubAgentDelegation: true", () => {
    assert.assertEquals(
      kiro.kiroAdapter.capabilities.interaction.hasSubAgentDelegation,
      true,
    );
  });

  bdd.it("Cursor adapter has hasAskUserTool: false", () => {
    assert.assertEquals(
      cursor.cursorAdapter.capabilities.interaction.hasAskUserTool,
      false,
    );
  });

  bdd.it("Cursor adapter has subAgentMethod: none", () => {
    assert.assertEquals(
      cursor.cursorAdapter.capabilities.interaction.subAgentMethod,
      "none",
    );
  });

  bdd.it("Cursor adapter has hasSubAgentDelegation: false", () => {
    assert.assertEquals(
      cursor.cursorAdapter.capabilities.interaction.hasSubAgentDelegation,
      false,
    );
  });

  bdd.it("Copilot adapter has subAgentMethod: none", () => {
    assert.assertEquals(
      copilot.copilotAdapter.capabilities.interaction.subAgentMethod,
      "none",
    );
  });

  bdd.it("Windsurf adapter has subAgentMethod: none", () => {
    assert.assertEquals(
      windsurf.windsurfAdapter.capabilities.interaction.subAgentMethod,
      "none",
    );
  });
});

// =============================================================================
// 2. resolveInteractionHints
// =============================================================================

bdd.describe("resolveInteractionHints", () => {
  bdd.it("resolves claude-code tool to AskUserQuestion hints", () => {
    const hints = engine.resolveInteractionHints(["claude-code"]);
    assert.assertEquals(hints.hasAskUserTool, true);
    assert.assertEquals(hints.optionPresentation, "tool");
    assert.assertEquals(hints.subAgentMethod, "task");
  });

  bdd.it("resolves kiro tool to prose hints", () => {
    const hints = engine.resolveInteractionHints(["kiro"]);
    assert.assertEquals(hints.hasAskUserTool, false);
    assert.assertEquals(hints.optionPresentation, "prose");
    assert.assertEquals(hints.subAgentMethod, "delegation");
  });

  bdd.it("resolves cursor tool to prose hints with no sub-agents", () => {
    const hints = engine.resolveInteractionHints(["cursor"]);
    assert.assertEquals(hints.hasAskUserTool, false);
    assert.assertEquals(hints.subAgentMethod, "none");
  });

  bdd.it("uses first tool when multiple are configured", () => {
    const hints = engine.resolveInteractionHints(["kiro", "claude-code"]);
    assert.assertEquals(hints.hasAskUserTool, false);
    assert.assertEquals(hints.optionPresentation, "prose");
  });

  bdd.it("falls back to Claude Code defaults when no tools configured", () => {
    const hints = engine.resolveInteractionHints([]);
    assert.assertEquals(hints.hasAskUserTool, true);
    assert.assertEquals(hints.optionPresentation, "tool");
    assert.assertEquals(hints.subAgentMethod, "task");
  });
});

// =============================================================================
// 3. Compiler with Claude Code hints → behavioral rules contain AskUserQuestion
// =============================================================================

bdd.describe("Compiler with Claude Code hints", () => {
  bdd.it("IDLE rules mention AskUserQuestion", async () => {
    const output = await compiler.compile(
      idle(),
      noConcerns,
      noRules,
      undefined,
      undefined,
      undefined,
      undefined,
      CLAUDE_CODE_HINTS,
    );
    const has = output.behavioral.rules.some((r) =>
      r.includes("AskUserQuestion"),
    );
    assert.assertEquals(has, true);
  });

  bdd.it("IDLE rules do NOT mention numbered list", async () => {
    const output = await compiler.compile(
      idle(),
      noConcerns,
      noRules,
      undefined,
      undefined,
      undefined,
      undefined,
      CLAUDE_CODE_HINTS,
    );
    const has = output.behavioral.rules.some((r) =>
      r.includes("numbered list"),
    );
    assert.assertEquals(has, false);
  });

  bdd.it("DISCOVERY rules mention AskUserQuestion", async () => {
    const output = await compiler.compile(
      inDiscovery(),
      noConcerns,
      noRules,
      undefined,
      undefined,
      undefined,
      undefined,
      CLAUDE_CODE_HINTS,
    );
    const has = output.behavioral.rules.some((r) =>
      r.includes("AskUserQuestion"),
    );
    assert.assertEquals(has, true);
  });

  bdd.it("EXECUTING rules mention Agent tool for sub-agents", async () => {
    const output = await compiler.compile(
      inExecuting(),
      noConcerns,
      noRules,
      undefined,
      undefined,
      undefined,
      undefined,
      CLAUDE_CODE_HINTS,
    );
    const has = output.behavioral.rules.some((r) => r.includes("Agent tool"));
    assert.assertEquals(has, true);
  });

  bdd.it("EXECUTING rules do NOT mention sequential execution", async () => {
    const output = await compiler.compile(
      inExecuting(),
      noConcerns,
      noRules,
      undefined,
      undefined,
      undefined,
      undefined,
      CLAUDE_CODE_HINTS,
    );
    const has = output.behavioral.rules.some((r) =>
      r.includes("Execute tasks sequentially"),
    );
    assert.assertEquals(has, false);
  });
});

// =============================================================================
// 4. Compiler with Kiro hints → behavioral rules contain numbered list
// =============================================================================

bdd.describe("Compiler with Kiro hints", () => {
  bdd.it("IDLE rules mention numbered list", async () => {
    const output = await compiler.compile(
      idle(),
      noConcerns,
      noRules,
      undefined,
      undefined,
      undefined,
      undefined,
      KIRO_HINTS,
    );
    const has = output.behavioral.rules.some((r) =>
      r.includes("numbered list"),
    );
    assert.assertEquals(has, true);
  });

  bdd.it("IDLE rules do NOT mention AskUserQuestion for options", async () => {
    const output = await compiler.compile(
      idle(),
      noConcerns,
      noRules,
      undefined,
      undefined,
      undefined,
      undefined,
      KIRO_HINTS,
    );
    // The decision point rule should use numbered list, not AskUserQuestion
    const optionRule = output.behavioral.rules.find(
      (r) => r.includes("numbered list") || r.includes("decision point"),
    );
    assert.assertEquals(optionRule !== undefined, true);
    assert.assertEquals(optionRule!.includes("AskUserQuestion"), false);
  });

  bdd.it("DISCOVERY rules do NOT mention AskUserQuestion tool", async () => {
    const output = await compiler.compile(
      inDiscovery(),
      noConcerns,
      noRules,
      undefined,
      undefined,
      undefined,
      undefined,
      KIRO_HINTS,
    );
    // The question-asking rule should use a message, not AskUserQuestion
    const questionRule = output.behavioral.rules.find(
      (r) => r.includes("base questions") && r.includes("as a numbered list"),
    );
    assert.assertEquals(questionRule !== undefined, true);
    assert.assertEquals(questionRule!.includes("AskUserQuestion"), false);
  });

  bdd.it("EXECUTING rules mention Kiro delegation", async () => {
    const output = await compiler.compile(
      inExecuting(),
      noConcerns,
      noRules,
      undefined,
      undefined,
      undefined,
      undefined,
      KIRO_HINTS,
    );
    const has = output.behavioral.rules.some(
      (r) => r.includes("Kiro") && r.includes("delegation"),
    );
    assert.assertEquals(has, true);
  });

  bdd.it("EXECUTING rules do NOT mention Agent tool", async () => {
    const output = await compiler.compile(
      inExecuting(),
      noConcerns,
      noRules,
      undefined,
      undefined,
      undefined,
      undefined,
      KIRO_HINTS,
    );
    const has = output.behavioral.rules.some((r) => r.includes("Agent tool"));
    assert.assertEquals(has, false);
  });
});

// =============================================================================
// 5. Compiler with Cursor hints → sequential execution, no sub-agents
// =============================================================================

bdd.describe("Compiler with Cursor hints", () => {
  bdd.it("EXECUTING rules say execute sequentially", async () => {
    const output = await compiler.compile(
      inExecuting(),
      noConcerns,
      noRules,
      undefined,
      undefined,
      undefined,
      undefined,
      CURSOR_HINTS,
    );
    const has = output.behavioral.rules.some((r) =>
      r.includes("Execute tasks sequentially"),
    );
    assert.assertEquals(has, true);
  });

  bdd.it("EXECUTING rules say do not spawn sub-agents", async () => {
    const output = await compiler.compile(
      inExecuting(),
      noConcerns,
      noRules,
      undefined,
      undefined,
      undefined,
      undefined,
      CURSOR_HINTS,
    );
    const has = output.behavioral.rules.some(
      (r) =>
        r.includes("Execute tasks sequentially yourself") ||
        r.includes("does not support agent delegation"),
    );
    assert.assertEquals(has, true);
  });

  bdd.it(
    "EXECUTING rules do NOT mention Agent tool or delegation",
    async () => {
      const output = await compiler.compile(
        inExecuting(),
        noConcerns,
        noRules,
        undefined,
        undefined,
        undefined,
        undefined,
        CURSOR_HINTS,
      );
      const hasAgent = output.behavioral.rules.some((r) =>
        r.includes("Agent tool"),
      );
      const hasDelegation = output.behavioral.rules.some((r) =>
        r.includes("Kiro's agent delegation"),
      );
      assert.assertEquals(hasAgent, false);
      assert.assertEquals(hasDelegation, false);
    },
  );

  bdd.it("IDLE rules mention numbered list (not AskUserQuestion)", async () => {
    const output = await compiler.compile(
      idle(),
      noConcerns,
      noRules,
      undefined,
      undefined,
      undefined,
      undefined,
      CURSOR_HINTS,
    );
    const hasNumbered = output.behavioral.rules.some((r) =>
      r.includes("numbered list"),
    );
    const hasAsk = output.behavioral.rules.some(
      (r) => r.includes("AskUserQuestion") && r.includes("options"),
    );
    assert.assertEquals(hasNumbered, true);
    assert.assertEquals(hasAsk, false);
  });
});

// =============================================================================
// 6. interactiveOptions present regardless of tool
// =============================================================================

bdd.describe(
  "interactiveOptions always present for programmatic access",
  () => {
    bdd.it("IDLE with Claude Code hints has interactiveOptions", async () => {
      const output = await compiler.compile(
        idle(),
        noConcerns,
        noRules,
        undefined,
        undefined,
        undefined,
        undefined,
        CLAUDE_CODE_HINTS,
      );
      assert.assertEquals(output.interactiveOptions !== undefined, true);
      assert.assertEquals(output.interactiveOptions!.length > 0, true);
    });

    bdd.it("IDLE with Kiro hints has interactiveOptions", async () => {
      const output = await compiler.compile(
        idle(),
        noConcerns,
        noRules,
        undefined,
        undefined,
        undefined,
        undefined,
        KIRO_HINTS,
      );
      assert.assertEquals(output.interactiveOptions !== undefined, true);
      assert.assertEquals(output.interactiveOptions!.length > 0, true);
    });

    bdd.it("IDLE with Cursor hints has interactiveOptions", async () => {
      const output = await compiler.compile(
        idle(),
        noConcerns,
        noRules,
        undefined,
        undefined,
        undefined,
        undefined,
        CURSOR_HINTS,
      );
      assert.assertEquals(output.interactiveOptions !== undefined, true);
      assert.assertEquals(output.interactiveOptions!.length > 0, true);
    });

    bdd.it("commandMap present alongside interactiveOptions", async () => {
      const output = await compiler.compile(
        idle(),
        noConcerns,
        noRules,
        undefined,
        undefined,
        undefined,
        undefined,
        KIRO_HINTS,
      );
      assert.assertEquals(output.commandMap !== undefined, true);
    });
  },
);

// =============================================================================
// 7. Default behavior (no hints passed) matches Claude Code
// =============================================================================

bdd.describe("Default hints (backward compat)", () => {
  bdd.it("compile without hints uses Claude Code defaults", async () => {
    const output = await compiler.compile(idle(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("AskUserQuestion"),
    );
    assert.assertEquals(has, true);
  });

  bdd.it("EXECUTING without hints uses Agent tool delegation", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) => r.includes("Agent tool"));
    assert.assertEquals(has, true);
  });
});

// =============================================================================
// 8. A tool without AskUserQuestion or a plan-mode key is never told to use
//    them, in any phase or sub-phase
// =============================================================================

bdd.describe("Compiler output for a tool without AskUserQuestion", () => {
  const withConcerns = defaultConcerns.DEFAULT_CONCERNS;

  const inAgentDiscovery = (): schema.StateFile => {
    const state = inDiscovery();
    return { ...state, discovery: { ...state.discovery, audience: "agent" } };
  };

  // Every base question answered, one follow-up pending: the follow-up step.
  const inAgentFollowUp = (): schema.StateFile => {
    let state = inAgentDiscovery();
    for (const q of questions.QUESTIONS) {
      state = machine.addDiscoveryAnswer(
        state,
        q.id,
        `Answer for ${q.id} in full`,
      );
    }
    return machine.addFollowUp(
      state,
      "status_quo",
      "How often does that happen?",
      "agent",
    );
  };

  // Answers approved, alternatives not yet presented: the alternatives step.
  const inAlternatives = (): schema.StateFile => {
    const state = inDiscoveryReview();
    return {
      ...state,
      discovery: {
        ...state.discovery,
        approved: true,
        alternativesPresented: false,
      },
    };
  };

  const cases: readonly {
    readonly name: string;
    readonly state: () => schema.StateFile;
    // The text a tool with AskUserQuestion gets here, so the case is known
    // to reach the gated string.
    readonly claudeCodeText: string;
  }[] = [
    {
      name: "IDLE spec creation and concern rules",
      state: idle,
      claudeCodeText: "'What do you want to build?' via AskUserQuestion",
    },
    {
      name: "DISCOVERY read-only rule",
      state: inDiscovery,
      claudeCodeText: "ask the user to switch (Shift+Tab)",
    },
    {
      name: "DISCOVERY agent-mode questions",
      state: inAgentDiscovery,
      claudeCodeText: "6 discovery questions together through AskUserQuestion",
    },
    {
      name: "DISCOVERY follow-up",
      state: inAgentFollowUp,
      claudeCodeText: "as the only question of an AskUserQuestion call",
    },
    {
      name: "DISCOVERY_REFINEMENT review and checklist",
      state: inDiscoveryReview,
      claudeCodeText: "for each dimension via AskUserQuestion",
    },
    {
      name: "DISCOVERY_REFINEMENT alternatives",
      state: inAlternatives,
      claudeCodeText: "Present via AskUserQuestion.",
    },
    {
      name: "SPEC_PROPOSAL rules",
      state: inSpecDraft,
      claudeCodeText: "ask the user to switch (Shift+Tab)",
    },
    {
      name: "SPEC_APPROVED rules",
      state: inSpecApproved,
      claudeCodeText: "final confirmation via AskUserQuestion",
    },
  ];

  const compileWith = (
    state: schema.StateFile,
    hints: InteractionHints,
  ): Promise<compiler.NextOutput> =>
    compiler.compile(
      state,
      withConcerns,
      noRules,
      undefined,
      undefined,
      undefined,
      undefined,
      hints,
    );

  for (const { name, state, claudeCodeText } of cases) {
    bdd.it(`${name}: Claude Code gets the tool-specific text`, async () => {
      const text = JSON.stringify(
        await compileWith(
          state(),
          claudeCode.claudeCodeAdapter.capabilities.interaction,
        ),
      );
      assert.assertStringIncludes(text, claudeCodeText);
    });

    for (const toolAdapter of [cursor.cursorAdapter, kiro.kiroAdapter]) {
      bdd.it(
        `${name}: ${toolAdapter.id} gets no AskUserQuestion or Shift+Tab`,
        async () => {
          const text = JSON.stringify(
            await compileWith(state(), toolAdapter.capabilities.interaction),
          );
          assert.assertEquals(text.includes("AskUserQuestion"), false);
          assert.assertEquals(text.includes("Shift+Tab"), false);
        },
      );
    }
  }

  bdd.it(
    "the read-only rule still applies without a plan-mode key",
    async () => {
      const output = await compileWith(inDiscovery(), CURSOR_HINTS);
      assert.assertEquals(
        output.behavioral.rules.filter((r) =>
          r.startsWith("This phase is read-only:"),
        ).length,
        1,
      );
    },
  );
});
