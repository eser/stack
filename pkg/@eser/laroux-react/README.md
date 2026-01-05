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

## Exports

- **`server.ts`**: Server-side RSC rendering utilities
- **`client.ts`**: Client-side hydration and rendering
- **`protocol.ts`**: Shared RSC wire protocol utilities
- **`runtime/rsc-handler.ts`**: RSC request handler

## Dependencies

- `react` ^19.0.0
- `react-dom` ^19.0.0

## Architecture

This package bridges React's Server Components implementation with Deno's
runtime:

1. **Server**: Renders Server Components to RSC protocol streams
2. **Client**: Hydrates and renders Client Components in the browser
3. **Protocol**: Implements RSC wire format for streaming components

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
