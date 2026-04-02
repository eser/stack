// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `codebase commitmsg` — Generate a commit message from git diff using AI.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as streams from "@eser/streams";
import * as span from "@eser/streams/span";
import * as shellExec from "@eser/shell/exec";
import type * as shellArgs from "@eser/shell/args";
import * as ai from "@eser/ai/mod";
import type * as workflows from "@eser/workflows/mod";

// =============================================================================
// System Prompt
// =============================================================================

const SYSTEM_PROMPT = `Output ONLY a conventional commit message. Nothing else.

STRICT RULES:
- One line only. Max 72 characters.
- Format: type(scope): description
- Types: feat, fix, chore, docs, refactor, test, style, perf, ci, build
- No body. No explanation. No markdown. No code blocks. No bullet points.
- No quotes. No backticks. No decorative formatting. No insight blocks.
- No preamble. No commentary. Just the commit message line.

Example of correct output (the ENTIRE response is this one line):
feat(ai): add streaming support for Claude Code adapter`;

// =============================================================================
// Main
// =============================================================================

export const main = async (
  _args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const out = streams.output({
    renderer: streams.renderers.ansi(),
    sink: streams.sinks.stdout(),
  });

  try {
    // Get git diff (staged first, fall back to unstaged)
    let diff = await shellExec.exec`git diff --cached`.noThrow().text();

    if (diff.length === 0) {
      diff = await shellExec.exec`git diff`.noThrow().text();
    }

    if (diff.length === 0) {
      out.writeln(
        span.dim("No changes detected (nothing staged or modified)."),
      );
      await out.close();

      return results.ok(undefined);
    }

    const message = await generateCommitMessage(diff);

    // Escape shell-special characters inside double quotes:
    // " → \"   backtick → \`   $ → \$   ! → \!   \ → \\
    const escaped = message
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/`/g, "\\`")
      .replace(/\$/g, "\\$")
      .replace(/!/g, "\\!");

    out.writeln("");
    out.writeln(span.bold("Plain Format:"));
    out.writeln("```");
    out.writeln(message);
    out.writeln("```");
    out.writeln("");
    out.writeln(span.bold("Shell Command:"));
    out.writeln("```");
    out.writeln(`git commit -m "${escaped}"`);
    out.writeln("```");
    out.writeln("");
    out.writeln(span.bold("Copy to Clipboard:"));
    out.writeln("```");
    out.writeln(`echo "${escaped}" | pbcopy`);
    out.writeln("```");
    await out.close();

    return results.ok(undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    out.writeln(span.red(`Error: ${message}`));
    await out.close();

    return results.fail({ message, exitCode: 1 });
  }
};

// =============================================================================
// Direct AI usage (for programmatic consumers and workflow tools)
// =============================================================================

export const generateCommitMessage = async (
  diff: string,
  providerName?: string,
): Promise<string> => {
  // Build a minimal registry with auto-detected provider
  const adapters = await import("@eser/ai/adapters");
  const factories = await adapters.defaultFactories();

  const registry = new ai.Registry({ factories });

  // Determine provider
  let provider = providerName;
  if (provider === undefined) {
    // Try claude-code first
    try {
      const code = await shellExec.exec`which claude`.noThrow().code();
      if (code === 0) {
        provider = "claude-code";
      }
    } catch {
      // Not found
    }
  }

  if (provider === undefined) {
    provider = "anthropic"; // fallback to API
  }

  const model = "default";
  await registry.addModel("default", { provider, model });

  const languageModel = registry.getDefault();
  if (languageModel === null) {
    throw new Error("No AI model available for commit message generation");
  }

  const result = await languageModel.generateText({
    system: SYSTEM_PROMPT,
    messages: [
      ai.textMessage(
        "user",
        `Generate a commit message for this diff:\n\n${diff}`,
      ),
    ],
    maxTokens: 256,
  });

  await registry.close();

  return ai.text(result).trim();
};

// =============================================================================
// Workflow Tool
// =============================================================================

export const workflowTool: workflows.WorkflowTool = {
  name: "ai-commitmsg",
  description: "Generate commit message from git diff using AI",
  run: async (options): Promise<workflows.WorkflowToolResult> => {
    try {
      const provider = options["provider"] as string | undefined;

      let diff = await shellExec.exec`git diff --cached`.noThrow().text();
      if (diff.length === 0) {
        diff = await shellExec.exec`git diff`.noThrow().text();
      }

      if (diff.length === 0) {
        return {
          name: "ai-commitmsg",
          passed: true,
          issues: [],
          mutations: [],
          stats: { skipped: 1 } as Record<string, number>,
        };
      }

      const message = await generateCommitMessage(diff, provider);

      return {
        name: "ai-commitmsg",
        passed: true,
        issues: [{ message: `Suggested: ${message}` }],
        mutations: [],
        stats: { generated: 1 } as Record<string, number>,
      };
    } catch (err) {
      return {
        name: "ai-commitmsg",
        passed: false,
        issues: [{ message: err instanceof Error ? err.message : String(err) }],
        mutations: [],
        stats: { errors: 1 } as Record<string, number>,
      };
    }
  },
};

// =============================================================================
// Standalone execution
// =============================================================================

if (import.meta.main) {
  const { runCliMain, createCliOutput } = await import("./cli-support.ts");
  const out = createCliOutput();
  const result = await main();
  runCliMain(result, out);
  await out.close();
}
