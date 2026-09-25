# Hexagonal Architecture and Public Surface

How packages separate domain logic from adapters, how callers compose them, and
how public APIs and request metadata are shaped.

## Contents

- Hexagonal Architecture (Double-Layered)
- Runtime Access Through cross-runtime
- Public API and CLI Surface
- Request-Scoped Metadata Across Boundaries

---

## Hexagonal Architecture (Double-Layered)

Scope: Packages with external dependencies (TypeScript; the Go form is in
go-practices)

Rule: The domain layer holds business logic and its port types together; there
is no separate `ports/` directory. Adapters implement the domain types and live
in `adapters/`. The caller composes by importing the adapters it wants and
passing them in as parameters. No string-based adapter selection, no convenience
factories that pick adapters for the caller, no dynamic imports inside the
package.

```
package/
├── domain/                    # Business logic + port types
│   ├── mod.ts
│   ├── bundler.ts             # Bundler type + BundleData
│   ├── framework-plugin.ts    # FrameworkPlugin type + noopPlugin
│   └── build-cache.ts         # BuildCache type + implementation
├── adapters/
│   ├── react/                 # implements FrameworkPlugin
│   ├── tailwindcss/           # implements CssPlugin
│   └── prebuilt-bundler/      # implements Bundler
└── mod.ts
```

Correct:

```typescript
import * as bundler from "@eserstack/laroux-bundler";
import * as react from "@eserstack/laroux-bundler/adapters/react";
import * as tailwind from "@eserstack/laroux-bundler/adapters/tailwindcss";
import * as prebuilt from "@eserstack/laroux-bundler/adapters/prebuilt-bundler";

await bundler.bundle(config, {
  framework: react.reactPlugin,
  css: tailwind.tailwindPlugin,
  bundler: new prebuilt.PrebuiltBundler(bundlerConfig),
});
```

Incorrect:

```typescript
await bundle({ framework: "react", css: "tailwindcss" }); // dynamic imports inside

const plugins = await createReactTailwindPlugins(); // hides which adapters load

import type { Plugin } from "./ports/plugin.ts"; // ports split from the domain
```

A domain type ships with a noop implementation for callers that do not need the
capability:

```typescript
// domain/framework-plugin.ts
export type FrameworkPlugin = {
  name: string;
  analyzeClientComponents?: (srcDir: string) => Promise<ClientComponent[]>;
};

export const noopPlugin: FrameworkPlugin = {
  name: "noop",
  analyzeClientComponents: () => Promise.resolve([]),
};
```

**Why:** explicit imports keep the dependency graph visible and tree-shakable,
and let a caller swap one adapter without touching the others.

---

## Runtime Access Through cross-runtime

Scope: All `@eserstack/*` library code

Rule: Filesystem, process, exec and environment access goes through
`@eserstack/standards/cross-runtime`, never `Deno.*` directly. The runtime is an
adapter like any other, so the same code runs on Deno, Node and Bun and can be
tested with a fake. CLI-only code may call `Deno.*` when cross-runtime does not
expose the API it needs (for example `Deno.makeTempDir()`).

Correct:

```typescript
import { runtime } from "@eserstack/standards/cross-runtime";

const content = await runtime.fs.readTextFile(path);
```

Incorrect:

```typescript
const content = await Deno.readTextFile(path); // ties the library to Deno
```

---

## Public API and CLI Surface

Scope: Exported functions and types, CLI commands and flags, config keys,
environment variables

Rule:

- The common case works with no configuration. Every option has a default that
  is safe and correct for production.
- A fixed policy value a caller may need to change (a timeout, a size limit, a
  path, a retry count) is a parameter, flag or environment variable with that
  default, not a hardcoded constant.
- Do not add options for hypothetical needs. Each new option names the case that
  requires it; an edge case gets documentation, not a required setting.
- No positional boolean parameters. Use an options object or a string union.
- Defaults come from parameter defaults and noop adapters, not from convenience
  factories.

Correct:

```typescript
export function connect(url: string, options: { timeoutMs?: number } = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
}

render(tree, { mode: "stream" });
```

Incorrect:

```typescript
export function connect(url: string) {
  const timeoutMs = 5000; // caller cannot change it
}

render(tree, true, false); // what are true and false?
```

---

## Request-Scoped Metadata Across Boundaries

Scope: HTTP and RPC servers and clients, the noskills daemon, services that call
each other

Rule: Metadata that identifies a request (trace and span ids, a request or
correlation id, the authenticated principal) travels with the request's context
(`context.Context` in Go, the request or an explicit context object in
TypeScript), not as extra function parameters. Business inputs and dependencies
never travel that way: inputs are parameters, dependencies come from the
composition root.

- At an entry point, middleware reads incoming metadata or creates it, and
  stores it in the context.
- On every outbound call, the client writes it back out, so logs and traces on
  both sides join up.
- Trace state uses OpenTelemetry propagation (the `traceparent` header), not
  hand-written headers. Other ids use typed accessors owned by one package.
- Logs include these ids (coding-practices: Structured Logging).

**Why:** a request that loses its ids at one hop cannot be followed across the
system, and a dependency hidden in a context is invisible in every signature
that needs it.
