# @eser/laroux-core

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
deno add @eser/laroux-core
```

## Usage

This package is typically used by the `eser laroux` CLI commands (from
`@eser/cli`), but can also be used directly for custom server implementations:

```typescript
import { startServer } from "@eser/laroux-core/runtime/server";
import { RuntimeBundler } from "@eser/laroux-bundler";

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
import { startServer } from "@eser/laroux-core/runtime/server";

const server = await startServer({
  config: AppConfig,
  bundler: RuntimeBundler,
});
```

#### `@eser/laroux-react/runtime/rsc-handler`

React Server Components rendering and streaming.

```typescript
import { handleRSC } from "@eser/laroux-react/runtime/rsc-handler";

const response = await handleRSC(request, {
  config: AppConfig,
  bundler: RuntimeBundler,
});
```

#### `runtime/action-handler.ts`

Server Actions registry and invocation.

```typescript
import {
  handleServerAction,
  registerServerAction,
} from "@eser/laroux-core/runtime/action-handler";

// Register a server action
registerServerAction("myAction", async (data) => {
  // Server-side logic
  return { success: true };
});

// Handle action request
const response = await handleServerAction(request, config);
```

#### `runtime/html-shell.ts`

HTML shell generation for initial page load.

```typescript
import { generateHtmlShell } from "@eser/laroux-core/runtime/html-shell";

const html = generateHtmlShell({
  config: AppConfig,
  rscPayload: "...",
  moduleMap: { ... },
});
```

### Configuration System

Type-safe configuration loading with 3-layer merging (defaults → user config →
CLI args).

```typescript
import { loadConfig } from "@eser/laroux-core/config";
import type { UserConfig } from "@eser/laroux-core/config/schema";

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
import type { UserConfig } from "@eser/laroux-core/config/schema";

export default {
  port: 3000,
  srcDir: "./src",
  distDir: "./dist",
  publicDir: "./public",
  logLevel: "info",
  enableHMR: true,
} satisfies UserConfig;
```

### CLI Formatting

Beautiful colored terminal output with progress indicators.

```typescript
import {
  c,
  printBanner,
  printServerInfo,
  printSuccess,
  Spinner,
} from "@eser/laroux-core/cli-formatting";

// Print banner
printBanner("3.0.0");

// Colored output
console.log(c.success("Build completed!"));
console.log(c.error("Build failed!"));
console.log(c.brand("laroux.js"));

// Progress spinner
const spinner = new Spinner("Building...");
spinner.start();
// ... do work
spinner.succeed("Build complete!");

// Utility functions
printServerInfo(config);
printSuccess("Server started!");
```

**Color Utilities:**

```typescript
c.brand(text); // Cyan
c.success(text); // Green
c.error(text); // Red
c.warning(text); // Yellow
c.info(text); // Blue
c.dim(text); // Gray
c.bold(text); // Bold
c.code(text); // Code block
c.path(text); // File path
```

### Error Formatting

Structured error classes with helpful hints and beautiful formatting.

```typescript
import {
  BuildError,
  ConfigError,
  errors,
  formatError,
  LarouxError,
  RuntimeError,
  setupErrorHandlers,
} from "@eser/laroux-core/error-formatting";

// Setup global error handlers (for CLI)
setupErrorHandlers();

// Use error factories
throw errors.invalidConfig(
  "./laroux.config.ts",
  "Export must be a default export",
);

throw errors.portInUse(3000);

throw errors.buildFailed("TypeScript compilation failed");

// Custom errors
throw new ConfigError(
  "Invalid port number",
  "Port must be between 1024 and 65535",
);

// Format errors for display
const formatted = formatError(error);
console.error(formatted);
```

**Available Error Factories:**

- `errors.invalidConfig(path, reason)` - Config file issues
- `errors.missingDirectory(dir, purpose)` - Required directory missing
- `errors.portInUse(port)` - Port already in use
- `errors.moduleNotFound(path)` - Module import failed
- `errors.buildFailed(reason)` - Build process failed
- `errors.actionFailed(actionId, reason)` - Server action error
- `errors.componentError(name, reason)` - Component render error

## Related Packages

- **[@eser/cli](https://jsr.io/@eser/cli)** - Main CLI tool (`eser laroux`
  commands)
- **[@eser/laroux-bundler](https://jsr.io/@eser/laroux-bundler)** - Build system
  and HMR

## Documentation

- [User Guide](https://github.com/eser/stack/blob/main/docs/user-guide.md)
- [API Reference](https://github.com/eser/stack/blob/main/docs/api-reference.md)
- [JSR Package](https://jsr.io/@eser/laroux-core)

## License

Apache-2.0 © [Eser Ozvataf](https://github.com/eser)
