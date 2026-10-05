# 📑 [@eserstack/standards](./)

> **eserstack Foundation** —
> [eser/stack on GitHub](https://github.com/eser/stack) **Install:**
> `pnpm add jsr:@eserstack/standards`

Cross-runtime standards and utilities for TypeScript applications. Provides
common interfaces, type declarations, and utility functions for building
portable applications.

## 🚀 Quick Start

```typescript
import * as standards from "@eserstack/standards";

// Runtime abstraction — works on Deno, Node.js, Bun, and browsers
const { runtime } = standards.crossRuntime;
const content = await runtime.fs.readTextFile("config.json");
const joined = runtime.path.join("src", "utils.ts");

// String interpolation
const greeting = standards.strings.interpolate("Hello {name}!", {
  name: "World",
});

// Formatters
const size = standards.formatters.formatSize(1048576); // "1.00 MB"

// Date utilities
const relative = standards.datetimes.getRelativeTime(
  new Date(Date.now() - 3600000),
);
// "1 hour ago"
```

## 🛠 Features

- **Logging Standards**: OpenTelemetry severity levels
- **Date/Time Utilities**: Formatting, relative time, date comparisons
- **String Interpolation**: Template-based string formatting
- **Value Formatters**: Duration, size, number, and percentage formatting
- **Internationalization**: Locale detection and RTL support
- **Runtime Abstraction**: Cross-runtime API for Deno, Node.js, Bun, and more
- **Route Matching**: URL pattern matching utilities
- **Registry**: Immutable, indexed data structures

## Modules

### Logging Standards

OpenTelemetry severity levels for consistent logging across applications.

```typescript
import * as standards from "@eserstack/standards";

standards.logging.Severities.Trace; // 1  - Most fine-grained diagnostic
standards.logging.Severities.Debug; // 5  - Detailed troubleshooting
standards.logging.Severities.Info; // 9  - Normal operational messages
standards.logging.Severities.Notice; // 10 - Normal but significant
standards.logging.Severities.Warning; // 13 - Potential issues
standards.logging.Severities.Error; // 17 - Functionality-breaking
standards.logging.Severities.Critical; // 21 - Non-recoverable failures
standards.logging.Severities.Alert; // 22 - Immediate action required
standards.logging.Severities.Emergency; // 23 - System is unusable

standards.logging.SeverityNames[standards.logging.Severities.Error]; // "Error"
```

> Higher severity numbers indicate more severe conditions (OpenTelemetry model).

### Date/Time Utilities

Date formatting, relative time, and comparison functions. The comparison
functions take an optional second argument, the reference time, which defaults
to now.

```typescript
import * as standards from "@eserstack/standards";

// Format dates
standards.datetimes.toISODate(new Date("2024-12-29T10:30:00Z")); // "2024-12-29"
standards.datetimes.toISODateTime(new Date("2024-12-29T10:30:00Z"));
// "2024-12-29T10:30:00.000Z"

// Relative time
standards.datetimes.getRelativeTime(new Date(Date.now() - 3600000)); // "1 hour ago"
standards.datetimes.getRelativeTime(new Date(Date.now() + 90000000)); // "in 1 day"

// Date comparisons
const yesterday = new Date(Date.now() - 86400000);
const tomorrow = new Date(Date.now() + 86400000);

standards.datetimes.isToday(new Date()); // true
standards.datetimes.isPast(yesterday); // true
standards.datetimes.isFuture(tomorrow); // true
```

### String Interpolation

Template-based string formatting with placeholder replacement.

```typescript
import * as standards from "@eserstack/standards";

// Simple interpolation
standards.strings.interpolate("Hello {name}!", { name: "World" });
// "Hello World!"

// Create reusable interpolator
const greet = standards.strings.createInterpolator("Welcome {user} to {app}!");
greet({ user: "Alice", app: "MyApp" }); // "Welcome Alice to MyApp!"
greet({ user: "Bob", app: "MyApp" }); // "Welcome Bob to MyApp!"

// Extract placeholders for validation
standards.strings.extractPlaceholders(
  "Hello {name}, you have {count} messages",
);
// ["name", "count"]
```

### Value Formatters

Human-readable formatting for durations, sizes, numbers, and percentages.

```typescript
import * as standards from "@eserstack/standards";

// Duration formatting
standards.formatters.formatDuration(500); // "500ms"
standards.formatters.formatDuration(1500); // "1.50s"
standards.formatters.formatDuration(65000); // "65.00s"

// File size formatting
standards.formatters.formatSize(500); // "500.00 B"
standards.formatters.formatSize(1536); // "1.50 KB"
standards.formatters.formatSize(1048576); // "1.00 MB"
standards.formatters.formatSize(1073741824); // "1.00 GB"

// Number formatting with thousands separators
standards.formatters.formatNumber(1000); // "1,000"
standards.formatters.formatNumber(1000000); // "1,000,000"

// Percentage formatting
standards.formatters.formatPercent(75.5); // "75.5%"
standards.formatters.formatPercent(0.75, 1, true); // "75.0%" (ratio mode)
```

### Internationalization (i18n)

Locale detection, RTL handling, and i18n utilities.

```typescript
import * as standards from "@eserstack/standards";

// Check if locale is supported
standards.i18n.isCommonLocale("en"); // true
standards.i18n.isCommonLocale("fr"); // true
standards.i18n.isCommonLocale("xx"); // false

// RTL support
standards.i18n.isRtlLocale("ar"); // true (Arabic)
standards.i18n.isRtlLocale("he"); // true (Hebrew)
standards.i18n.isRtlLocale("en"); // false

// Get text direction for CSS
standards.i18n.getTextDirection("ar"); // "rtl"
standards.i18n.getTextDirection("en"); // "ltr"

// Parse a locale tag
standards.i18n.parseLocale("en-US"); // { language: "en", region: "US" }
standards.i18n.getLanguageCode("pt-BR"); // "pt"

// Default locale
standards.i18n.DEFAULT_LOCALE; // "en"
```

`standards.i18n.COMMON_LOCALES` lists the supported locale codes.

### Runtime Abstraction

Cross-runtime support for Deno, Node.js, Bun, Cloudflare Workers, and browsers.
Architecture: `adapters/shared.ts` (base layer) composed with runtime-specific
adapters (`deno.ts`, `node.ts`, `bun.ts`, `browser.ts`, `workerd.ts`).

```typescript
import * as standards from "@eserstack/standards";

const { runtime } = standards.crossRuntime;

// Auto-detected runtime singleton
runtime.name; // "deno" | "node" | "bun" | "workerd" | "browser"
runtime.version; // "2.0.0"

// Check capabilities before use
if (runtime.capabilities.fs) {
  const content = await runtime.fs.readTextFile("config.json");
}

if (runtime.capabilities.exec) {
  const output = await runtime.exec.exec("git", ["status"]);
}

// Environment variables
const apiKey = runtime.env.get("API_KEY");

// Process info
const cwd = runtime.process.cwd();
const args = runtime.process.args;

// Create runtime with mocks for testing
const mockRuntime = await standards.crossRuntime.createRuntime({
  env: {
    get: () => "mock",
    set: () => {},
    delete: () => {},
    has: () => true,
    toObject: () => ({}),
  },
});
```

#### File modes and live processes

`runtime.fs.stat()` and `runtime.fs.lstat()` return a `FileInfo` carrying
`mode`: POSIX mode bits, or `null` where the platform does not report them.
Windows has no execute bit, so callers must read `null` as "cannot tell from the
mode", **not** as "not executable".

`runtime.process.isAlive(pid)` reports whether a process id is running. A pid
owned by another user counts as alive; only a definite "no such process" is
false. It exists because "is the process that wrote this claim still running" is
not answerable from a pid alone, and trusting a recorded pid forever turns any
interrupted run into permanently wrong state.

Both checks go through `runtime`, so code that needs them does not reach for
`Deno.*` (which breaks under Node) or a runtime-specific global.

#### HTTP server, WebSockets and signals

`runtime.http.serve` answers HTTP requests with a fetch-style handler on Deno,
Node and Bun; check `runtime.capabilities.http` first, since Workers and
browsers have no server. It resolves once the server listens, binds to
`127.0.0.1` unless you pass `hostname`, and stops when its `signal` aborts,
closing open connections and WebSockets. A handler that throws sends the client
a 500 response, and the error is printed to stderr.

Inside a handler, `runtime.http.upgradeWebSocket(request)` accepts a WebSocket
handshake. Add the socket's listeners, then return `response` unchanged from the
handler. `runtime.process.addSignalListener` and `removeSignalListener` listen
for OS signals such as `SIGINT`. Deno throws for a signal it cannot listen for
on the platform (`SIGBREAK` outside Windows, anything but `SIGINT` and
`SIGBREAK` on Windows); Node and Bun accept every name, and a listener for a
signal the platform never sends never runs.

```typescript
import * as standards from "@eserstack/standards";

const { runtime } = standards.crossRuntime;
const controller = new AbortController();

const server = await runtime.http.serve(
  { port: 8080, signal: controller.signal },
  (request) => {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Hello from every runtime");
    }

    // Echo each WebSocket message back to the client.
    const { socket, response } = runtime.http.upgradeWebSocket(request);
    socket.addEventListener("message", (event) => socket.send(event.data));

    return response;
  },
);

// Ctrl+C stops the server; `finished` resolves once it has stopped.
const onInterrupt = (): void => controller.abort();
runtime.process.addSignalListener("SIGINT", onInterrupt);

await server.finished;
runtime.process.removeSignalListener("SIGINT", onInterrupt);
```

On Deno, the socket is Deno's own `WebSocket`. On Node and Bun it is a
`WebSocket` the adapter provides, and binary messages arrive as an `ArrayBuffer`
by default, as on Deno. The Node adapter builds on `node:http`, speaks the
WebSocket protocol itself and refuses a client message over 16 MiB.

### CLI Execution Context

Detect how the CLI was invoked and build reproducible commands for git hooks.

```typescript
import * as standards from "@eserstack/standards";

const cliOptions = {
  command: "eser",
  devCommand: "deno task cli",
  npmPackage: "eser",
  jsrPackage: "@eserstack/cli",
};

// Detect full execution context
const ctx = await standards.crossRuntime.detectExecutionContext(cliOptions);
ctx.runtime; // "deno" | "node" | "bun" | "compiled"
ctx.invoker; // "npm" | "npx" | "pnpm" | "pnpx" | "bun" | "bunx" | "deno" | "dev" | "binary"
ctx.command; // "npx eser" (canonical, reproducible command)

// Find subcommand prefix for hooks/manifest
const prefix = await standards.crossRuntime.getCliPrefix(cliOptions, [
  "noskills",
  "nos",
]);
// "npx eser noskills"  (when invoked as: npx eser noskills init)
// "deno task cli nos"  (when invoked as: deno task cli nos init)

// Pure function for testing (no runtime access)
standards.crossRuntime.matchCliPrefix(
  ["noskills", "nos"],
  ["npx", "eser", "noskills", "init"],
);
// "npx eser noskills"
```

### Route Matching

URL pattern matching for routing, with dynamic segments (`[param]`) and
catch-all segments (`[...param]`). Pass the pathname as the URL has it
(`URL.pathname`, percent-encoded). Params come back decoded, and a segment with
a malformed escape such as `100%` keeps its raw form. A decoded value can hold
`/` or `..`, so validate it before it goes into a file path or a query. A
catch-all matches zero or more segments, its bare prefix included, so a path and
its `normalizePath()` form reach the same route.

```typescript
import * as standards from "@eserstack/standards";

standards.routes.matchRoute("/stories/hello", "/stories/[slug]");
// { slug: "hello" }

standards.routes.matchRoute("/docs/a/b/c", "/docs/[...path]");
// { path: ["a", "b", "c"] }

standards.routes.matchRoute("/stories/hello%20world", "/stories/[slug]");
// { slug: "hello world" }

standards.routes.matchRoute("/docs", "/docs/[...path]");
// { path: [] }

// The first matching route wins, so list the most specific first
const match = standards.routes.findMatchingRoute("/stories/hello", [
  { path: "/stories/featured", data: "featured" },
  { path: "/stories/[slug]", data: "story" },
]);
// { route: { path: "/stories/[slug]", data: "story" }, params: { slug: "hello" } }

standards.routes.normalizePath("stories/hello/"); // "/stories/hello"
```

### Registry

Immutable, indexed data structures for efficient lookups. A builder collects
entries, and `build()` seals them into a read-only registry.

```typescript
import * as standards from "@eserstack/standards";

type User = { name: string };

// Simple registry
const registry = standards.collections.createRegistryBuilder<string, User>()
  .set("alice", { name: "Alice" })
  .setLazy("bob", () => ({ name: "Bob" })) // created on first read
  .build();

registry.get("alice"); // { name: "Alice" }
registry.isLazy("bob"); // true

// Copy-on-write: a new registry, the original stays unchanged
const extended = registry.toBuilder().set("carol", { name: "Carol" }).build();

// Indexed registry for lookups by a secondary key
type Format = { name: string; extensions: string[] };

const formats = standards.collections.createIndexedRegistryBuilder<
  string,
  Format
>([
  standards.collections.createExtensionIndex<Format>(
    "byExtension",
    (f) => f.extensions,
  ),
])
  .set("yaml", { name: "yaml", extensions: ["yaml", "yml"] })
  .build();

formats.getByIndex("byExtension", "yml"); // the yaml format
```

## Other Utilities

### HTTP Errors

```typescript
import * as standards from "@eserstack/standards";

const error = new standards.httpError.HttpError(404, "User not found");
error.status; // 404

new standards.httpError.HttpError(503).message; // "Service Unavailable"

// Factories for common statuses
standards.httpError.notFound("User not found"); // same as the HttpError above

standards.httpError.isHttpError(error); // true
```

### Run Modes

`RunModes` holds bit flags; the helpers test a mode value against them.

```typescript
import * as standards from "@eserstack/standards";

const mode = standards.runModes.RunModes.Development;

if (standards.runModes.inProductionMode(mode)) {
  // Production-only code
}

standards.runModes.inDevelopmentMode(mode); // true
standards.runModes.inTestMode(mode); // false
```

### Versions

```typescript
import * as standards from "@eserstack/standards";

// true when the target version is newer than the current one
standards.versions.compareTextVersions("4.1.22", "4.1.23"); // true
standards.versions.compareTextVersions("4.1.23", "4.1.22"); // false

// true when the current version satisfies the target range
standards.versions.compareTextVersions("4.1.22", "^4.1.0"); // true

// the larger of two release types
standards.versions.maxVersion("minor", "patch"); // "minor"
```

### File Patterns

```typescript
import * as standards from "@eserstack/standards";

standards.patterns.JS_FILE_PATTERN.test("app/page.tsx"); // true
standards.patterns.replaceJsExtension("app/counter.tsx", ".js"); // "app/counter.js"
standards.patterns.hasExtension("styles.css", ["css", "scss"]); // true
```

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- `routes.matchPattern`, `matchRoute` and `findMatchingRoute` return params
  percent-decoded, and a catch-all also matches its bare prefix. Pass the
  pathname percent-encoded, as `URL.pathname` gives it, and remove your own
  `decodeURIComponent`, or values with `%` get decoded twice. List a route for
  `/docs` before the catch-all if `/docs` should reach another route:

  ```typescript
  import * as standards from "@eserstack/standards";

  const params = standards.routes.matchRoute(
    "/stories/hello%20world",
    "/stories/[slug]",
  );
  // Before: decodeURIComponent(params.slug); After: params.slug is "hello world"
  standards.routes.matchRoute("/docs", "/docs/[...path]");
  // Before: null; After: { path: [] }
  ```

- `cross-runtime`: `Runtime` has a required `http`, `RuntimeProcess` has
  `addSignalListener` and `removeSignalListener`, and `RuntimeCapabilities` has
  `http: boolean`. A hand-built runtime or mock no longer type-checks. Spread
  the real objects and override what you need, add `http: false` to capability
  literals, or build the mock with `await createRuntime({ ... })`:

  ```typescript
  import * as standards from "@eserstack/standards";

  const { runtime } = standards.crossRuntime;

  // Before: const fakeProcess = { cwd: () => "/tmp", ... };
  const fakeProcess = { ...runtime.process, cwd: () => "/tmp" };
  ```

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
