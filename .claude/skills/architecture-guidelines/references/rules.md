# Architecture Guidelines - Detailed Rules

## Module System

Scope: JS/TS projects Rule: Use ES Modules. ES Modules is official standard
supported by all modern browsers and WinterCG runtimes. Avoid CommonJS and AMD.

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

Scope: All projects Rule: Follow consistent directory and file structure. Makes
it easier to locate and manage files.

Example structure:

```
project/
├── src/
│   ├── app/           # Application code
│   ├── components/    # Reusable components
│   └── utils/         # Utility functions
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

Scope: All projects Rule: Document architectural design records (ADRs) with
trade-offs. Captures important decisions with context and consequences.

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

Scope: All projects Rule: Write tests for code. Prefer automated testing with
CI. Ensures code works as expected and catches issues early.

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

## Entry Point Convention

Scope: JS/TS projects Rule: Use `mod.ts` as module entry points, not `index.ts`.
Follows Deno convention and makes exports explicit.

Correct:

```
package/
├── mod.ts              # Main entry point
├── types.ts
├── utils.ts
└── submodule/
    └── mod.ts          # Submodule entry point
```

```typescript
// mod.ts - explicit re-exports
export { createUser, type User } from "./user.ts";
export { formatDate } from "./utils.ts";
export * from "./types.ts";
```

Incorrect:

```
package/
├── index.ts            # Node.js convention
├── index.js
└── submodule/
    └── index.ts
```

---

## Co-located Tests

Scope: JS/TS projects Rule: Place test files alongside source files with
`.test.ts` suffix. Makes tests easy to find and maintain.

Correct:

```
src/
├── user.ts
├── user.test.ts        # Co-located with source
├── utils.ts
├── utils.test.ts       # Co-located with source
└── api/
    ├── client.ts
    └── client.test.ts  # Co-located in subdirectory
```

Incorrect:

```
src/
├── user.ts
├── utils.ts
└── api/
    └── client.ts

tests/                  # Separate tests directory
├── user.test.ts        # Far from source
├── utils.test.ts
└── api/
    └── client.test.ts
```

Exception: Integration tests that span multiple modules may live in a dedicated
`tests/` directory.
