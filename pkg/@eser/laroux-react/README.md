# @eser/laroux-react

React Server Components adapter for laroux.js framework.

## Overview

This package implements the React Server Components (RSC) protocol for the
laroux.js framework. It provides the necessary adapters and utilities to enable
server-side rendering with React 19.x's Server Components architecture on Deno.

## Features

- **React Server Components**: Full support for RSC protocol
- **Streaming SSR**: Stream React components from server to client
- **Client Components**: Automatic code splitting for client-side interactivity
- **Server Actions**: Type-safe server-side mutations
- **Deno-first**: Built specifically for the Deno runtime

## Installation

```bash
deno add @eser/laroux-react
```

## Usage

This package is typically used internally by `@eser/cli` (via `eser laroux`
commands) and `@eser/laroux-core`. You generally won't need to import it
directly unless you're building custom tooling.

### Server-Side Rendering

```typescript
import { renderToReadableStream } from "@eser/laroux-react/server";

// Render a React Server Component to a stream
const stream = await renderToReadableStream(<App />);
```

### Client-Side Hydration

```typescript
import { createFromFetch } from "@eser/laroux-react/client";

// Hydrate client components from RSC stream
const root = await createFromFetch(fetch("/rsc"));
```

### Span Rendering

Render `@eser/streams` Span trees as React elements. The same formatting that
produces ANSI terminal output or Markdown can produce React components:

```tsx
import { SpanView } from "@eser/laroux-react/span-renderer";
import * as span from "@eser/streams/span";

function RecipeHeader({ name }: { name: string }) {
  return (
    <SpanView>
      {[span.bold("Recipe: "), span.cyan(name)]}
    </SpanView>
  );
  // Renders: <strong>Recipe: </strong><span class="text-cyan-500">name</span>
}
```

The `react()` renderer implements `@eser/streams`'s
`Renderer<React.ReactElement>` interface — the same interface that `ansi()`,
`markdown()`, and `plain()` implement for strings:

```tsx
import { reactRenderer } from "@eser/laroux-react";
import * as span from "@eser/streams/span";

const renderer = reactRenderer();
const element = renderer.render([span.bold("hello"), span.text(" world")]);
// <><strong>hello</strong> world</>
```

### Running Handlers in Server Components

Use `runFunction()` to run `@eser/functions` handlers inside React Server
Components. The same handler that powers `eser kit list` in the terminal can
fetch data for a web page:

```tsx
import { runFunction } from "@eser/laroux-react/use-function";
import { listRecipes } from "@eser/registry/handlers/list-recipes";

export default async function RecipesPage({ params }) {
  const { recipes } = await runFunction(
    listRecipes({ language: params.lang }),
  );

  return (
    <ul>
      {recipes.map((r) => <li key={r.name}>{r.name} — {r.description}</li>)}
    </ul>
  );
}
```

`runFunction()` creates a buffer-backed Output context, runs the handler's Task,
and returns the success value. On failure, it throws — React Error Boundaries
handle the error.

## Exports

| Export               | Purpose                                                   |
| -------------------- | --------------------------------------------------------- |
| `./mod.ts`           | Main: Link, Image, SpanView, runFunction                  |
| `./client`           | Client-side hydration and rendering                       |
| `./protocol`         | Shared RSC wire protocol utilities                        |
| `./span-renderer`    | React Span renderer + SpanView component                  |
| `./use-function`     | `runFunction()` for running handlers in server components |
| `./client/bootstrap` | Client bootstrap utilities                                |

## Dependencies

- `react` ^19.0.0
- `react-dom` ^19.0.0
- `@eser/streams` (Span types, renderers, Output)
- `@eser/functions` (Task, handler execution)
- `@eser/primitives` (Result types)

## Architecture

This package bridges React's Server Components implementation with Deno's
runtime and integrates with the eser stack handler architecture:

1. **Server**: Renders Server Components to RSC protocol streams
2. **Client**: Hydrates and renders Client Components in the browser
3. **Protocol**: Implements RSC wire format for streaming components
4. **Span Renderer**: Converts `@eser/streams` Span trees to React elements
5. **Function Runner**: Runs `@eser/functions` handlers inside server components

## Related Packages

- [`@eser/laroux`](https://jsr.io/@eser/laroux) - Framework-agnostic core
  utilities (navigation, image, router, config)

## Documentation

- [Getting Started](https://laroux.js.org/docs/getting-started)
- [API Reference](https://laroux.js.org/docs/api-reference)
- [React Server Components](https://react.dev/reference/rsc/server-components)

## License

Apache-2.0

## Contributing

Contributions are welcome! Please see the
[main repository](https://github.com/eser/stack) for contribution guidelines.
