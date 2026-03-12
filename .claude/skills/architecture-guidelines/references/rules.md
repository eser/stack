# Architecture Guidelines - Detailed Rules

## Module System

Scope: JS/TS projects

Rule: Use ES Modules. ES Modules is official standard supported by all modern
browsers and WinterCG runtimes. Avoid CommonJS and AMD.

Correct:

```typescript
import * as path from "@std/path";
import { readFile } from "./utils.ts";

export function processFile() {}
export const CONFIG = {};
```

Incorrect:

```typescript
const path = require("path"); // CommonJS
const { readFile } = require("./utils");

module.exports = { processFile }; // CommonJS
exports.CONFIG = {}; // CommonJS
```

---

## Project Structure

Scope: All projects

Rule: Follow consistent directory and file structure. Makes it easier to
locate and manage files.

Example structure:

```
project/
├── src/
│   ├── app/           # Application code
│   └── components/    # Reusable components
├── tests/             # Test files
├── docs/              # Documentation
├── public/            # Static assets
└── config/            # Configuration files
```

Naming conventions:

- Use kebab-case for directories: `user-service/`
- Use PascalCase for component files: `UserProfile.tsx`
- Use camelCase for utility files: `formatDate.ts`
- Test files: `*.test.ts` or `*.spec.ts`

---

## Architectural Decision Records

Scope: All projects

Rule: Document architectural design records (ADRs) with trade-offs.
Captures important decisions with context and consequences.

ADR template (docs/adr/001-decision-title.md):

```markdown
# ADR 001: Decision Title

Date: 2025-01-15 Status: Accepted

## Context

What is the issue we're facing that motivates this decision?

## Decision

What is the change we're making?

## Consequences

What becomes easier or more difficult as a result of this change?

## Alternatives Considered

- Option A: pros/cons
- Option B: pros/cons

## Trade-offs

What are we optimizing for and what are we sacrificing?
```

---

## Testing

Scope: All projects

Rule: Write tests for code. Prefer automated testing with CI. Ensures
code works as expected and catches issues early.

Test structure:

```typescript
import { assertEquals } from "@std/assert";

Deno.test("function name - should do something", () => {
  const result = myFunction(input);
  assertEquals(result, expected);
});
```

CI configuration (.github/workflows/test.yml):

```yaml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: denoland/setup-deno@v2
      - run: deno test --allow-all
```

Coverage target: Aim for 80%+ code coverage for critical paths.

---

## Table-Driven Tests

Scope: Unit tests with multiple cases

Rule: Use table-driven patterns for tests with multiple inputs. Name
tests to describe behavior, not implementation.

Correct:

```typescript
import { assertEquals } from "@std/assert";

const cases = [
  { input: 0, expected: "zero", name: "handles zero" },
  { input: -1, expected: "negative", name: "handles negative numbers" },
  { input: 42, expected: "positive", name: "handles positive numbers" },
];

for (const { input, expected, name } of cases) {
  Deno.test(name, () => {
    assertEquals(classifyNumber(input), expected);
  });
}
```

Incorrect:

```typescript
Deno.test("test1", () => assertEquals(classifyNumber(0), "zero"));
Deno.test("test2", () => assertEquals(classifyNumber(-1), "negative"));
Deno.test("test3", () => assertEquals(classifyNumber(42), "positive"));
```

Benefits:

- Easy to add new test cases
- Reduces code duplication
- Clear relationship between inputs and expected outputs
- Descriptive test names improve test output readability

---

## Documentation Standards

Scope: Project documentation

Rule: Centralize docs in `docs/`, colocate component READMEs, use
consistent formatting.

**Directory Structure:**

```
project/
├── docs/                    # Permanent project documentation
│   ├── ARCHITECTURE.md
│   ├── SECURITY.md
│   ├── API_REFERENCE.md
│   └── adr/                 # Architectural Decision Records
│       └── 001-decision.md
├── packages/
│   └── auth/
│       └── README.md        # Component-specific docs
└── README.md                # Project overview
```

**Formatting Rules:**

- Clear filenames: `ALL_CAPS_WITH_UNDERSCORES.md` for project docs
- Include date stamps and status in document headers
- Provide concrete examples and code snippets
- Keep documentation synchronized with code changes

Correct:

```markdown
# API Reference

**Last Updated:** 2025-01-15 **Status:** Current

## Overview

Brief description of the API...

## Endpoints

### GET /users/:id

Returns user by ID.

**Example:**
```

curl https://api.example.com/users/123

```
```

Incorrect:

- Scattered .md files in root directory
- No date/status in headers
- Vague filenames like `notes.md` or `stuff.md`
- Missing code examples

---

## Hexagonal Architecture (Double-Layered)

Scope: All projects with external dependencies

Rule: Use double-layered hexagonal architecture. Domain layer contains both
business logic AND port interfaces/types together (no separate ports directory).
Adapters implement domain interfaces. Composition happens at call site via
explicit imports.

**Structure:**

```
package/
├── domain/                    # Business logic + port interfaces
│   ├── mod.ts                 # Re-exports all domain types
│   ├── bundler.ts             # Bundler interface + BundleData type
│   ├── framework-plugin.ts    # FrameworkPlugin interface + related types
│   └── build-cache.ts         # BuildCache interface + implementation
│
├── adapters/                  # All adapter implementations
│   ├── react/                 # implements FrameworkPlugin
│   ├── tailwindcss/           # implements CssPlugin
│   ├── lightningcss/          # implements CssTransformer
│   └── prebuilt-bundler/      # implements Bundler
│
└── mod.ts                     # Main entry, exports bundle function
```

