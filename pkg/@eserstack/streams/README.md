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

const out = streams.output({ renderer: streams.renderers.ansi() });
const recipe = { name: "fp-pipe", language: "typescript" };

// Handler code — format-agnostic
out.writeln(streams.span.bold("Recipe: "), streams.span.cyan(recipe.name));
out.writeln(streams.span.dim(`[${recipe.language}]`));
out.writeln(streams.span.green("✓ Done"));
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
const cliOut = streams.output({
  renderer: streams.renderers.ansi(),
  sink: streams.sinks.stdout(),
});

// MCP: markdown for tool responses
const mcpOut = streams.output({
  renderer: streams.renderers.markdown(),
  sink: streams.sinks.buffer(),
});

// Test: plain text for assertions
const testOut = streams.output({
  renderer: streams.renderers.plain(),
  sink: streams.sinks.buffer(),
});

cliOut.write("plain text");
cliOut.writeln(streams.span.bold("bold"), " and ", streams.span.dim("dim"));
await cliOut.flush();
await cliOut.close();
```

## Span Types

### Inline Spans

```typescript
import * as streams from "@eserstack/streams";

streams.span.text("plain text"); // { kind: "text", value: "plain text" }
streams.span.bold("important"); // { kind: "bold", children: [...] }
streams.span.dim("subtle"); // { kind: "dim", children: [...] }
streams.span.italic("emphasis"); // { kind: "italic", children: [...] }
streams.span.underline("link"); // { kind: "underline", children: [...] }
streams.span.strikethrough("removed"); // { kind: "strikethrough", children: [...] }
streams.span.red("error"); // { kind: "color", color: "red", children: [...] }
streams.span.green("success"); // { kind: "color", color: "green", children: [...] }
streams.span.cyan("info"); // { kind: "color", color: "cyan", children: [...] }
streams.span.yellow("warning"); // { kind: "color", color: "yellow", children: [...] }
streams.span.nl(); // { kind: "newline" }
```

### Block-Level Spans

```typescript
import * as streams from "@eserstack/streams";

streams.span.table(
  ["Name", "Language", "Scale"],
  [
    ["fp-pipe", "typescript", "utility"],
    ["go-service", "go", "project"],
  ],
);

streams.span.codeBlock("const x = 42;", "typescript");

streams.span.list([
  ["Install: ", streams.span.dim("pnpm install")],
  ["Run: ", streams.span.dim("deno task dev")],
]);
```

### Nesting

Spans compose naturally:

```typescript
import * as streams from "@eserstack/streams";

const recipe = { name: "my-recipe" };

streams.span.bold("Recipe: ", streams.span.cyan(recipe.name));
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

| Renderer     | Access                         | Use Case                        |
| ------------ | ------------------------------ | ------------------------------- |
| `ansi()`     | `streams.renderers.ansi()`     | Terminal (colored escape codes) |
| `markdown()` | `streams.renderers.markdown()` | MCP tool responses, HTTP APIs   |
| `plain()`    | `streams.renderers.plain()`    | Tests, log files                |

```typescript
import * as streams from "@eserstack/streams";

const renderer = streams.renderers.ansi();
const text = renderer.render([
  streams.span.bold("hello"),
  streams.span.text(" world"),
]);
// "\x1b[1mhello\x1b[22m world\x1b[0m"
```

### External Renderers

Any package can implement `Renderer<T>` to produce a different output type. For
example, `@eserstack/laroux-react` provides a React renderer:

```typescript
import * as larouxReact from "@eserstack/laroux-react";
import * as streams from "@eserstack/streams";

const renderer = larouxReact.reactRenderer(); // Renderer<React.ReactElement>
const element = renderer.render([streams.span.bold("hello")]);
// <strong>hello</strong>
```

### Creating Your Own Renderer

```typescript
import type * as streams from "@eserstack/streams";

type MyOutputType = string;

const myRenderer = (): streams.renderers.Renderer<MyOutputType> => ({
  name: "my-renderer",
  render: (spans: readonly streams.span.Span[]) => {
    // Convert Span tree to your target format
    return spans.map((node) => node.kind).join(",");
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
  .through(streams.layers.filter((n: number) => n > 2))
  .through(streams.layers.map((n: number) => n * 10))
  .collect<number>();
// [30, 40, 50]
```

## Sinks

| Sink                  | Purpose                                     |
| --------------------- | ------------------------------------------- |
| `stdout()`            | Write to process.stdout                     |
| `stderr()`            | Write to process.stderr                     |
| `buffer()`            | Collect in memory (`.items()`, `.chunks()`) |
| `nullSink()`          | Discard all output                          |
| `writable(stream)`    | Wrap any WritableStream                     |
| `multiplex(...sinks)` | Fan-out to multiple sinks                   |

Every `stdout()` and `stderr()` sink in the process writes through one queue per
stream, so several outputs can share the terminal without failing on the
stream's lock. `write()` and `writeln()` only buffer; the bytes reach the stream
once the event loop runs. Before long synchronous work such as a native FFI
call, `await out.flush()` so the lines already written appear first:

```typescript
import * as streams from "@eserstack/streams";

const out = streams.output({ sink: streams.sinks.stdout() });

const runSynchronousStep = (): void => {
  // Stands in for a synchronous FFI call that holds the event loop
};

out.writeln("Checking files...");
await out.flush();
runSynchronousStep();
out.writeln("Done");
await out.close();
```

## Integration with @eserstack/functions

Handlers use `ctx.out` (an `Output` instance) injected via the Task context.
Each adapter passes `myHandler` an Output with the renderer and sink its target
needs:

```typescript
import * as functions from "@eserstack/functions";
import * as primitives from "@eserstack/primitives";
import * as streams from "@eserstack/streams";

type HandlerContext = { readonly out: streams.Output };

const myHandler = (
  input: string,
): functions.task.Task<string, Error, HandlerContext> =>
  functions.task.task(async (ctx) => {
    ctx.out.writeln(streams.span.bold("Processing..."));
    // ... business logic
    ctx.out.writeln(streams.span.green("✓ Done"));
    return primitives.results.ok(input.toUpperCase());
  });

// CLI adapter
const cliOut = streams.output({
  renderer: streams.renderers.ansi(),
  sink: streams.sinks.stdout(),
});
await functions.task.runTask(myHandler("input"), { out: cliOut });

// MCP adapter
const buf = streams.sinks.buffer();
const mcpOut = streams.output({
  renderer: streams.renderers.markdown(),
  sink: buf,
});
await functions.task.runTask(myHandler("input"), { out: mcpOut });
await mcpOut.flush();
const response = buf.items().join("");
```

## License

Apache-2.0

---

## 🔗 Links

- [@eserstack/functions](https://jsr.io/@eserstack/functions): tasks whose
  handlers write through an `Output`
- [@eserstack/laroux-react](https://jsr.io/@eserstack/laroux-react): the React
  renderer for Span trees
- [JSR package](https://jsr.io/@eserstack/streams): the API reference generated
  from source
- [eser/stack on GitHub](https://github.com/eser/stack)
