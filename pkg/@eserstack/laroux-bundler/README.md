# @eserstack/laroux-bundler

> **eserstack Product-Candidate** — build pipeline for laroux ·
> [eser/stack](https://github.com/eser/stack) **Install:**
> `pnpm add jsr:@eserstack/laroux-bundler`

Build system and bundler for [laroux.js](https://github.com/eser/stack) - A
React Server Components framework for Deno.

## Overview

This package provides the complete build system for laroux.js, including:

- **Runtime Bundler** - On-demand bundling during development with HMR
- **Prebuilt Bundler** - Production build optimization with code splitting
- **Deno Bundler** - Deno-native bundling with TypeScript support
- **Transform Pipeline** - JSX, TypeScript, and RSC transformation
- **Chunk Manifest** - Smart code splitting and lazy loading
- **Module Map** - Client component discovery and mapping
- **HMR Client** - Hot Module Replacement for instant updates
- **Error Overlay** - Beautiful development-mode error display
- **CSS Processing** - CSS bundling and optimization
- **Import Rewriting** - Automatic import path resolution

## Installation

```bash
pnpm add @eserstack/laroux-bundler
```

## Usage

### Runtime Bundler (Development)

The runtime bundler provides on-demand bundling with Hot Module Replacement:

```typescript
import { RuntimeBundler } from "@eserstack/laroux-bundler/runtime";

const bundler = new RuntimeBundler({
  srcDir: "./src",
  distDir: "./dist",
  enableHMR: true,
  logLevel: "info",
});

// Build on demand
const result = await bundler.buildClientComponent("./src/app/counter.tsx");

// Get client entry
const entry = await bundler.getClientEntry();

// Get module map for RSC
const moduleMap = bundler.getModuleMap();
```

### Prebuilt Bundler (Production)

The prebuilt bundler optimizes for production with code splitting:

```typescript
import { PrebuiltBundler } from "@eserstack/laroux-bundler/prebuilt";

const bundler = new PrebuiltBundler({
  srcDir: "./src",
  distDir: "./dist",
  optimize: true,
});

// Build all components upfront
await bundler.buildAll();

// Get optimized assets
const assets = bundler.getAssets();
const moduleMap = bundler.getModuleMap();
```

### Deno Bundler (Low-level)

Direct access to Deno's bundling capabilities:

```typescript
import { DenoBundler } from "@eserstack/laroux-bundler/deno";

const bundler = new DenoBundler({
  srcDir: "./src",
  distDir: "./dist",
});

// Bundle a single file
const result = await bundler.bundle("./src/app.tsx");

// Bundle with dependencies
const { code, map, dependencies } = await bundler.bundleWithDeps(
  "./src/app.tsx",
);
```

## API Reference

### Bundler Implementations

#### `RuntimeBundler`

On-demand bundler for development with HMR support.

```typescript
class RuntimeBundler {
  constructor(config: BundlerConfig);

  // Build a client component on-demand
  buildClientComponent(path: string): Promise<BuildResult>;

  // Get the client entry point (includes HMR client)
  getClientEntry(): Promise<string>;

  // Get module map for RSC rendering
  getModuleMap(): ModuleMap;

  // Watch for file changes and trigger HMR
  watch(): AsyncIterator<HMRUpdate>;
}
```

**Features:**

- Lazy bundling - only bundles requested files
- Hot Module Replacement with smart refresh
- Fast rebuild times with incremental compilation
- Source maps for debugging

#### `PrebuiltBundler`

Production bundler with optimization and code splitting.

```typescript
class PrebuiltBundler {
  constructor(config: BundlerConfig);

  // Build all components upfront
  buildAll(): Promise<void>;

  // Get all bundled assets
  getAssets(): Map<string, Asset>;

  // Get module map
  getModuleMap(): ModuleMap;

  // Get chunk manifest for lazy loading
  getChunkManifest(): ChunkManifest;
}
```

**Features:**

- Automatic code splitting by route
- Tree shaking and minification
- Asset optimization (CSS, images)
- Content hashing for cache busting
- Chunk manifest for lazy loading

#### `DenoBundler`

Low-level bundler using Deno's native capabilities.

```typescript
class DenoBundler {
  constructor(config: BundlerConfig);

  // Bundle a single file
  bundle(path: string): Promise<string>;

  // Bundle with dependency tracking
  bundleWithDeps(path: string): Promise<{
    code: string;
    map: string;
    dependencies: string[];
  }>;
}
```

### Transform Pipeline

Transform TypeScript and JSX code for the browser.

```typescript
import { transform } from "@eserstack/laroux-bundler/transform";

const result = await transform({
  code: `export function Counter() { return <div>Count</div> }`,
  filename: "counter.tsx",
  target: "client", // or "server"
  jsx: "react",
});

console.log(result.code); // Transformed JavaScript
console.log(result.map); // Source map
```

**Transformation Features:**

- TypeScript to JavaScript
- JSX to React.createElement (or custom pragma)
- Client/Server component boundary handling
- Import path rewriting for browser compatibility
- Source map generation

### Module Analysis

Analyze modules to find client components and dependencies.

```typescript
import { analyze } from "@eserstack/laroux-bundler/analyze";

const info = await analyze("./src/app/counter.tsx");

console.log(info.isClientComponent); // true if "use client"
console.log(info.isServerAction); // true if "use server"
console.log(info.imports); // All import statements
console.log(info.exports); // All exports
```

### Chunk Manifest

Manage code splitting and lazy loading.

```typescript
import { ChunkManifest } from "@eserstack/laroux-bundler/chunk-manifest";

const manifest = new ChunkManifest();

// Register chunks
manifest.addChunk("counter", {
  path: "/chunks/counter-abc123.js",
  dependencies: ["react", "shared"],
  size: 4096,
});

// Get chunk info
const chunk = manifest.getChunk("counter");
const deps = manifest.getDependencies("counter");

// Serialize for client
const json = manifest.toJSON();
```

### Module Map

Map server component references to client component chunks.

```typescript
import { createModuleMap } from "@eserstack/laroux-bundler/module-map";

const moduleMap = createModuleMap({
  "file:///src/app/counter.tsx": {
    default: {
      id: "/chunks/counter-abc123.js",
      chunks: ["/chunks/counter-abc123.js"],
      name: "default",
    },
  },
});

// Used by RSC renderer to inject client component references
```

### Import Rewriting

Rewrite import paths for browser compatibility.

```typescript
import { rewriteImports } from "@eserstack/laroux-bundler/rewrite-imports";

const code = `
  import React from "react";
  import { Counter } from "./counter.tsx";
`;

const rewritten = rewriteImports(code, {
  baseUrl: "/src",
  externals: {
    "react": "https://esm.sh/react@18",
  },
});

// Imports now use browser-compatible paths
```

### CSS Processing

Process and bundle CSS files.

```typescript
import { processCSS } from "@eserstack/laroux-bundler/css-processor";

const result = await processCSS({
  code: `
    .button {
      background: blue;
      &:hover { background: darkblue; }
    }
  `,
  filename: "button.css",
  minify: true,
});

console.log(result.code); // Processed and minified CSS
```

**CSS Features:**

- PostCSS processing
- Nested selectors
- Auto-prefixing
- Minification
- CSS Modules support

### Client Components

#### HMR Client

Hot Module Replacement client for development.

```typescript
import "@eserstack/laroux-bundler/client/hmr";

// Automatically connects to dev server via WebSocket
// Handles module updates without full page reload
// Preserves component state when possible
```

#### Error Overlay

Development-mode error display.

```typescript
import { ErrorOverlay } from "@eserstack/laroux-bundler/client/error-overlay";

// Add to your client entry during development
export function ClientRoot() {
  return (
    <>
      <App />
      {import.meta.env.DEV && <ErrorOverlay />}
    </>
  );
}
```

**Features:**

- Full-screen error display with stack traces
- Source-mapped error locations
- Dismissible overlays
- Auto-clear on fix

#### Lazy Loader

Lazy load components with automatic code splitting.

```typescript
import { lazy } from "@eserstack/laroux-bundler/client/lazy-loader";

// Lazy load a component
const Counter = lazy(() => import("./counter.tsx"));

// Use with Suspense
<Suspense fallback={<div>Loading...</div>}>
  <Counter />
</Suspense>;
```

#### Smart Refresh

Intelligent component refresh during HMR.

```typescript
import { SmartRefresh } from "@eserstack/laroux-bundler/client/smart-refresh";

// Wraps your app to enable smart refresh
export function ClientRoot() {
  return (
    <SmartRefresh>
      <App />
    </SmartRefresh>
  );
}
```

**Features:**

- Preserves component state when safe
- Full reload when needed (context changes, etc.)
- Error boundary integration

## Configuration

```typescript
interface BundlerConfig {
  // Source directory
  srcDir: string;

  // Output directory
  distDir: string;

  // Enable Hot Module Replacement
  enableHMR?: boolean;

  // Minify output
  minify?: boolean;

  // Generate source maps
  sourceMaps?: boolean;

  // External dependencies (not bundled)
  externals?: Record<string, string>;

  // Target environment
  target?: "browser" | "deno";

  // Logging level
  logLevel?: "trace" | "debug" | "info" | "warn" | "error";
}
```

## Build Modes

### Development Mode

- Runtime bundling (on-demand)
- Hot Module Replacement
- Source maps enabled
- Fast rebuild times
- Error overlay
- Unminified code

```bash
laroux dev  # Uses RuntimeBundler
```

### Production Mode

- Prebuilt bundling (all files upfront)
- Code splitting by route
- Tree shaking and minification
- Content hashing
- Optimized chunks
- No source maps (unless enabled)

```bash
laroux build  # Uses PrebuiltBundler
```

## How It Works

### 1. Module Discovery

The bundler scans your source directory for client components (files with
`"use client"`).

### 2. Transform Pipeline

Each file goes through:

1. TypeScript → JavaScript
2. JSX → React calls
3. Import path rewriting
4. Client/Server boundary injection

### 3. Code Splitting

Components are split into chunks based on:

- Route boundaries
- Dynamic imports
- Size thresholds

### 4. Module Map Generation

The bundler creates a module map that RSC uses to:

- Reference client components from server
- Inject chunk URLs into the stream
- Enable lazy loading

### 5. HMR (Development Only)

File changes trigger:

1. Incremental rebuild of affected modules
2. WebSocket notification to client
3. Smart component refresh (preserve state when safe)

## Related Packages

- **[@eserstack/cli](https://jsr.io/@eserstack/cli)** - Main CLI tool
  (`eser laroux` commands)
- **[@eserstack/laroux-core](https://jsr.io/@eserstack/laroux-core)** - Core
  runtime and utilities

## Documentation

- [User Guide](https://github.com/eser/stack/blob/main/docs/user-guide.md)
- [API Reference](https://github.com/eser/stack/blob/main/docs/api-reference.md)
- [JSR Package](https://jsr.io/@eserstack/laroux-bundler)

## License

Apache-2.0 © [Eser Ozvataf](https://github.com/eser)
