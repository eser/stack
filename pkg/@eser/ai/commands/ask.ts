// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `ai ask` — Send a prompt to an AI provider and stream the response.
 *
 * @module
 */

import * as results from "@eser/primitives/results";
import * as standardsRuntime from "@eser/standards/runtime";
import * as streams from "@eser/streams";
import * as logging from "@eser/logging";
import * as shellExec from "@eser/shell/exec";
import type * as shellArgs from "@eser/shell/args";
import { Registry } from "../registry.ts";
import * as aiStreams from "../streams/mod.ts";
import * as content from "../content.ts";
import * as generationHelpers from "../generation.ts";

// =============================================================================
// Provider Aliases
// =============================================================================

const PROVIDER_ALIASES: Readonly<Record<string, string>> = {
  cc: "claude-code",
  ol: "ollama",
  oc: "opencode",
  oai: "openai",
  ant: "anthropic",
  gem: "gemini",
  vtx: "vertexai",
};

const PROVIDER_DISPLAY_NAMES: Readonly<Record<string, string>> = {
  "claude-code": "Claude Code",
  ollama: "Ollama",
  opencode: "OpenCode",
  kiro: "Kiro",
  anthropic: "Anthropic API",
  openai: "OpenAI API",
  gemini: "Gemini API",
  vertexai: "Vertex AI",
};

const resolveAlias = (name: string): string => {
  return PROVIDER_ALIASES[name] ?? name;
};

// =============================================================================
// Logging Setup
// =============================================================================

const setupLogging = async (
  verbose: boolean,
): Promise<logging.logger.Logger> => {
  if (verbose) {
    const { current } = standardsRuntime;
    const stderrWriter = current.process.stderr.getWriter();

    const errOut = streams.output({
      renderer: streams.renderers.ansi(),
      sink: streams.sinks.writable(
        new WritableStream({
          async write(chunk) {
            await stderrWriter.write(
              new TextEncoder().encode(String(chunk.data)),
            );
          },
          close() {
            stderrWriter.releaseLock();
          },
        }),
      ),
    });

    await logging.config.configure({
      sinks: {
        stderr: logging.sinks.getOutputSink(errOut),
      },
      loggers: [
        {
          category: ["ai"],
          lowestLevel: logging.Severities.Debug,
          sinks: ["stderr"],
        },
      ],
    });
  }

  return logging.logger.getLogger(["ai", "ask"]);
};

// =============================================================================
// Auto-detect Provider
// =============================================================================

const detectProvider = async (log: logging.logger.Logger): Promise<string> => {
  await log.info("Auto-detecting AI provider...");

  // 1. Check for claude binary
  try {
    const code = await shellExec.exec`which claude`.noThrow().code();
    if (code === 0) {
      await log.info("Claude Code detected.");
      return "claude-code";
    }
  } catch {
    // Not found
  }

  // 2. Check for ollama at localhost
  try {
    const response = await fetch("http://localhost:11434/api/version", {
      signal: AbortSignal.timeout(1000),
    });
    if (response.ok) {
      await log.info("Ollama detected at localhost:11434.");
      return "ollama";
    }
  } catch {
    // Not reachable
  }

  // 3. Check for opencode binary
  try {
    const code = await shellExec.exec`which opencode`.noThrow().code();
    if (code === 0) {
      await log.info("OpenCode detected.");
      return "opencode";
    }
  } catch {
    // Not found
  }

  // 4. Check env vars for API providers
  const { current } = standardsRuntime;

  if (current.capabilities.env) {
    if (current.env.has("ANTHROPIC_API_KEY")) {
      await log.info("Anthropic API key detected.");
      return "anthropic";
    }
    if (current.env.has("OPENAI_API_KEY")) {
      await log.info("OpenAI API key detected.");
      return "openai";
    }
  }

  throw new Error(
    "No AI provider detected. Install claude, ollama, or set ANTHROPIC_API_KEY / OPENAI_API_KEY.",
  );
};

// =============================================================================
// Factory Loader
// =============================================================================

const loadFactory = async (
  providerName: string,
): Promise<import("../model.ts").ProviderFactory> => {
  switch (providerName) {
    case "claude-code": {
      const mod = await import("../adapters/claude-code.ts");
      return mod.claudeCodeFactory;
    }
    case "ollama": {
      const mod = await import("../adapters/ollama.ts");
      return mod.ollamaFactory;
    }
    case "opencode": {
      const mod = await import("../adapters/opencode.ts");
      return mod.openCodeFactory;
    }
    case "kiro": {
      const mod = await import("../adapters/kiro.ts");
      return mod.kiroFactory;
    }
    case "anthropic": {
      const mod = await import("../adapters/anthropic.ts");
      return mod.anthropicFactory;
    }
    case "openai": {
      const mod = await import("../adapters/openai.ts");
      return mod.openaiFactory;
    }
    case "gemini": {
      const mod = await import("../adapters/gemini.ts");
      return mod.geminiFactory;
    }
    case "vertexai": {
      const mod = await import("../adapters/vertexai.ts");
      return mod.vertexaiFactory;
    }
    default: {
      throw new Error(`Unknown provider: ${providerName}`);
    }
  }
};

