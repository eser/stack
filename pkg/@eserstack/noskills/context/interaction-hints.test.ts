// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * Tests for per-tool interaction hints in the compiler output.
 *
 * Verifies that behavioral rules adapt based on the active tool's
 * InteractionHints (AskUserQuestion vs numbered lists, sub-agent
 * delegation vs sequential execution).
 */

import { describe, it } from "@std/testing/bdd";
import { assertEquals } from "@std/assert";
import * as compiler from "./compiler.ts";
import * as schema from "../state/schema.ts";
import * as machine from "../state/machine.ts";
import * as engine from "../sync/engine.ts";
import type { InteractionHints } from "../sync/adapter.ts";
import { claudeCodeAdapter } from "../sync/adapters/claude-code.ts";
import { kiroAdapter } from "../sync/adapters/kiro.ts";
import { cursorAdapter } from "../sync/adapters/cursor.ts";
import { copilotAdapter } from "../sync/adapters/copilot.ts";
import { windsurfAdapter } from "../sync/adapters/windsurf.ts";

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

describe("Adapter interaction hints", () => {
  it("Claude Code adapter has hasAskUserTool: true", () => {
    assertEquals(
      claudeCodeAdapter.capabilities.interaction.hasAskUserTool,
      true,
    );
  });

  it("Claude Code adapter has optionPresentation: tool", () => {
    assertEquals(
      claudeCodeAdapter.capabilities.interaction.optionPresentation,
      "tool",
    );
  });

  it("Claude Code adapter has subAgentMethod: task", () => {
    assertEquals(
      claudeCodeAdapter.capabilities.interaction.subAgentMethod,
      "task",
    );
  });

  it("Kiro adapter has hasAskUserTool: false", () => {
    assertEquals(kiroAdapter.capabilities.interaction.hasAskUserTool, false);
  });

  it("Kiro adapter has optionPresentation: prose", () => {
    assertEquals(
      kiroAdapter.capabilities.interaction.optionPresentation,
      "prose",
    );
  });

  it("Kiro adapter has subAgentMethod: delegation", () => {
    assertEquals(
      kiroAdapter.capabilities.interaction.subAgentMethod,
      "delegation",
    );
  });

  it("Kiro adapter has hasSubAgentDelegation: true", () => {
    assertEquals(
      kiroAdapter.capabilities.interaction.hasSubAgentDelegation,
      true,
    );
  });

  it("Cursor adapter has hasAskUserTool: false", () => {
    assertEquals(cursorAdapter.capabilities.interaction.hasAskUserTool, false);
  });

  it("Cursor adapter has subAgentMethod: none", () => {
    assertEquals(cursorAdapter.capabilities.interaction.subAgentMethod, "none");
  });

  it("Cursor adapter has hasSubAgentDelegation: false", () => {
    assertEquals(
      cursorAdapter.capabilities.interaction.hasSubAgentDelegation,
      false,
    );
  });

  it("Copilot adapter has subAgentMethod: none", () => {
    assertEquals(
      copilotAdapter.capabilities.interaction.subAgentMethod,
      "none",
    );
  });

  it("Windsurf adapter has subAgentMethod: none", () => {
    assertEquals(
      windsurfAdapter.capabilities.interaction.subAgentMethod,
      "none",
    );
  });
});

// =============================================================================
// 2. resolveInteractionHints
// =============================================================================

describe("resolveInteractionHints", () => {
  it("resolves claude-code tool to AskUserQuestion hints", () => {
    const hints = engine.resolveInteractionHints(["claude-code"]);
    assertEquals(hints.hasAskUserTool, true);
    assertEquals(hints.optionPresentation, "tool");
    assertEquals(hints.subAgentMethod, "task");
  });

  it("resolves kiro tool to prose hints", () => {
    const hints = engine.resolveInteractionHints(["kiro"]);
    assertEquals(hints.hasAskUserTool, false);
    assertEquals(hints.optionPresentation, "prose");
    assertEquals(hints.subAgentMethod, "delegation");
  });

  it("resolves cursor tool to prose hints with no sub-agents", () => {
    const hints = engine.resolveInteractionHints(["cursor"]);
    assertEquals(hints.hasAskUserTool, false);
    assertEquals(hints.subAgentMethod, "none");
  });

  it("uses first tool when multiple are configured", () => {
    const hints = engine.resolveInteractionHints(["kiro", "claude-code"]);
    assertEquals(hints.hasAskUserTool, false);
    assertEquals(hints.optionPresentation, "prose");
  });

  it("falls back to Claude Code defaults when no tools configured", () => {
    const hints = engine.resolveInteractionHints([]);
    assertEquals(hints.hasAskUserTool, true);
    assertEquals(hints.optionPresentation, "tool");
    assertEquals(hints.subAgentMethod, "task");
  });
});

// =============================================================================
// 3. Compiler with Claude Code hints → behavioral rules contain AskUserQuestion
// =============================================================================

