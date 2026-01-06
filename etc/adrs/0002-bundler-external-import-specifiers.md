# Bundler External Import Specifiers Policy

## Status

Accepted

## Context and Problem Statement

When bundling JavaScript/TypeScript code, some imports are marked as "external"
(not inlined into the bundle). The bundler must decide what import specifier to
use in the output for these external imports.

```typescript
// Source file (with import map resolving @foo/bar to jsr:@foo/bar@^1.0.0)
import { something } from "@foo/bar";

// Bundled output - what specifier should appear?
import { something } from "???";
```

The bundler has access to the project's import map and can resolve bare
specifiers to their full forms (e.g., `jsr:@foo/bar@^1.0.0`). The question is:
**should it rewrite the specifier or keep it as-is?**

## Decision Drivers

- **Cross-runtime compatibility**: Output must work in Deno, Node.js, and Bun
- **Standard resolution**: Use resolution mechanisms all runtimes understand
- **No runtime dependencies on import maps**: Bundled code should not require
  import maps to be present at runtime
- **Simplicity**: Avoid unnecessary transformations

## Decision Outcome

**NEVER rewrite external import specifiers to protocol-specific forms.**

Keep bare specifiers as-is. They resolve from `node_modules` at runtime, which
works in all JavaScript runtimes.

### The Rule

| Source Specifier | Bundled Output        | Correct? |
| ---------------- | --------------------- | -------- |
| `@foo/bar`       | `@foo/bar`            | ✅ YES   |
| `@foo/bar`       | `jsr:@foo/bar@^1.0.0` | ❌ NO    |
| `@foo/bar`       | `npm:@foo/bar`        | ❌ NO    |
| `lodash`         | `lodash`              | ✅ YES   |
| `lodash`         | `npm:lodash@^4.0.0`   | ❌ NO    |

### Why Protocol Specifiers Break

```typescript
// This ONLY works in Deno
import { x } from "jsr:@foo/bar@^1.0.0";

// This ONLY works in Deno
import { x } from "npm:lodash@^4.0.0";

// This works EVERYWHERE (Deno, Node.js, Bun)
import { x } from "@foo/bar";
import { y } from "lodash";
```

- `jsr:` protocol - Deno-only, not understood by Node.js or Bun
- `npm:` protocol - Deno-only, not understood by Node.js or Bun
- Bare specifiers - Standard, resolved from `node_modules` by all runtimes

### Consequences

#### Good

- Bundled code works in Deno, Node.js, and Bun
- Uses standard `node_modules` resolution
- No special runtime configuration needed
- Simpler bundler logic (no specifier rewriting)

#### Bad

- Requires dependencies to be installed in `node_modules`
- Bare specifiers are less explicit about versions

## Implementation

### Server Bundling with Deno Bundler

Server components use deno-bundler (lightweight, esbuild-based) with native
externals support:

```typescript
// In system.ts - server bundling
const serverExternals = context.config.serverExternals;
// Default: ["@eser/laroux", "@eser/laroux-server"]

await bundleServerComponents(
  {
    entrypoints: serverEntrypoints,
    outputDir: serverOutputDir,
    externals: serverExternals,
  },
  "deno-bundler", // Lightweight, uses esbuild under the hood
);
```

Deno's native resolution with `nodeModulesDir: "auto"` handles npm package
resolution from `node_modules`.

### Client Bundling with Import Map Resolver

Client bundling uses the import-map-resolver plugin for browser shims and
external marking:

```typescript
createImportMapResolverPlugin({
  projectRoot,
  browserShims: config.browserShims,
  autoMarkExternal: true, // Auto-mark npm/jsr as external for client
});
```

### Configuration via laroux.config.ts

Users can extend server externals in their config:

```typescript
// laroux.config.ts
export default {
  build: {
    // Additional packages to keep external (merged with defaults)
    serverExternals: ["some-shared-lib"],
  },
};
```

Default externals: `["@eser/laroux", "@eser/laroux-server"]`

## How Bare Specifiers Resolve at Runtime

All runtimes resolve bare specifiers by looking in `node_modules`:

```
project/
├── node_modules/
│   ├── @eser/
│   │   └── laroux-server/    ← @eser/laroux-server resolves here
│   ├── react/                 ← react resolves here
│   └── lodash/                ← lodash resolves here
├── dist/
│   └── bundle.js              ← bundled code with bare imports
├── deno.json                  ← nodeModulesDir: "auto" for Deno
└── package.json               ← dependencies for npm/bun
```

**Deno**: With `"nodeModulesDir": "auto"` in `deno.json`, Deno creates
`node_modules` from JSR/npm dependencies and uses it for resolution.

**Node.js**: Standard `node_modules` resolution per Node.js module algorithm.

**Bun**: Standard `node_modules` resolution, compatible with Node.js.

## Common Mistakes

### Mistake 1: Rewriting to JSR specifiers

```typescript
// Source
import { foo } from "@eser/something";

// WRONG output - breaks Node.js and Bun
import { foo } from "jsr:@eser/something@^4.0.0";
```

### Mistake 2: Rewriting to npm specifiers

```typescript
// Source
import { foo } from "lodash";

// WRONG output - breaks Node.js and Bun
import { foo } from "npm:lodash@^4.0.0";
```

### Mistake 3: Using resolved paths for externals

```typescript
// In resolver plugin
const resolved = importMap.resolve(specifier); // "jsr:@foo/bar@^1.0.0"
return { path: resolved, external: true }; // ❌ WRONG

// Correct
return { external: true }; // ✅ Keeps original bare specifier
```

## Applies To

This policy applies to ALL bundling operations in the stack:

- **Client bundling** (`bundle()` in `domain/bundler.ts`)
- **Server bundling** (`bundleServerComponents()` in `domain/bundler.ts`)
- **Any future bundling** operations

## Related Files

- `pkg/@eser/bundler/backends/deno-bundler.ts` - Deno bundler backend (server
  bundling)
- `pkg/@eser/bundler/backends/rolldown.ts` - Rolldown backend (client bundling)
- `pkg/@eser/laroux-bundler/import-map-resolver-plugin.ts` - Import resolution
  for client bundling
- `pkg/@eser/laroux-bundler/system.ts` - Build system (server bundling config)
- `pkg/@eser/laroux/config/defaults.ts` - Default server externals list

## Links

- [Deno nodeModulesDir](https://docs.deno.com/runtime/manual/node/npm_specifiers)
- [Node.js Module Resolution](https://nodejs.org/api/modules.html)
- [Bun Module Resolution](https://bun.sh/docs/runtime/modules)