**Composition via Explicit Imports:**

Correct:

```typescript
// User explicitly imports what they need
import { bundle } from "@eser/laroux-bundler";
import { reactPlugin } from "@eser/laroux-bundler/adapters/react";
import { tailwindPlugin } from "@eser/laroux-bundler/adapters/tailwindcss";
import { PrebuiltBundler } from "@eser/laroux-bundler/adapters/prebuilt-bundler";

// Pass adapters as parameters
await bundle(config, {
  framework: reactPlugin,
  css: tailwindPlugin,
  bundler: new PrebuiltBundler(bundlerConfig),
});
```

Incorrect:

```typescript
// Magic config strings - avoid
const config = {
  framework: "react",  // String-based selection
  css: "tailwindcss",
  bundler: "prebuilt",
};
await bundle(config);  // Dynamic imports inside

// Convenience factory functions - avoid
const plugins = await createReactTailwindPlugins();  // Hides adapter selection
await bundle(config, plugins);                        // User doesn't control what loads

// Separate ports directory - avoid
import type { Plugin } from "./ports/plugin.ts";  // Don't separate ports
import { logic } from "./domain/logic.ts";        // from domain
```

**Why Avoid Convenience Factories:**

- Hide which adapters are loaded (opaque dependency graph)
- Require dynamic imports that break tree-shaking
- Make it harder to swap individual adapters
- Add unnecessary abstraction layer
- Users should always know exactly what they're importing

**Benefits:**

- Tree-shaking works naturally (unused adapters not bundled)
- Type-safe: TypeScript validates plugin interfaces at compile time
- User controls exactly what gets loaded
- Easy to swap adapters (Vue instead of React, UnoCSS instead of Tailwind)
- No runtime magic or dynamic imports
- Clear dependency graph

**Domain Layer Design:**

Domain files contain both interfaces and business logic:

```typescript
// domain/framework-plugin.ts
export type ClientComponent = {
  filePath: string;
  relativePath: string;
  exportNames: string[];
};

export type FrameworkPlugin = {
  name: string;
  analyzeClientComponents?: (srcDir: string) => Promise<ClientComponent[]>;
  transformClientComponents?: (components: ClientComponent[]) => Promise<void>;
};

// Noop implementation for when no framework is configured
export const noopPlugin: FrameworkPlugin = {
  name: "noop",
  analyzeClientComponents: () => Promise.resolve([]),
};
```

**Adapter Implementation:**

```typescript
// adapters/react/plugin.ts
import type { FrameworkPlugin } from "../../domain/framework-plugin.ts";

export const reactPlugin: FrameworkPlugin = {
  name: "react",
  analyzeClientComponents: async (srcDir) => {
    // React-specific implementation
  },
};
```

---

## Centralized Backend Object Pattern

Scope: Frontend applications communicating with backend APIs

Rule: Use a centralized backend object as single entry point for all API
communication. Import the backend object, not individual functions. Type imports
only from submodules.

**Structure:**

```
src/modules/backend/
├── backend.ts              # Main entry - exports backend object
├── fetcher.ts              # HTTP client utilities
├── types.ts                # Shared types
├── profiles/
│   ├── get-profile.ts      # Individual function
│   ├── list-profiles.ts
│   └── types.ts            # Profile-specific types
└── users/
    ├── get-user.ts
    └── types.ts
```

Correct:

```typescript
// ✅ Import via centralized backend object
import { backend } from "@/modules/backend/backend.ts";
import type { Profile } from "@/modules/backend/types.ts";

async function UserProfile(props: { profileId: string }) {
  const profile = await backend.getProfile("en", props.profileId);
  return <div>{profile.title}</div>;
}
```

Incorrect:

```typescript
// ❌ Direct function imports bypass abstraction
import { getProfile } from "@/modules/backend/profiles/get-profile.ts";

async function UserProfile(props: { profileId: string }) {
  const profile = await getProfile("en", props.profileId);
  return <div>{profile.title}</div>;
}

// ❌ Inline fetch logic in components
async function UserProfile(props: { profileId: string }) {
  const response = await fetch(`/api/profiles/${props.profileId}`);
  const profile = await response.json();
  return <div>{profile.title}</div>;
}
```

**Backend Object Implementation:**

```typescript
// backend.ts
import { getProfile } from "./profiles/get-profile.ts";
import { listProfiles } from "./profiles/list-profiles.ts";
import { getUser } from "./users/get-user.ts";

export const backend = {
  // Profiles
  getProfile,
  listProfiles,

  // Users
  getUser,
} as const;
```

**Benefits:**

- Single source of truth for all backend functionality
- Clear contract between frontend and backend
- Easier to mock in tests
- Simplified refactoring when API changes
- Type safety across the application

---

## Monorepo Structure

Scope: Large projects with multiple applications

Rule: Organize code into apps/ for deployable applications and packages/ for
shared libraries. Each app follows domain-specific patterns.

**Structure:**

```
project/
├── apps/
│   ├── webclient/                # Frontend application
│   │   └── src/
│   │       ├── routes/           # File-based routing
│   │       ├── components/       # UI components
│   │       ├── modules/          # Feature modules
│   │       └── lib/              # Utilities
│   └── services/                 # Backend services
│       └── pkg/
│           ├── api/
│           │   ├── business/     # Pure business logic
│           │   └── adapters/     # External implementations
│           └── lib/              # Shared libraries
└── packages/                     # Shared packages (future)
```

**Rules:**

- Frontend apps use file-based routing when framework supports it
- Backend services follow hexagonal architecture
- Shared code goes in packages/ with clear dependencies
- Each app has its own build configuration