describe("Compiler with Claude Code hints", () => {
  it("IDLE rules mention AskUserQuestion", async () => {
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
      r.includes("AskUserQuestion")
    );
    assertEquals(has, true);
  });

  it("IDLE rules do NOT mention numbered list", async () => {
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
      r.includes("numbered list")
    );
    assertEquals(has, false);
  });

  it("DISCOVERY rules mention AskUserQuestion", async () => {
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
      r.includes("AskUserQuestion")
    );
    assertEquals(has, true);
  });

  it("EXECUTING rules mention Agent tool for sub-agents", async () => {
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
    assertEquals(has, true);
  });

  it("EXECUTING rules do NOT mention sequential execution", async () => {
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
      r.includes("Execute tasks sequentially")
    );
    assertEquals(has, false);
  });
});

// =============================================================================
// 4. Compiler with Kiro hints → behavioral rules contain numbered list
// =============================================================================

describe("Compiler with Kiro hints", () => {
  it("IDLE rules mention numbered list", async () => {
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
      r.includes("numbered list")
    );
    assertEquals(has, true);
  });

  it("IDLE rules do NOT mention AskUserQuestion for options", async () => {
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
    const optionRule = output.behavioral.rules.find((r) =>
      r.includes("numbered list") || r.includes("decision point")
    );
    assertEquals(optionRule !== undefined, true);
    assertEquals(optionRule!.includes("AskUserQuestion"), false);
  });

  it("DISCOVERY rules do NOT mention AskUserQuestion tool", async () => {
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
    // The question-asking rule should use text, not AskUserQuestion
    const questionRule = output.behavioral.rules.find((r) =>
      r.includes("question") && r.includes("as text")
    );
    assertEquals(questionRule !== undefined, true);
    assertEquals(questionRule!.includes("AskUserQuestion"), false);
  });

  it("EXECUTING rules mention Kiro delegation", async () => {
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
    const has = output.behavioral.rules.some((r) =>
      r.includes("Kiro") && r.includes("delegation")
    );
    assertEquals(has, true);
  });

  it("EXECUTING rules do NOT mention Agent tool", async () => {
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
    assertEquals(has, false);
  });
});

// =============================================================================
// 5. Compiler with Cursor hints → sequential execution, no sub-agents
// =============================================================================

describe("Compiler with Cursor hints", () => {
  it("EXECUTING rules say execute sequentially", async () => {
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
      r.includes("Execute tasks sequentially")
    );
    assertEquals(has, true);
  });

  it("EXECUTING rules say do not spawn sub-agents", async () => {
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
      r.includes("Execute tasks sequentially yourself") ||
      r.includes("does not support agent delegation")
    );
    assertEquals(has, true);
  });

  it("EXECUTING rules do NOT mention Agent tool or delegation", async () => {
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
      r.includes("Agent tool")
    );
    const hasDelegation = output.behavioral.rules.some((r) =>
      r.includes("Kiro's agent delegation")
    );
    assertEquals(hasAgent, false);
    assertEquals(hasDelegation, false);
  });

  it("IDLE rules mention numbered list (not AskUserQuestion)", async () => {
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
      r.includes("numbered list")
    );
    const hasAsk = output.behavioral.rules.some((r) =>
      r.includes("AskUserQuestion") && r.includes("options")
    );
    assertEquals(hasNumbered, true);
    assertEquals(hasAsk, false);
  });
});

// =============================================================================
// 6. interactiveOptions present regardless of tool
// =============================================================================

describe("interactiveOptions always present for programmatic access", () => {
  it("IDLE with Claude Code hints has interactiveOptions", async () => {
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
    assertEquals(output.interactiveOptions !== undefined, true);
    assertEquals(output.interactiveOptions!.length > 0, true);
  });

  it("IDLE with Kiro hints has interactiveOptions", async () => {
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
    assertEquals(output.interactiveOptions !== undefined, true);
    assertEquals(output.interactiveOptions!.length > 0, true);
  });

  it("IDLE with Cursor hints has interactiveOptions", async () => {
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
    assertEquals(output.interactiveOptions !== undefined, true);
    assertEquals(output.interactiveOptions!.length > 0, true);
  });

  it("commandMap present alongside interactiveOptions", async () => {
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
    assertEquals(output.commandMap !== undefined, true);
  });
});

// =============================================================================
// 7. Default behavior (no hints passed) matches Claude Code
// =============================================================================

describe("Default hints (backward compat)", () => {
  it("compile without hints uses Claude Code defaults", async () => {
    const output = await compiler.compile(idle(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) =>
      r.includes("AskUserQuestion")
    );
    assertEquals(has, true);
  });

  it("EXECUTING without hints uses Agent tool delegation", async () => {
    const output = await compiler.compile(inExecuting(), noConcerns, noRules);
    const has = output.behavioral.rules.some((r) => r.includes("Agent tool"));
    assertEquals(has, true);
  });
});
