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
import type * as aiModel from "../model.ts";
import * as registry from "../registry.ts";
import * as aiStreams from "../streams/mod.ts";
import * as content from "../content.ts";
import * as generationHelpers from "../generation.ts";

// =============================================================================
// Provider Aliases
// =============================================================================

// Maps, so a name from the command line such as "constructor" finds no entry
// instead of an Object.prototype member.
const PROVIDER_ALIASES: ReadonlyMap<string, string> = new Map([
  ["cc", "claude-code"],
  ["ol", "ollama"],
  ["oc", "opencode"],
  ["oai", "openai"],
  ["ant", "anthropic"],
  ["gem", "gemini"],
  ["vtx", "vertexai"],
  // detect.ts:94 registers this alias and `ai list` prints it; without the entry
  // here `ai ask -p kr` rejected an alias the CLI had just advertised.
  ["kr", "kiro"],
]);

const PROVIDER_DISPLAY_NAMES: ReadonlyMap<string, string> = new Map([
  ["claude-code", "Claude Code"],
  ["ollama", "Ollama"],
  ["opencode", "OpenCode"],
  ["kiro", "Kiro"],
  ["anthropic", "Anthropic API"],
  ["openai", "OpenAI API"],
  ["gemini", "Gemini API"],
  ["vertexai", "Vertex AI"],
]);

const resolveAlias = (name: string): string => {
  return PROVIDER_ALIASES.get(name) ?? name;
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
): Promise<aiModel.ProviderFactory> => {
  const adapters = await import("../adapters/mod.ts");

  const factory = await adapters.factoryFor(providerName);

  if (factory === undefined) {
    throw new Error(`Unknown provider: ${providerName}`);
  }

  return factory;
};

// =============================================================================
// Arguments
// =============================================================================

const USAGE =
  'Usage: ai ask "your prompt" [-p provider] [-m model] [--max-tokens n] [--effort level] [--json] [--verbose]';

/** The levels `--effort` accepts, the same as `GenerateTextOptions.effort`. */
const EFFORT_LEVELS: ReadonlySet<string> = new Set<generationHelpers.Effort>([
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
]);

const isEffort = (value: string): value is generationHelpers.Effort =>
  EFFORT_LEVELS.has(value);

/** The flags that take the next argument as their value. */
const VALUE_FLAGS: ReadonlySet<string> = new Set([
  "-p",
  "--provider",
  "-m",
  "--model",
  "--max-tokens",
  "--effort",
]);

// AskArgs names the effort type, so this entry point exports it too.
export type { Effort } from "../generation.ts";

/** The flags and prompt of one `ai ask` call. */
export type AskArgs = {
  readonly provider: string | null;
  readonly model: string | null;
  readonly maxTokens: number | null;
  readonly effort: generationHelpers.Effort | null;
  readonly json: boolean;
  readonly verbose: boolean;
  readonly prompt: string;
};

/**
 * Parses the arguments of `ai ask`. The failure is the message to print: a
 * flag without its value, an invalid value, or no prompt.
 */
