# 🌊 [@eserstack/streams](./)

> **eserstack Library** — [eser/stack on GitHub](https://github.com/eser/stack)
> **Install:** `pnpm add jsr:@eserstack/streams`

Composable stream primitives for eser stack. Built on the Web Streams API with a
Span-based formatting model that makes output adapter-agnostic.

## Core Concepts

### Source → Layer → Sink

```
Source<T>  →  Layer<I, O>  →  Layer<I, O>  →  Sink<T>
(produce)     (transform)      (transform)     (consume)
```

All data flows through **Chunks** — wrappers that carry data + metadata
(timestamp, kind, channel, annotations).

### Span-Based Formatting

Instead of baking ANSI codes into output strings, formatting is declared as a
lightweight **Span tree**. Renderers serialize Spans per target:

```typescript
import * as streams from "@eserstack/streams";
import * as span from "@eserstack/streams/span";

// Handler code — format-agnostic
ctx.out.writeln(span.bold("Recipe: "), span.cyan(recipe.name));
ctx.out.writeln(span.dim(`[${recipe.language}]`));
ctx.out.writeln(span.green("✓ Done"));
```

Same Span tree, different output:

| Renderer            | `bold("hello")`        | `red("error")`          |
| ------------------- | ---------------------- | ----------------------- |
| ANSI (terminal)     | `\x1b[1mhello\x1b[22m` | `\x1b[31merror\x1b[39m` |
| Markdown (MCP/HTTP) | `**hello**`            | `error`                 |
| Plain (tests/logs)  | `hello`                | `error`                 |

### Output API

The `output()` function is the console.log replacement:

```typescript
import * as streams from "@eserstack/streams";

// CLI: colored terminal output
const out = streams.output({
  renderer: streams.renderers.ansi(),
  sink: streams.sinks.stdout(),
});

// MCP: markdown for tool responses
const out = streams.output({
  renderer: streams.renderers.markdown(),
  sink: streams.sinks.buffer(),
});

// Test: plain text for assertions
const out = streams.output({
  renderer: streams.renderers.plain(),
  sink: streams.sinks.buffer(),
});

out.write("plain text");
out.writeln(span.bold("bold"), " and ", span.dim("dim"));
await out.flush();
await out.close();
```

## Span Types

### Inline Spans

```typescript
import * as span from "@eserstack/streams/span";

span.text("plain text"); // { kind: "text", value: "plain text" }
span.bold("important"); // { kind: "bold", children: [...] }
span.dim("subtle"); // { kind: "dim", children: [...] }
span.italic("emphasis"); // { kind: "italic", children: [...] }
span.underline("link"); // { kind: "underline", children: [...] }
span.strikethrough("removed"); // { kind: "strikethrough", children: [...] }
span.red("error"); // { kind: "color", color: "red", children: [...] }
span.green("success"); // { kind: "color", color: "green", children: [...] }
span.cyan("info"); // { kind: "color", color: "cyan", children: [...] }
span.yellow("warning"); // { kind: "color", color: "yellow", children: [...] }
span.nl(); // { kind: "newline" }
```

### Block-Level Spans

```typescript
span.table(
  ["Name", "Language", "Scale"],
  [
    ["fp-pipe", "typescript", "utility"],
    ["go-service", "go", "project"],
  ],
);

span.codeBlock("const x = 42;", "typescript");

span.list([
  ["Install: ", span.dim("pnpm install")],
  ["Run: ", span.dim("deno task dev")],
]);
```

### Nesting

Spans compose naturally:

```typescript
span.bold("Recipe: ", span.cyan(recipe.name));
// { kind: "bold", children: [
//   { kind: "text", value: "Recipe: " },
//   { kind: "color", color: "cyan", children: [
//     { kind: "text", value: "my-recipe" }
//   ]}
// ]}
```

## Renderers

The `Renderer<T>` interface is generic — built-in renderers return strings, but
external packages can implement renderers that return any type.

### Built-in Renderers (return `string`)

| Renderer     | Import                         | Use Case                        |
| ------------ | ------------------------------ | ------------------------------- |
| `ansi()`     | `@eserstack/streams/renderers` | Terminal (colored escape codes) |
| `markdown()` | `@eserstack/streams/renderers` | MCP tool responses, HTTP APIs   |
| `plain()`    | `@eserstack/streams/renderers` | Tests, log files                |

```typescript
import * as renderers from "@eserstack/streams/renderers";

const renderer = renderers.ansi();
const text = renderer.render([span.bold("hello"), span.text(" world")]);
// "\x1b[1mhello\x1b[22m world\x1b[0m"
```

### External Renderers

Any package can implement `Renderer<T>` to produce a different output type. For
example, `@eserstack/laroux-react` provides a React renderer:

```tsx
import { reactRenderer } from "@eserstack/laroux-react";

const renderer = reactRenderer(); // Renderer<React.ReactElement>
const element = renderer.render([span.bold("hello")]);
// <strong>hello</strong>
```

### Creating Your Own Renderer

```typescript
import type { Renderer } from "@eserstack/streams/renderers";
import type { Span } from "@eserstack/streams/span";

const myRenderer = (): Renderer<MyOutputType> => ({
  name: "my-renderer",
  render: (spans: readonly Span[]) => {
    // Convert Span tree to your target format
  },
});
```

## Pipeline API

For stream processing pipelines:

```typescript
import * as streams from "@eserstack/streams";

// Transform pipeline
const items = await streams.pipeline()
  .from(streams.sources.values(1, 2, 3, 4, 5))
  .through(streams.layers.filter((n) => n > 2))
  .through(streams.layers.map((n) => n * 10))
  .collect<number>();
// [30, 40, 50]
```

## Sinks

| Sink                  | Purpose                                     |
| --------------------- | ------------------------------------------- |
| `stdout()`            | Write to process.stdout                     |
| `buffer()`            | Collect in memory (`.items()`, `.chunks()`) |
| `null()`              | Discard all output                          |
| `writable(stream)`    | Wrap any WritableStream                     |
| `multiplex(...sinks)` | Fan-out to multiple sinks                   |

## Integration with @eserstack/functions

Handlers use `ctx.out` (an `Output` instance) injected via the Task context:

```typescript
import * as task from "@eserstack/functions/task";
import * as span from "@eserstack/streams/span";

type HandlerContext = { readonly out: Output };

const myHandler = (input: Input): task.Task<Output, Error, HandlerContext> =>
  task.task(async (ctx) => {
    ctx.out.writeln(span.bold("Processing..."));
    // ... business logic
    ctx.out.writeln(span.green("✓ Done"));
    return results.ok(output);
  });
```

The adapter provides the Output with the right renderer + sink:

```typescript
// CLI adapter
const out = streams.output({
  renderer: renderers.ansi(),
  sink: sinks.stdout(),
});
await task.runTask(myHandler(input), { out });

// MCP adapter
const buf = sinks.buffer();
const out = streams.output({ renderer: renderers.markdown(), sink: buf });
await task.runTask(myHandler(input), { out });
const response = buf.items().join("");
```

## License

Apache-2.0
