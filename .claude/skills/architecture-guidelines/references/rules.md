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
