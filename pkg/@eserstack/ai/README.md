# 🤖 [@eserstack/ai](./)

> **eserstack Tool** — [eser/stack on GitHub](https://github.com/eser/stack)
> **Install:** `pnpm add jsr:@eserstack/ai`

Unified AI provider interface for eser stack. Supports cloud APIs (Anthropic,
OpenAI, Gemini, Vertex AI) and local agents (Claude Code, Ollama, OpenCode,
Kiro) through a single `LanguageModel` abstraction.

## CLI

```bash
# Standalone
deno jsr:@eserstack/ai ask "explain closures in JS" -p cc
deno jsr:@eserstack/ai ask "summarize this"              # auto-detect provider
deno jsr:@eserstack/ai list                               # show available providers

# Via eser CLI
eser ai ask "hello" -p ollama -m llama3
eser ai ask "summarize this diff in one line" -p ant --effort low
eser ai list
```

### Provider Aliases

| Alias | Provider    | Type |
| ----- | ----------- | ---- |
| `cc`  | claude-code | CLI  |
| `ol`  | ollama      | HTTP |
| `oc`  | opencode    | CLI  |
| `oai` | openai      | API  |
| `ant` | anthropic   | API  |
| `gem` | gemini      | API  |
| `vtx` | vertexai    | API  |
| `kr`  | kiro        | CLI  |

### Flags

| Flag             | Description                                                                     |
| ---------------- | ------------------------------------------------------------------------------- |
| `-p, --provider` | Provider name or alias                                                          |
| `-m, --model`    | Model ID override                                                               |
| `--max-tokens`   | Max output tokens, a positive whole number                                      |
| `--effort`       | Effort level: `low`, `medium`, `high`, `xhigh` or `max` (see [Effort](#effort)) |
| `--json`         | Output full result as JSON                                                      |
| `-v, --verbose`  | Show detection and timing info                                                  |

`ai ask` stops before it chooses a provider when a flag has no value,
`--max-tokens` is not a positive whole number, or `--effort` is not one of the
five levels.

## Library API

The package root runs the CLI, so the library is imported from `./mod`, and the
provider factories from `./adapters`:

```typescript
import * as ai from "@eserstack/ai/mod";
import * as aiAdapters from "@eserstack/ai/adapters";
```

### Registry + Model

Register the factories you need, then add a model per configuration target. When
`apiKey` is not set, the Anthropic SDK reads `ANTHROPIC_API_KEY` from the
environment.

```typescript
import * as ai from "@eserstack/ai/mod";
import * as aiAdapters from "@eserstack/ai/adapters";

const registry = new ai.Registry({
  factories: [aiAdapters.anthropicFactory],
});

await registry.addModel("default", {
  provider: "anthropic",
  model: "claude-sonnet-5",
});

const model = registry.getDefault();
if (model === null) {
  throw new Error("no model registered: call registry.addModel first");
}
```

### Generate Text

`generateText` returns a `Result` from `@eserstack/primitives` instead of
throwing. Check it before you read the value:

```typescript
import * as primitives from "@eserstack/primitives";

const result = await model.generateText({
  messages: [ai.textMessage("user", "What is gaslighting?")],
  maxTokens: 1024,
});

if (primitives.results.isFail(result)) {
  throw result.error;
}

console.log(ai.text(result.value));
```

### Streaming

`streamText` yields events as the model writes, and reports a failure as an
`error` event instead of throwing:

```typescript
const messages = [ai.textMessage("user", "Write a haiku about rivers.")];
const parts: string[] = [];

for await (const event of model.streamText({ messages })) {
  if (event.kind === "content_delta") {
    parts.push(event.textDelta);
  } else if (event.kind === "error") {
    throw event.error;
  }
}

console.log(parts.join(""));
```

Leaving the loop early with `break` or `return` ends the request. The Go bridge
cancels it, and the TypeScript `claude-code`, `kiro` and `opencode` adapters
stop the CLI process they started.

To print the text as it arrives, pipe it through `@eserstack/streams` as the
next section shows.

### Effort

`effort` sets how much the model thinks and how many tokens it spends on a
reply: `"low"`, `"medium"`, `"high"`, `"xhigh"` or `"max"`. Lower effort answers
faster and costs less. Leave it unset to keep the provider's default:

```typescript
const result = await model.generateText({
  messages: [ai.textMessage("user", "Summarize this diff in one line.")],
  effort: "low",
});
```

Each provider sends it in its own way, or ignores it:

| Provider                     | Sent as                                                                               |
| ---------------------------- | ------------------------------------------------------------------------------------- |
| `anthropic`                  | `output_config.effort`                                                                |
| `openai`                     | `reasoning_effort`; a model that lacks the level rejects the request                  |
| `claude-code`                | the `--effort` flag, which needs a `claude` CLI version that has it                   |
| `gemini`, `vertexai`         | `thinkingConfig.thinkingLevel`; `xhigh` and `max` send `HIGH`, Gemini's highest level |
| `ollama`, `opencode`, `kiro` | ignored                                                                               |

On `anthropic` and `openai`, an explicit `effort` wins over the level that
`thinkingBudget` maps to.

On `gemini` and `vertexai`, an explicit `effort` is sent instead of
`thinkingBudget`, since the API rejects a request that sets both. The levels a
Gemini model takes differ from one model to the next, and the adapter sends the
level without checking it against the model.
[Google's thinking guide](https://ai.google.dev/gemini-api/docs/thinking) lists
the levels per model.

### Structured Output

`responseFormat` asks for a JSON reply. With `type: "json_schema"`, the reply
follows the JSON Schema in `jsonSchema`. The reply still arrives as text, and
model output is untrusted input, so parse it and check its shape before you use
it:

```typescript
import * as primitives from "@eserstack/primitives";

const result = await model.generateText({
  messages: [
    ai.textMessage("user", "Suggest a title for a post about Deno workspaces."),
  ],
  responseFormat: {
    type: "json_schema",
    name: "post_title",
    jsonSchema: {
      type: "object",
      properties: { title: { type: "string" } },
      required: ["title"],
      additionalProperties: false,
    },
  },
});

if (primitives.results.isFail(result)) {
  throw result.error;
}

const reply: unknown = JSON.parse(ai.text(result.value));
```

Each provider sends a `json_schema` format in its own way, or ignores it:

| Provider             | Sent as                                                                  |
| -------------------- | ------------------------------------------------------------------------ |
| `anthropic`          | `output_config.format`, in the same object as `effort`                   |
| `openai`             | `response_format` with `strict: true`                                    |
| `gemini`, `vertexai` | a response JSON schema with the `application/json` MIME type             |
| `ollama`             | `format`                                                                 |
| `claude-code`        | the `--json-schema` flag, which needs a `claude` CLI version that has it |
| `opencode`, `kiro`   | ignored                                                                  |

Every provider that sends the schema needs it: without `jsonSchema`, or with one
that is not an object, the call fails with a `BadRequestError` before any
request is sent.

On `anthropic` and `claude-code`:

- `name` is not sent, since neither has a field for it.
- `json_object` and `text` are ignored: Claude has no JSON mode without a
  schema, so the prompt alone decides the shape of the reply.
- Claude accepts a subset of JSON Schema; on `anthropic` every object needs
  `additionalProperties: false`. See
  [Anthropic's structured outputs guide](https://platform.claude.com/docs/en/build-with-claude/structured-outputs).

On `claude-code`, the reply text is the CLI's structured output, and the prose
the model writes around it is left out. When the model gives no structured
output, as when it declines, the reply text is the prose instead. `streamText`
yields the reply as one `content_delta` once the CLI has finished.

On every provider, a reply that stops with `refusal` or `max_tokens` may not
match the schema, so check `stopReason` before you parse it.

### @eserstack/streams Integration

```typescript
import * as streams from "@eserstack/streams";
import * as aiStreams from "@eserstack/ai/streams";

await streams.pipeline()
  .from(aiStreams.aiTextSource(model, { messages }))
  .to(streams.sinks.stdout())
  .run();
```

`aiTextSource` passes on the text deltas only. When `streamText` reports an
`error` event, the source fails with that error, so `run()` rejects instead of
finishing with a partial reply.

Layers are also available:

```typescript
import * as aiStreams from "@eserstack/ai/streams";

// Extract text from StreamEvent chunks
const textLayer = aiStreams.extractText();

// Count tokens via callback
const counter = aiStreams.tokenCounter((usage) => {
  console.log(`Tokens: ${usage.totalTokens}`);
});
```

## Providers

### Cloud APIs

| Provider  | Package             | Features                                                        |
| --------- | ------------------- | --------------------------------------------------------------- |
| Anthropic | `@anthropic-ai/sdk` | Text, streaming, tools, vision, batch, struct, reasoning        |
| OpenAI    | `openai`            | Text, streaming, tools, vision, audio, batch, struct, reasoning |
| Gemini    | `@google/genai`     | Text, streaming, tools, vision, audio, struct, reasoning        |
| Vertex AI | `@google/genai`     | Same as Gemini, project/location auth                           |

A provider declares the same capabilities (`model.capabilities`) whether the
TypeScript adapter or the Go bridge serves it.

### Local Agents

| Provider    | Transport                | Drives                                       |
| ----------- | ------------------------ | -------------------------------------------- |
| Claude Code | ACP, in-process (or CLI) | `claude --print --output-format stream-json` |
| Ollama      | HTTP fetch               | `POST localhost:11434/api/chat` with JSONL   |
| OpenCode    | ACP, in-process (or CLI) | `opencode` with its JSON output flag         |
| Kiro        | ACP, in-process (or CLI) | `kiro` with its JSON output flag             |

### Two paths, and which one you get

`defaultFactories()` merges the TypeScript adapters with the Go FFI bridge **per
provider** — the bridge wins wherever it has an entry, and the TypeScript
adapter remains for every provider it does not. `factoryFor(provider)` does the
same for a single provider without importing the others.

For the three agent providers above, the bridge speaks the Agent Client Protocol
to a shim that is **linked into the Go library**, not spawned: `acpfx.InProcess`
connects them over an in-memory pipe. There is no separate binary to install or
find on PATH. The shim still drives the vendor CLI, so `claude`, `kiro` or
`opencode` must be installed — a spawn-time requirement, reported when it fails.

When the native library cannot load, the pure-TypeScript adapters take over and
shell out to the same vendor CLI directly. The bridge **refuses to load over
WASM** deliberately: WASM loads and then fails every request, because Go's
`wasip1` target has no outbound network — so a WASM-only machine falls back to
TypeScript rather than registering a provider that is present and broken.

`binPath` on one of these providers names the **vendor CLI**, not a shim.

## Content Types

Messages use a discriminated union for content blocks:

```typescript
type ContentBlock =
  | { kind: "text"; text: string }
  | { kind: "image"; image: ImagePart }
  | { kind: "audio"; audio: AudioPart }
  | { kind: "file"; file: FilePart }
  | { kind: "tool_call"; toolCall: ToolCall }
  | { kind: "tool_result"; toolResult: ToolResult }
  | { kind: "thinking"; thinking: ThinkingPart };
```

A `thinking` block holds the model's reasoning, which `ai.text()` leaves out.
Anthropic signs it (`signature`, or `redactedData` when redacted) and rejects a
tool-use turn sent back without it, so keep `result.content` whole when you add
the assistant turn to the next request. Streams deliver each block as one
`thinking` event, and `ai.collectStream` puts them first.

Helper constructors:

```typescript
ai.textMessage("user", "Hello");
ai.imageMessage("user", "https://example.com/photo.jpg", "high");
ai.toolResultMessage("call_1", "25C");
```

## Refusals

A model that declines a request, or a provider's content filter that withholds
the answer, ends with `stopReason: "refusal"`. The generation itself succeeds,
and its text, if any, explains the refusal or was cut off by the filter. Check
the stop reason before using the text as an answer:

```typescript
import * as primitives from "@eserstack/primitives";

const result = await model.generateText({ messages });

if (
  primitives.results.isOk(result) && result.value.stopReason === "refusal"
) {
  throw new Error(`${result.value.modelId} declined the request`);
}
```

Each provider reports a refusal in its own way:

| Provider             | Reported as `"refusal"`                                                                                                                   |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `anthropic`          | `stop_reason: "refusal"`                                                                                                                  |
| `openai`             | `finish_reason: "content_filter"`, or a `message.refusal`, whose text becomes the reply text                                              |
| `gemini`, `vertexai` | a filter's `finishReason` (`SAFETY`, `BLOCKLIST`, `PROHIBITED_CONTENT`, `SPII`, `RECITATION` and the image variants), or a blocked prompt |

A reply that was cut off ends with `stopReason: "max_tokens"`. On `anthropic`
that also covers `model_context_window_exceeded`, a reply cut off because the
context window filled up.

## Error Classification

Provider-agnostic error hierarchy with `instanceof` checking. `generateText`
returns these errors in a failed `Result`, `streamText` in an `error` event, and
the batch methods throw them:

```typescript
import * as primitives from "@eserstack/primitives";

const result = await model.generateText({ messages });

if (primitives.results.isFail(result)) {
  if (result.error instanceof ai.RateLimitedError) { /* 429 */ }
  if (result.error instanceof ai.AuthFailedError) { /* 401 */ }
  if (result.error instanceof ai.BadRequestError) { /* 400 */ }
}
```

## Configuration

`loadFromConfig` adds one model per target. The registry needs a factory for
every provider the config names; `defaultFactories()` returns all of them:

```typescript
import * as ai from "@eserstack/ai/mod";
import * as aiAdapters from "@eserstack/ai/adapters";

const config: ai.Config = {
  targets: {
    default: {
      provider: "claude-code",
      model: "claude-sonnet-5",
      properties: { maxTurns: 1 },
    },
    ollama: {
      provider: "ollama",
      model: "llama3",
      properties: { baseUrl: "http://localhost:11434" },
    },
  },
};

const registry = new ai.Registry({
  factories: await aiAdapters.defaultFactories(),
});

await registry.loadFromConfig(config);
```

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- `ContentBlock` has a `ThinkingBlock` (`kind: "thinking"`), `StreamEvent` a
  `ThinkingEvent`, and `StopReason` the value `"refusal"`. An exhaustive
  `switch` over them without a `default` no longer compiles. Add the cases, and
  treat `"refusal"` as a declined request, not an answer:

  ```typescript
  // After: check for a refusal before you use the text
  if (result.stopReason === "refusal") {
    return reportRefusal(result);
  }
  ```

- Stop reasons: Anthropic `refusal`, OpenAI `content_filter` and
  `message.refusal`, Gemini and Vertex AI safety, blocklist and recitation
  reasons and blocked prompts, the claude-code CLI's `refusal`, and ACP
  `refusal` are now `"refusal"`; they used to be `"end_turn"` or `"stop"`.
  Anthropic `model_context_window_exceeded` is `"max_tokens"`. Gemini and Vertex
  AI turns that call a tool end with `"tool_use"`, and unknown OpenAI and Gemini
  reasons are `"stop"`. Check for `"refusal"` before you use the text, and
  accept `"tool_use"` where you compared with `"end_turn"` after a tool call.
- A `json_schema` `responseFormat` with a missing or non-object schema fails
  before sending with `BadRequestError`, on every provider; it used to be sent
  without the schema. Anthropic now sends the schema as `output_config.format`,
  so a schema outside the subset Claude accepts (for example an object without
  `additionalProperties: false`) gets a 400 from the API. Pass a JSON Schema
  object that follows the provider's limits, or use `json_object`:

  ```typescript
  const options = {
    // Before: { type: "json_schema" } was accepted and the schema ignored
    responseFormat: {
      type: "json_schema",
      jsonSchema: {
        type: "object",
        properties: { title: { type: "string" } },
        required: ["title"],
        additionalProperties: false,
      },
    },
  };
  ```

- claude-code with a `json_schema` format passes `--json-schema` to the CLI, and
  `generateCommitMessage` on claude-code passes `--effort low`; a claude CLI
  without these flags rejects the call (2.1.289 has them). The reply text is the
  structured output, and `streamText` yields it as one `content_delta` after the
  CLI exits. Update the claude CLI, and parse `ai.text(result)` as JSON.
- Capabilities: Anthropic models declare `structured_output` and `reasoning`;
  the Gemini bridge model declares `audio`, `structured_output` and `reasoning`,
  the OpenAI bridge model `audio`, and the Vertex AI bridge model no longer
  declares `batch_processing`. `getByCapability("batch_processing")` no longer
  returns a Vertex AI bridge model, which never had batch methods.
- `aiTextSource` (`@eserstack/ai/streams`) fails its stream with the error of a
  `streamText` error event; it used to end normally with partial text. Handle
  the rejection of `pipeline().run()`, or use `aiSource` to receive error events
  as data.
- `eser ai ask`: a value flag with no value (`-p`, `-m`, `--max-tokens`) and a
  `--max-tokens` that is not a positive whole number exit 1 with a message.
  Before: `eser ai ask -m` ignored the flag. After: pass a value, as in
  `eser ai ask "your prompt" -m your_model_id`.

## License

Apache-2.0

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
