# Tooling Standards - Detailed Rules

## Deno Tooling

### Tooling Preference

Scope: JS/TS projects using Deno

Rule: Prefer Deno tooling. Don't use npm
directly. Use deno install for packages. Use built-in formatter, linter,
benchmarks, testing.

Correct:

```bash
deno install
deno fmt
deno lint
deno test
deno bench
deno task dev
```

Incorrect:

```bash
npm install
npm run format
npm run lint
npm test
npx vitest
```

---

### Configuration Files

Scope: JS/TS projects using Deno

Rule: Use package.json for dependencies and
scripts. Use tsconfig.json for TypeScript. Use deno.json only for
formatter/linter configuration.

package.json (dependencies and scripts):

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "@std/path": "npm:@jsr/std__path@^1.0.0"
  },
  "scripts": {
    "dev": "deno run --allow-all main.ts",
    "test": "deno test --allow-all"
  }
}
```

tsconfig.json (TypeScript config):

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "strict": true
  }
}
```

deno.json (formatter/linter only):

```json
{
  "fmt": {
    "lineWidth": 80,
    "semiColons": true
  },
  "lint": {
    "rules": {
      "exclude": ["no-explicit-any"]
    }
  }
}
```

Incorrect (don't use deno.json for dependencies):

```json
{
  "imports": {
    "react": "npm:react@^19.0.0"
  },
  "tasks": {
    "dev": "deno run main.ts"
  }
}
```

---

## Package Registry

### Registry Preference

Scope: JS/TS projects

Rule: Prefer jsr.io as package registry. Configure .npmrc
to support JSR packages in package.json.

.npmrc:

```
@jsr:registry=https://npm.jsr.io
```

package.json with JSR packages:

```json
{
  "dependencies": {
    "@std/path": "npm:@jsr/std__path@^1.0.0",
    "@std/fs": "npm:@jsr/std__fs@^1.0.0",
    "react": "^19.0.0"
  }
}
```

Install with:

```bash
deno install
```

Incorrect (without npm: prefix or registry config):

```json
{
  "dependencies": {
    "@std/path": "^1.0.0"
  }
}
```

---

### Package Selection Priority

Scope: JS/TS projects

Rule: Prefer JSR packages over npm when available. Use npm
packages when no JSR alternative exists.

Correct (JSR available):

```json
{
  "dependencies": {
    "@std/path": "npm:@jsr/std__path@^1.0.0",
    "@std/assert": "npm:@jsr/std__assert@^1.0.0"
  }
}
```

Correct (no JSR alternative):

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  }
}
```

---

## Deno Testing

Scope: Test configuration and tooling

Rule: Use Deno's standard testing
libraries and consistent coverage output.

**Configuration:**

- Test runner: `@std/testing/bdd` for describe/it syntax
- Assertions: `@std/assert`
- Coverage output: `etc/coverage/` (HTML + LCOV)
- Test tasks in `deno.json`: `test:all`, `test:unit`, `test:integration`

deno.json tasks:

```json
{
  "tasks": {
    "test:all": "deno test --allow-all",
    "test:unit": "deno test --allow-all **/*.test.ts",
    "test:integration": "deno test --allow-all **/*.integration.test.ts",
    "coverage": "deno test --allow-all --coverage=etc/coverage && deno coverage etc/coverage --lcov > etc/coverage/lcov.info"
  }
}
```

Correct:

```typescript
import { describe, it } from "@std/testing/bdd";
import { assertEquals, assertThrows } from "@std/assert";

describe("UserService", () => {
  it("should create user with valid data", () => {
    const user = createUser({ name: "Alice", email: "alice@example.com" });
    assertEquals(user.name, "Alice");
  });

  it("should throw on invalid email", () => {
    assertThrows(
      () => createUser({ name: "Bob", email: "invalid" }),
      Error,
      "Invalid email",
    );
  });
});
```

Incorrect:

```typescript
import { expect } from "chai"; // external library, not standard
import assert from "node:assert"; // Node.js assert, not Deno standard

test("user creation", () => { // non-standard test function
  expect(result).to.equal(expected);
});
```

**Test File Naming:**

- Unit tests: `*.test.ts` (colocated with source)
- Integration tests: `*.integration.test.ts`
- Schema tests: `schema.test.ts`
