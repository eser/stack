// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `runPostsAgent` — a self-contained agentic loop that lets a language model
 * control @eserstack/posts operations via tool calls.
 *
 * The model receives all 13 post-management tools and converses until it
 * produces a text-only turn (no more tool calls) or exhausts `maxTurns`.
 * Each tool call is dispatched through `createToolCallTrigger`, which runs the
 * matching bound handler and feeds the result back as a tool-result message.
 *
 * Follows the @eserstack/functions `Result<T, E>` pattern — never throws.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import * as ai from "@eserstack/ai/mod";
import type { BoundTriggers } from "../../application/wiring.ts";
import { postToolDefinitions } from "./tool-definitions.ts";
import { createToolCallTrigger } from "./triggers.ts";

// ── Options ──────────────────────────────────────────────────────────────────

export type RunPostsAgentOptions = {
  /** The language model to use for conversation. Must support tool_calling. */
  readonly model: ai.LanguageModel;
  /** Pre-bound post handlers — produced by `createBoundTriggers(ctx)`. */
  readonly bound: BoundTriggers;
  /** System prompt injected before the user message. */
  readonly system?: string;
  /** Maximum tool-call/response turns before giving up. Default: 10. */
  readonly maxTurns?: number;
};

// ── Agent loop ───────────────────────────────────────────────────────────────

/**
 * Run a posts agent that responds to a user prompt by invoking tools as needed.
 *
 * Returns `ok(string)` with the final assistant text when the model produces
 * a text-only turn.
 * Returns `fail(Error)` if generation fails or `maxTurns` is exceeded.
 */
export const runPostsAgent = async (
  prompt: string,
  options: RunPostsAgentOptions,
): Promise<results.Result<string, ai.AiError | Error>> => {
  const { model, bound, system, maxTurns = 10 } = options;
  const toolCallTrigger = createToolCallTrigger(bound);

  const messages: ai.Message[] = [
    ai.textMessage("user", prompt),
  ];

  for (let turn = 0; turn < maxTurns; turn++) {
    const genOptions: ai.GenerateTextOptions = {
      messages,
      tools: postToolDefinitions,
      ...(system !== undefined ? { system } : {}),
    };

    // deno-lint-ignore no-await-in-loop
    const genResult = await model.generateText(genOptions);
    if (results.isFail(genResult)) return genResult;

    const result = genResult.value;
    const calls = ai.toolCalls(result);

    if (calls.length === 0) {
      // No tool calls — the model has finished reasoning, return final text.
      return results.ok(ai.text(result));
    }

    // Append the assistant turn (may include both text and tool_call blocks).
    messages.push({ role: "assistant", content: result.content });

    // Execute each tool call sequentially and append tool-result messages.
    for (const call of calls) {
      // deno-lint-ignore no-await-in-loop
      const toolResponse = await toolCallTrigger({
        name: call.name,
        arguments: call.arguments,
        callId: call.id,
      });

      messages.push(
        ai.toolResultMessage(
          call.id,
          JSON.stringify(toolResponse.content),
          toolResponse.isError ?? false,
        ),
      );
    }
  }

  return results.fail(
    new Error(`Posts agent exceeded ${maxTurns} turns without finishing`),
  );
};
