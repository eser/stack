// Copyright 2023-present Eser Ozvataf and other contributors. All rights reserved. Apache-2.0 license.

/**
 * `ai ask` — Send a prompt to an AI provider and stream the response.
 *
 * @module
 */

import * as results from "@eserstack/primitives/results";
import { runtime } from "@eserstack/standards/cross-runtime";
import * as streams from "@eserstack/streams";
import * as logging from "@eserstack/logging";
import * as shellEnv from "@eserstack/shell/env";
import type * as shellArgs from "@eserstack/shell/args";
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
  // detect.ts:94 registers this alias and `ai list` prints it; without the entry
  // here `ai ask -p kr` rejected an alias the CLI had just advertised.
  kr: "kiro",
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
    const stderrWriter = runtime.process.stderr.getWriter();

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

  // 1. Check for claude binary.
  //
  // hasExecutable walks PATH in-process. `which` cost a subprocess per probe,
  // does not exist on Windows, and -- because the shared exec path goes through
  // the Go native library, which caches the environment it loaded with -- could
  // not see a PATH exported afterwards.
  if (await shellEnv.hasExecutable("claude")) {
    await log.info("Claude Code detected.");
    return "claude-code";
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
  if (await shellEnv.hasExecutable("opencode")) {
    await log.info("OpenCode detected.");
    return "opencode";
  }

  // 4. Check env vars for API providers
  if (runtime.capabilities.env) {
    if (
      runtime.env.has("ANTHROPIC_API_KEY") ||
      runtime.env.has("ANTHROPIC_AUTH_TOKEN")
    ) {
      await log.info("Anthropic API key detected.");
      return "anthropic";
    }
    if (runtime.env.has("OPENAI_API_KEY")) {
      await log.info("OpenAI API key detected.");
      return "openai";
    }
  }

  throw new Error(
    "No AI provider detected. Install claude, ollama, or set ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN / OPENAI_API_KEY.",
  );
};

// =============================================================================
// Factory Loader
// =============================================================================

// Delegates to the adapters barrel rather than switching over the TS adapters
// directly, which is what this used to do -- and which meant `ai ask` silently
// never used the Go bridge for any provider, however the rest of the package
// was configured. factoryFor applies the same bridge-first preference as
// defaultFactories while still importing only the one adapter it needs.
const loadFactory = async (
  providerName: string,
): Promise<import("../model.ts").ProviderFactory> => {
  const { factoryFor } = await import("../adapters/mod.ts");

  const factory = await factoryFor(providerName);

  if (factory === undefined) {
    throw new Error(`Unknown provider: ${providerName}`);
  }

  return factory;
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
      const generateResult = await model.generateText({
        messages,
        maxTokens: maxTokensFlag ?? undefined,
      });

      if (results.isFail(generateResult)) {
        await log.error(generateResult.error.message);
        return results.fail({
          message: generateResult.error.message,
          exitCode: 1,
        });
      }

      const result = generateResult.value;

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
      const writer = runtime.process.stdout.getWriter();
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
        const writer = runtime.process.stdout.getWriter();

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

// Two rules govern this table.
//
// Aliased IDs, never dated snapshots. A snapshot ("claude-sonnet-4-20250514")
// is frozen at the day it was typed and silently rots into a model nobody meant
// to pin -- which is how every entry here fell several releases behind. An alias
// tracks the current release of its tier. Pin a snapshot in config when
// reproducibility matters; that is what `--model` and ConfigTarget.Model are for.
//
// The BALANCED tier, not the flagship. These are the models a user gets for
// simply typing `eser ai ask`, so cost and latency matter more than peak
// capability, and anyone who wants the flagship can name it. That is why this is
// claude-sonnet-5 rather than claude-opus-5, and gpt-5.6-terra rather than
// gpt-5.6-sol -- note OpenAI's own deprecation page names sol (not terra) as the
// successor to gpt-4o, so this deliberately trades a little capability for the
// ~2.5x lower cost of the balanced tier.
//
// Avoid family-level floating aliases such as bare "gpt-5.6": it currently
// resolves to the flagship sol, and the vendor can silently repoint it to a
// future model, changing cost and behaviour with no change here. The per-tier
// IDs below are stable and undated, so they give the alias benefit without that.
const getDefaultModel = (providerName: string): string => {
  switch (providerName) {
    case "claude-code":
      return "claude-sonnet-5";
    case "ollama":
      return "llama3";
    case "opencode":
      return "default";
    case "kiro":
      return "default";
    case "anthropic":
      return "claude-sonnet-5";
    case "openai":
      return "gpt-5.6-terra";
    // Gemini 3.6 Flash is Google's own documented replacement for the retired
    // gemini-2.0-flash, and Vertex takes the same bare ID as the Gemini API for
    // GA models. Note this generation silently IGNORES temperature/topP rather
    // than erroring -- the Google adapters send those two and nothing else, so
    // no request breaks, but a user-supplied --temperature has no effect here.
    case "gemini":
      return "gemini-3.6-flash";
    case "vertexai":
      return "gemini-3.6-flash";
    default:
      return "default";
  }
};
