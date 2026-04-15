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
import { Severities, SeverityNames } from "@eserstack/standards/logging";

Severities.Trace; // 1  - Most fine-grained diagnostic
Severities.Debug; // 5  - Detailed troubleshooting
Severities.Info; // 9  - Normal operational messages
Severities.Notice; // 10 - Normal but significant
Severities.Warning; // 13 - Potential issues
Severities.Error; // 17 - Functionality-breaking
Severities.Critical; // 21 - Non-recoverable failures
Severities.Alert; // 22 - Immediate action required
Severities.Emergency; // 23 - System is unusable

SeverityNames[Severities.Error]; // "Error"
```

> Higher severity numbers indicate more severe conditions (OpenTelemetry model).

### Date/Time Utilities

Date formatting, relative time, and comparison functions.

```typescript
import {
  getRelativeTime,
  isFuture,
  isPast,
  isToday,
  toISODate,
  toISODateTime,
} from "@eserstack/standards/datetimes";

// Format dates
toISODate(new Date()); // "2024-12-29"
toISODateTime(new Date()); // "2024-12-29T10:30:00.000Z"

// Relative time
getRelativeTime(new Date(Date.now() - 3600000)); // "1 hour ago"
getRelativeTime(new Date(Date.now() + 86400000)); // "in 1 day"

// Date comparisons
isToday(new Date()); // true
isPast(yesterdayDate); // true
isFuture(tomorrowDate); // true
```

### String Interpolation

Template-based string formatting with placeholder replacement.

```typescript
import {
  createInterpolator,
  extractPlaceholders,
  interpolate,
} from "@eserstack/standards/strings";

// Simple interpolation
interpolate("Hello {name}!", { name: "World" });
// "Hello World!"

// Create reusable interpolator
const greet = createInterpolator("Welcome {user} to {app}!");
greet({ user: "Alice", app: "MyApp" }); // "Welcome Alice to MyApp!"
greet({ user: "Bob", app: "MyApp" }); // "Welcome Bob to MyApp!"

// Extract placeholders for validation
extractPlaceholders("Hello {name}, you have {count} messages");
// ["name", "count"]
```

### Value Formatters

Human-readable formatting for durations, sizes, numbers, and percentages.

```typescript
import {
  formatDuration,
  formatNumber,
  formatPercent,
  formatSize,
} from "@eserstack/standards/formatters";

// Duration formatting
formatDuration(500); // "500ms"
formatDuration(1500); // "1.50s"
formatDuration(65000); // "65.00s"

// File size formatting
formatSize(500); // "500.00 B"
formatSize(1536); // "1.50 KB"
formatSize(1048576); // "1.00 MB"
formatSize(1073741824); // "1.00 GB"

// Number formatting with thousands separators
formatNumber(1000); // "1,000"
formatNumber(1000000); // "1,000,000"

// Percentage formatting
formatPercent(75.5); // "75.5%"
formatPercent(0.75, 1, true); // "75.0%" (ratio mode)
```

### Internationalization (i18n)

Locale detection, RTL handling, and i18n utilities.

```typescript
import {
  COMMON_LOCALES,
  DEFAULT_LOCALE,
  getTextDirection,
  isCommonLocale,
  isRtlLocale,
} from "@eserstack/standards/i18n";

// Check if locale is supported
isCommonLocale("en"); // true
isCommonLocale("fr"); // true
isCommonLocale("xx"); // false

// RTL support
isRtlLocale("ar"); // true (Arabic)
isRtlLocale("he"); // true (Hebrew)
isRtlLocale("en"); // false

// Get text direction for CSS
getTextDirection("ar"); // "rtl"
getTextDirection("en"); // "ltr"

// Default locale
const locale = userLocale ?? DEFAULT_LOCALE; // "en"
```

### Runtime Abstraction

Cross-runtime support for Deno, Node.js, Bun, Cloudflare Workers, and browsers.
Architecture: `adapters/shared.ts` (base layer) composed with runtime-specific
adapters (`deno.ts`, `node.ts`, `bun.ts`, `browser.ts`, `workerd.ts`).

```typescript
import {
  createRuntime,
  detectRuntime,
  runtime,
} from "@eserstack/standards/cross-runtime";

