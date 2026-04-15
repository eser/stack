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

### Flags

| Flag             | Description                    |
| ---------------- | ------------------------------ |
| `-p, --provider` | Provider name or alias         |
| `-m, --model`    | Model ID override              |
| `--max-tokens`   | Max output tokens              |
| `--json`         | Output full result as JSON     |
| `-v, --verbose`  | Show detection and timing info |

## Library API

```typescript
import * as ai from "@eserstack/ai/mod";
```

### Registry + Model

```typescript
const registry = new ai.Registry({
  factories: [anthropicFactory],
});

await registry.addModel("default", {
  provider: "anthropic",
  model: "claude-sonnet-4-20250514",
  apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
});

const model = registry.getDefault()!;
```

### Generate Text

```typescript
const result = await model.generateText({
  messages: [ai.textMessage("user", "What is gaslighting?")],
  maxTokens: 1024,
});

console.log(ai.text(result));
```

### Streaming

```typescript
for await (const event of model.streamText({ messages })) {
  if (event.kind === "content_delta") {
    Deno.stdout.writeSync(new TextEncoder().encode(event.textDelta));
  }
}
```

### @eserstack/streams Integration

```typescript
import * as streams from "@eserstack/streams";
import * as aiStreams from "@eserstack/ai/streams";

await streams.pipeline()
  .from(aiStreams.aiTextSource(model, { messages }))
  .to(streams.sinks.stdout())
  .run();
```

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

| Provider  | Package             | Features                                      |
| --------- | ------------------- | --------------------------------------------- |
| Anthropic | `@anthropic-ai/sdk` | Text, streaming, tool calling, vision, batch  |
| OpenAI    | `openai`            | Text, streaming, tools, vision, batch, struct |
| Gemini    | `@google/genai`     | Text, streaming, tools, vision, audio, struct |
| Vertex AI | `@google/genai`     | Same as Gemini, project/location auth         |

### Local Agents

| Provider    | Transport   | Interface                                  |
| ----------- | ----------- | ------------------------------------------ |
| Claude Code | CLI process | `claude -p "prompt"` with text/stream-json |
| Ollama      | HTTP fetch  | `POST localhost:11434/api/chat` with JSONL |
| OpenCode    | CLI process | `opencode -p "prompt" --output-format`     |
| Kiro        | CLI process | `kiro --prompt "prompt" --output json`     |

## Content Types

Messages use a discriminated union for content blocks:

```typescript
type ContentBlock =
  | { kind: "text"; text: string }
  | { kind: "image"; image: ImagePart }
  | { kind: "audio"; audio: AudioPart }
  | { kind: "file"; file: FilePart }
  | { kind: "tool_call"; toolCall: ToolCall }
  | { kind: "tool_result"; toolResult: ToolResult };
```

Helper constructors:

```typescript
ai.textMessage("user", "Hello");
ai.imageMessage("user", "https://example.com/photo.jpg", "high");
ai.toolResultMessage("call_1", "25C");
```

## Error Classification

Provider-agnostic error hierarchy with `instanceof` checking:

```typescript
try {
  await model.generateText({ messages });
} catch (err) {
  if (err instanceof ai.RateLimitedError) { /* 429 */ }
  if (err instanceof ai.AuthFailedError) { /* 401 */ }
  if (err instanceof ai.BadRequestError) { /* 400 */ }
}
```

## Configuration

```typescript
const config: ai.Config = {
  targets: {
    default: {
      provider: "claude-code",
      model: "claude-sonnet-4-20250514",
      properties: { maxTurns: 1 },
    },
    ollama: {
      provider: "ollama",
      model: "llama3",
      properties: { baseUrl: "http://localhost:11434" },
    },
  },
};

await registry.loadFromConfig(config);
```

## License

Apache-2.0