// =============================================================================
// Main
// =============================================================================

export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const parsedArgs = args ?? [];

  // Parse flags
  let providerFlag: string | null = null;
  let modelFlag: string | null = null;
  let maxTokensFlag: number | null = null;
  let jsonMode = false;
  let verbose = false;
  const promptParts: string[] = [];

  let i = 0;
  while (i < parsedArgs.length) {
    const arg = parsedArgs[i]!;

    if (arg === "-p" || arg === "--provider") {
      providerFlag = parsedArgs[i + 1] ?? null;
      i += 2;
      continue;
    }
    if (arg === "-m" || arg === "--model") {
      modelFlag = parsedArgs[i + 1] ?? null;
      i += 2;
      continue;
    }
    if (arg === "--max-tokens") {
      const val = parsedArgs[i + 1];
      if (val !== undefined) {
        maxTokensFlag = Number(val);
      }
      i += 2;
      continue;
    }
    if (arg === "--json") {
      jsonMode = true;
      i += 1;
      continue;
    }
    if (arg === "-v" || arg === "--verbose") {
      verbose = true;
      i += 1;
      continue;
    }
    if (!arg.startsWith("-")) {
      promptParts.push(arg);
    }
    i += 1;
  }

  const promptText = promptParts.join(" ");

  if (promptText.length === 0) {
    return results.fail({
      message:
        'Usage: ai ask "your prompt" [-p provider] [-m model] [--verbose]',
      exitCode: 1,
    });
  }

  const log = await setupLogging(verbose);

  try {
    // Resolve provider
    const providerName = providerFlag !== null
      ? resolveAlias(providerFlag)
      : await detectProvider(log);

    const displayName = PROVIDER_DISPLAY_NAMES[providerName] ?? providerName;
    const modelId = modelFlag ?? getDefaultModel(providerName);

    await log.info(`Using ${displayName} (${modelId})`);

    // Load factory and create model
    const factory = await loadFactory(providerName);
    const registry = new Registry({ factories: [factory] });

    await registry.addModel("default", {
      provider: providerName,
      model: modelId,
    });

    const model = registry.getDefault();

    if (model === null) {
      return results.fail({
        message: "Failed to initialize model",
        exitCode: 1,
      });
    }

    const messages = [content.textMessage("user", promptText)];
    await log.info(`Sending prompt (${promptText.length} chars)...`);

    if (jsonMode) {
      // Non-streaming: get full result as JSON
      const result = await model.generateText({
        messages,
        maxTokens: maxTokensFlag ?? undefined,
      });

      await log.info(
        `Response received (${generationHelpers.text(result).length} chars)`,
      );

      const stdOut = streams.output({ sink: streams.sinks.stdout() });
      stdOut.writeln(JSON.stringify(result, null, 2));
      await stdOut.close();
    } else {
      // Streaming: pipe text deltas through typewriter sink
      const source = aiStreams.aiTextSource(model, {
        messages,
        maxTokens: maxTokensFlag ?? undefined,
      });

      await streams.pipeline()
        .from(source)
        .to(typewriterSink())
        .run();

      // Newline after stream
      const writer = standardsRuntime.current.process.stdout.getWriter();
      await writer.write(new TextEncoder().encode("\n"));
      writer.releaseLock();
    }

    await registry.close();

    return results.ok(undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await log.error(message);

    if (verbose && err instanceof Error && err.cause !== undefined) {
      await log.debug(`Cause: ${String(err.cause)}`);
    }

    return results.fail({ message, exitCode: 1 });
  }
};

// =============================================================================
// Typewriter Sink
// =============================================================================

const CHAR_DELAY_MS = 12;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const typewriterSink = (
  delayMs: number = CHAR_DELAY_MS,
): streams.Sink<string> => {
  const encoder = new TextEncoder();

  return {
    name: "typewriter",
    writable: new WritableStream<streams.Chunk<string>>({
      async write(chunk) {
        const text = String(chunk.data);
        const writer = standardsRuntime.current.process.stdout.getWriter();

        for (const char of text) {
          await writer.write(encoder.encode(char));
          await sleep(delayMs);
        }

        writer.releaseLock();
      },
    }),
  };
};

// =============================================================================
// Default Models
// =============================================================================

const getDefaultModel = (providerName: string): string => {
  switch (providerName) {
    case "claude-code":
      return "claude-sonnet-4-20250514";
    case "ollama":
      return "llama3";
    case "opencode":
      return "default";
    case "kiro":
      return "default";
    case "anthropic":
      return "claude-sonnet-4-20250514";
    case "openai":
      return "gpt-4o";
    case "gemini":
      return "gemini-2.0-flash";
    case "vertexai":
      return "gemini-2.0-flash";
    default:
      return "default";
  }
};
