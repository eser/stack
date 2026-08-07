# @eserstack/laroux-server

> **eserstack Product-Candidate** — SSR runtime for laroux ·
> [eser/stack](https://github.com/eser/stack) **Install:**
> `pnpm add jsr:@eserstack/laroux-server`

Core runtime and utilities for [laroux.js](https://github.com/eser/stack) - A
React Server Components framework for Deno.

## Overview

This package contains the core runtime logic and utilities for laroux.js,
including:

- **HTTP Server** - Request handling, routing, and static file serving
- **RSC Handler** - React Server Components rendering and streaming
- **Server Actions** - Server-side function invocation from client components
- **HTML Shell** - Initial HTML document generation
- **Configuration System** - Type-safe config loading with 3-layer merging
- **Error Formatting** - Beautiful error messages with hints and stack traces
- **CLI Formatting** - Colored output, banners, spinners, and progress
  indicators

## Installation

```bash
pnpm add @eserstack/laroux-server
```

## Usage

This package is typically used by the `eser laroux` CLI commands (from
`@eserstack/cli`), but can also be used directly for custom server
implementations:

```typescript
import { startServer } from "@eserstack/laroux-server";
import { RuntimeBundler } from "@eserstack/laroux-bundler";

const server = await startServer({
  config: {
    port: 8000,
    srcDir: "./src",
    distDir: "./dist",
    // ... other config
  },
  bundler: new RuntimeBundler({ srcDir: "./src" }),
});
```

## API Reference

### Runtime Modules

#### `runtime/server.ts`

HTTP server with routing and static file serving.

```typescript
import { startServer } from "@eserstack/laroux-server";

const server = await startServer({
  config: AppConfig,
  bundler: RuntimeBundler,
});
```

### Configuration System

Type-safe configuration loading with 3-layer merging (defaults → user config →
CLI args).

```typescript
import { loadConfig } from "@eserstack/laroux-server/config";
import type { AppConfig } from "@eserstack/laroux-server/config";

// Load configuration
const config = await loadConfig({
  configPath: "./laroux.config.ts",
  cliOptions: {
    port: 3000,
    logLevel: "info",
  },
});
```

**Configuration Schema:**

```typescript
interface UserConfig {
  port?: number;
  srcDir?: string;
  distDir?: string;
  publicDir?: string;
  logLevel?: "trace" | "debug" | "info" | "warn" | "error";
  enableHMR?: boolean;
  // ... see config/schema.ts for full schema
}
```

**Example `laroux.config.ts`:**

```typescript
import type { AppConfig } from "@eserstack/laroux-server/config";

export default {
  port: 3000,
  srcDir: "./src",
  distDir: "./dist",
  publicDir: "./public",
  logLevel: "info",
  enableHMR: true,
} satisfies UserConfig;
```

## Related Packages

- **[@eserstack/cli](https://jsr.io/@eserstack/cli)** - Main CLI tool
  (`eser laroux` commands)
- **[@eserstack/laroux-bundler](https://jsr.io/@eserstack/laroux-bundler)** -
  Build system and HMR

## Documentation

- [User Guide](https://github.com/eser/stack/blob/main/docs/user-guide.md)
- [API Reference](https://github.com/eser/stack/blob/main/docs/api-reference.md)
- [JSR Package](https://jsr.io/@eserstack/laroux-server)

## License

Apache-2.0 © [Eser Ozvataf](https://github.com/eser)
