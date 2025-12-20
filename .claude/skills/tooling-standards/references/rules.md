# Tooling Standards - Detailed Rules

## Deno Tooling

### Tooling Preference

Scope: JS/TS projects using Deno Rule: Prefer Deno tooling. Don't use npm
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

Scope: Backend or full-stack JS/TS projects Rule: Use package.json for name,
version, type, exports, scripts, dependencies, devDependencies. Use
tsconfig.json for TypeScript. Use deno.json ONLY for nodeModulesDir and tooling
(fmt/lint/exclude/include).

package.json (main config file):

```json
{
  "name": "@scope/package",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": "./mod.ts"
  },
  "scripts": {
    "dev": "deno run --allow-all ./main.ts",
    "test": "deno test --allow-all",
    "lint": "deno lint",
    "fmt": "deno fmt",
    "check": "deno check ./mod.ts"
  },
  "dependencies": {
    "react": "^19.0.0",
    "@std/path": "npm:@jsr/std__path@^1.0.0"
  },
  "devDependencies": {
    "@std/assert": "npm:@jsr/std__assert@^1.0.0"
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

deno.json (nodeModulesDir and tooling only):

```json
{
  "nodeModulesDir": "auto",
  "fmt": {
    "lineWidth": 80,
    "semiColons": true
  },
  "lint": {
    "rules": {
      "exclude": ["no-explicit-any"]
    }
  },
  "exclude": ["node_modules/", "dist/"]
}
```

Incorrect (don't use deno.json for name/version/imports/exports/tasks):

```json
{
  "name": "@scope/package",
  "version": "1.0.0",
  "imports": {
    "react": "npm:react@^19.0.0"
  },
  "exports": {
    ".": "./mod.ts"
  },
  "tasks": {
    "dev": "deno run ./main.ts"
  }
}
```

---

## Package Registry

### Registry Preference

Scope: JS/TS projects Rule: Prefer jsr.io as package registry. Configure .npmrc
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

Scope: JS/TS projects Rule: Prefer JSR packages over npm when available. Use npm
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

## Test Naming Convention

Scope: JS/TS projects using Deno Rule: Use
`Deno.test("functionName() should description", ...)` format. Makes test output
readable and identifies tested function.

Correct:

```typescript
Deno.test("parseConfig() should return default values when file is empty", () => {
  const result = parseConfig("");
  assertEquals(result, defaultConfig);
});

Deno.test("parseConfig() should throw on invalid JSON", () => {
  assertThrows(() => parseConfig("{invalid}"));
});

Deno.test("createUser() should generate unique ID", () => {
  const user = createUser({ name: "John" });
  assertExists(user.id);
});
```

Incorrect:

```typescript
Deno.test("test parseConfig", () => {}); // vague "test" prefix
Deno.test("parseConfig works", () => {}); // unclear what "works" means
Deno.test("it should parse", () => {}); // missing function name
Deno.test("Parse config with empty file", () => {}); // sentence case, missing ()
```

Pattern breakdown:

- `functionName()` - identifies the function under test (with parentheses)
- `should` - describes expected behavior
- `description` - specific scenario being tested