// Auto-detected runtime singleton
console.log(runtime.name); // "deno" | "node" | "bun" | "workerd" | "browser"
console.log(runtime.version); // "2.0.0"

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
const mockRuntime = await createRuntime({
  env: {
    get: () => "mock",
    set: () => {},
    delete: () => {},
    has: () => true,
    toObject: () => ({}),
  },
});
```

### CLI Execution Context

Detect how the CLI was invoked and build reproducible commands for git hooks.

```typescript
import {
  detectExecutionContext,
  getCliPrefix,
  matchCliPrefix,
} from "@eserstack/standards/cross-runtime";

// Detect full execution context
const ctx = await detectExecutionContext({
  command: "eser",
  devCommand: "deno task cli",
  npmPackage: "eser",
  jsrPackage: "@eserstack/cli",
});
console.log(ctx.runtime); // "deno" | "node" | "bun" | "compiled"
console.log(ctx.invoker); // "npm" | "npx" | "pnpm" | "pnpx" | "bun" | "bunx" | "deno" | "dev" | "binary"
console.log(ctx.command); // "npx eser" (canonical, reproducible command)

// Find subcommand prefix for hooks/manifest
const prefix = await getCliPrefix(
  {
    command: "eser",
    devCommand: "deno task cli",
    npmPackage: "eser",
    jsrPackage: "@eserstack/cli",
  },
  ["noskills", "nos"],
);
// → "npx eser noskills"  (when invoked as: npx eser noskills init)
// → "deno task cli nos"  (when invoked as: deno task cli nos init)

// Pure function for testing (no runtime access)
const result = matchCliPrefix(
  ["noskills", "nos"],
  ["npx", "eser", "noskills", "init"],
);
// → "npx eser noskills"
```

### Route Matching

URL pattern matching for routing.

```typescript
import { createRouteMatcher } from "@eserstack/standards/routes";

const matcher = createRouteMatcher([
  { pattern: "/users/:id", handler: "getUser" },
  { pattern: "/users/:id/posts/*", handler: "getUserPosts" },
  { pattern: "/api/**", handler: "apiProxy" },
]);

const match = matcher.match("/users/123");
// { handler: "getUser", params: { id: "123" } }

const match2 = matcher.match("/users/123/posts/456");
// { handler: "getUserPosts", params: { id: "123", "*": "456" } }
```

### Registry

Immutable, indexed data structures for efficient lookups.

```typescript
import {
  createIndexedRegistry,
  createRegistry,
} from "@eserstack/standards/collections";

// Simple registry
const registry = createRegistry<{ id: string; name: string }>();
const updated = registry.set("user-1", { id: "user-1", name: "Alice" });

// Indexed registry for fast lookups
const indexed = createIndexedRegistry<User>({
  indexes: ["email", "role"],
});
const withUser = indexed.set("user-1", {
  id: "user-1",
  email: "alice@example.com",
  role: "admin",
});
const admins = withUser.getByIndex("role", "admin");
```

## Other Utilities

### HTTP Errors

```typescript
import { HttpError } from "@eserstack/standards/http-error";

throw new HttpError(404, "User not found");
throw new HttpError(401, "Unauthorized", { code: "AUTH_REQUIRED" });
```

### Run Modes

```typescript
import {
  isDevelopment,
  isProduction,
  RunModes,
} from "@eserstack/standards/run-modes";

if (isProduction()) {
  // Production-only code
}
```

### Versions

```typescript
import { compareVersions, parseVersion } from "@eserstack/standards/versions";

const v = parseVersion("1.2.3");
// { major: 1, minor: 2, patch: 3 }

compareVersions("1.2.0", "1.3.0"); // -1 (less than)
```

---

🔗 For further details, visit the
[eserstack repository](https://github.com/eser/stack).
