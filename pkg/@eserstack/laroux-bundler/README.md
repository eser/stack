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
import { RuntimeBundler } from "@eserstack/laroux-bundler/adapters/runtime-bundler";

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
import { PrebuiltBundler } from "@eserstack/laroux-bundler/adapters/prebuilt-bundler";

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
- **[@eserstack/laroux-server](https://jsr.io/@eserstack/laroux-server)** -
  Server runtime (SSR, routing, actions)
- **[@eserstack/laroux](https://jsr.io/@eserstack/laroux)** - Framework-agnostic
  core utilities

## Documentation

- [JSR Package](https://jsr.io/@eserstack/laroux-bundler) — symbol-level API
  reference, generated from source
- [Architecture decision records](https://github.com/eser/stack/tree/main/docs/adr)
- Generate the API reference locally with `deno task cli docs` (output lands in
  `docs/api/`, which is not tracked)

## License

Apache-2.0 © [Eser Ozvataf](https://github.com/eser)
