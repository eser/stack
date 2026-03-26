# 📦 [@eser/registry](./)

Recipe registry for eser stack. Provides a forkable distribution protocol for
code recipes — project templates, structural patterns, and utilities across
TypeScript and Go.

## Overview

`@eser/registry` powers the `eser kit` CLI commands. It defines the registry
manifest schema, fetches recipes from local or remote registries, applies them
to projects with variable substitution, and resolves recipe dependencies.

```
eser kit list                    # browse recipes
eser kit add <recipe>            # add to existing project
eser kit new <template>          # scaffold a new project
eser kit clone <owner/repo>      # clone from any GitHub repo
```

## Registry Schema

A registry is a JSON file listing available recipes:

```json
{
  "$schema": "https://eser.live/registry/v1.json",
  "name": "my-registry",
  "description": "My recipe collection",
  "author": "Your Name",
  "registryUrl": "https://raw.githubusercontent.com/you/repo/main/registry",
  "recipes": [
    {
      "name": "my-recipe",
      "description": "A useful recipe",
      "language": "typescript",
      "scale": "utility",
      "tags": ["typescript", "utility"],
      "files": [
        { "source": "recipes/my-recipe/mod.ts", "target": "lib/mod.ts" }
      ],
      "dependencies": {
        "jsr": ["jsr:@std/path@^1.0.0"]
      }
    }
  ]
}
```

### Recipe scales

| Scale       | Description                          | Example                    |
| ----------- | ------------------------------------ | -------------------------- |
| `project`   | Full project scaffold (10+ files)    | `laroux-app`, `go-service` |
| `structure` | Composable piece (3-10 files)        | Auth flow, API layer       |
| `utility`   | Single file or small set (1-2 files) | `fp-pipe`, `ajan-httpfx`   |

### Recipe fields

| Field          | Required | Description                                              |
| -------------- | -------- | -------------------------------------------------------- |
| `name`         | Yes      | Unique recipe identifier                                 |
| `description`  | Yes      | One-line description                                     |
| `language`     | Yes      | `typescript`, `go`, `javascript`                         |
| `scale`        | Yes      | `project`, `structure`, or `utility`                     |
| `files`        | Yes      | Array of `{ source, target }` file mappings              |
| `tags`         | No       | Filterable tags                                          |
| `dependencies` | No       | `{ go: [...], jsr: [...], npm: [...] }`                  |
| `requires`     | No       | Other recipe names that must be applied first            |
| `variables`    | No       | Template variables with `name`, `description`, `default` |
| `postInstall`  | No       | Shell commands to run after applying                     |

### File entry fields

| Field      | Required | Description                              |
| ---------- | -------- | ---------------------------------------- |
| `source`   | Yes      | Path relative to `registryUrl`           |
| `target`   | Yes      | Path relative to the user's project root |
| `kind`     | No       | `file` (default) or `folder`             |
| `provider` | No       | `local` (default) or `github`            |

## Architecture

### Three-Layer Design

```
@eser/registry/handlers/     → Pure business logic (Task<T, E, HandlerContext>)
  list-recipes.ts              Writes to ctx.out using Span-based formatting
  add-recipe.ts                No CLI dependency, no console.log
  new-project.ts               Testable, reusable from any adapter
  clone-recipe.ts
  update-recipe.ts

@eser/cli/commands/           → CLI adapters (thin, ~30 lines each)
  list.ts                      Parse args → create Output(ansi, stdout) → run handler
  add.ts                       ...
  new.ts                       ...
  clone.ts                     ...
  update.ts                    ...
```

### Handler Pattern

Handlers are pure functions that take typed input and return a `Task`. Output
goes through `ctx.out` (from `@eser/streams`) — the adapter decides how to
render (ANSI for terminal, Markdown for MCP, plain for tests):

```typescript
import * as task from "@eser/functions/task";
import * as span from "@eser/streams/span";
import type { HandlerContext } from "@eser/registry/handler-context";

const myHandler = (
  input: MyInput,
): task.Task<MyOutput, MyError, HandlerContext> =>
  task.task(async (ctx) => {
    ctx.out.writeln(span.bold("Processing..."));
    // ... business logic
    ctx.out.writeln(span.green("✓ Done"));
    return results.ok(output);
  });
```

### Writing a New Adapter

The same handler works in any adapter by providing different Output options:

```typescript
// CLI
const out = streams.output({
  renderer: renderers.ansi(),
  sink: sinks.stdout(),
});
await task.runTask(handler(input), { out });

// MCP tool call
const buf = sinks.buffer();
const out = streams.output({ renderer: renderers.markdown(), sink: buf });
await task.runTask(handler(input), { out });
const response = buf.items().join("");

// Test
const buf = sinks.buffer();
const out = streams.output({ renderer: renderers.plain(), sink: buf });
await task.runTask(handler(input), { out });
assert(buf.items().join("").includes("Done"));

// React Server Component
import { runFunction } from "@eser/laroux-react/use-function";
const data = await runFunction(handler(input));
// Use data in your component — handler's ctx.out writes go to buffer
```

## Modules

| Module                   | Export path                      | Purpose                              |
| ------------------------ | -------------------------------- | ------------------------------------ |
| `registry-schema.ts`     | `@eser/registry/schema`          | Types and validation                 |
| `registry-fetcher.ts`    | `@eser/registry/fetcher`         | Fetch manifests and recipe files     |
| `recipe-applier.ts`      | `@eser/registry/applier`         | Apply recipes with conflict handling |
| `dependency-resolver.ts` | `@eser/registry/resolver`        | Detect project type, install deps    |
| `variable-processor.ts`  | `@eser/registry/variables`       | Template variable substitution       |
| `requires-resolver.ts`   | `@eser/registry/requires`        | Resolve recipe dependency graph      |
| `handler-context.ts`     | `@eser/registry/handler-context` | HandlerContext type (DI contract)    |
| `handlers/mod.ts`        | `@eser/registry/handlers`        | All handler re-exports               |

## Creating your own registry

1. Create an `eser-registry.json` with your recipes
2. Host recipe files alongside it (GitHub works great)
3. Use with: `eser kit list --registry https://your-url/eser-registry.json`

The protocol is designed to be forkable — anyone can create their own recipe
registry and distribute their patterns, templates, and utilities.

## Security

- **Path traversal protection**: all target paths are validated to stay within
  the project directory before any files are written
- **Fetch timeout**: all HTTP requests have a 30-second timeout
- **Schema validation**: registries are validated before use

## License

Apache-2.0