export const parseAskArgs = (
  args: readonly string[],
): results.Result<AskArgs, string> => {
  let provider: string | null = null;
  let modelId: string | null = null;
  let maxTokens: number | null = null;
  let effort: generationHelpers.Effort | null = null;
  let json = false;
  let verbose = false;
  const promptParts: string[] = [];

  let i = 0;
  while (i < args.length) {
    const arg = args[i]!;

    if (VALUE_FLAGS.has(arg)) {
      const value = args[i + 1];
      if (value === undefined) {
        return results.fail(`${arg} needs a value. ${USAGE}`);
      }

      switch (arg) {
        case "-p":
        case "--provider":
          provider = value;
          break;
        case "-m":
        case "--model":
          modelId = value;
          break;
        case "--max-tokens": {
          const limit = Number(value);
          if (!Number.isSafeInteger(limit) || limit <= 0) {
            return results.fail(
              `--max-tokens ${JSON.stringify(
                value,
              )} is not a positive whole number; pass the output token limit, such as --max-tokens 1024`,
            );
          }
          maxTokens = limit;
          break;
        }
        case "--effort":
          if (!isEffort(value)) {
            return results.fail(
              `--effort ${JSON.stringify(
                value,
              )} is not an effort level; use low, medium, high, xhigh or max`,
            );
          }
          effort = value;
          break;
      }

      i += 2;
      continue;
    }
    if (arg === "--json") {
      json = true;
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

  const prompt = promptParts.join(" ");

  if (prompt.length === 0) {
    return results.fail(USAGE);
  }

  return results.ok({
    provider,
    model: modelId,
    maxTokens,
    effort,
    json,
    verbose,
    prompt,
  });
};

// =============================================================================
// Main
// =============================================================================

/**
 * Runs `ai ask`: parses the arguments, picks the provider (from `-p` or by
 * detection), sends the prompt and writes the reply to stdout. Invalid
 * arguments fail before a provider is chosen.
 */
export const main = async (
  args?: readonly string[],
): Promise<shellArgs.CliResult<void>> => {
  const parsed = parseAskArgs(args ?? []);

  if (results.isFail(parsed)) {
    return results.fail({ message: parsed.error, exitCode: 1 });
  }

  const {
    provider: providerFlag,
    model: modelFlag,
    maxTokens,
    effort,
    json: jsonMode,
    verbose,
    prompt: promptText,
  } = parsed.value;

  const log = await setupLogging(verbose);

  try {
    // Resolve provider
    const providerName =
      providerFlag !== null
        ? resolveAlias(providerFlag)
        : await detectProvider(log);

    const displayName =
      PROVIDER_DISPLAY_NAMES.get(providerName) ?? providerName;
    const modelId = modelFlag ?? getDefaultModel(providerName);

    await log.info(`Using ${displayName} (${modelId})`);

    // Load factory and create model
    const factory = await loadFactory(providerName);
    const modelRegistry = new registry.Registry({ factories: [factory] });

    // The registry owns the model, so it is closed on every path, a failed
    // request included.
    try {
      const model = await modelRegistry.addModel("default", {
        provider: providerName,
        model: modelId,
      });

      await log.info(`Sending prompt (${promptText.length} chars)...`);

      return await sendPrompt(
        model,
        {
          messages: [content.textMessage("user", promptText)],
          maxTokens: maxTokens ?? undefined,
          effort: effort ?? undefined,
        },
        jsonMode,
        log,
      );
    } finally {
      await modelRegistry.close();
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await log.error(message);

    if (verbose && err instanceof Error && err.cause !== undefined) {
      await log.debug(`Cause: ${String(err.cause)}`);
    }

    return results.fail({ message, exitCode: 1 });
  }
};

/**
 * Sends the prompt and writes the reply to stdout: the whole result as JSON in
 * JSON mode, or else the text as it streams in.
 */
const sendPrompt = async (
  model: aiModel.LanguageModel,
  options: generationHelpers.GenerateTextOptions,
  jsonMode: boolean,
  log: logging.logger.Logger,
): Promise<shellArgs.CliResult<void>> => {
  if (jsonMode) {
    const generateResult = await model.generateText(options);

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

    return results.ok(undefined);
  }

  // Streaming: pipe text deltas through typewriter sink
  await streams
    .pipeline()
    .from(aiStreams.aiTextSource(model, options))
    .to(typewriterSink())
    .run();

  // Newline after stream
  const writer = runtime.process.stdout.getWriter();
  await writer.write(new TextEncoder().encode("\n"));
  writer.releaseLock();

  return results.ok(undefined);
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

        try {
          for (const char of text) {
            // The typewriter prints one character, then pauses, in order.
            // deno-lint-ignore no-await-in-loop
            await writer.write(encoder.encode(char));
            // The pause between characters is the effect itself.
            // deno-lint-ignore no-await-in-loop
            await sleep(delayMs);
          }
        } finally {
          writer.releaseLock();
        }
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
