# Tooling Standards - Detailed Rules

## Deno Tooling

### Tooling Preference

Scope: JS/TS projects using Deno

Rule: Use pnpm for package installation and Deno for runtime operations. Don't
use npm directly.

Correct:

```bash
pnpm install
pnpm add jsr:@eserstack/fp
deno fmt
deno lint
deno test
deno bench
deno task dev
```

Incorrect:

```bash
npm install
deno install
npm run format
npm run lint
npm test
npx vitest
```

---

### Configuration Files

Scope: JS/TS projects using Deno

Rule: Packages need BOTH `deno.json` AND `package.json`. They serve
different roles:

- `deno.json` — Package identity for JSR (`name`, `version`, `exports`), plus
  formatter/linter config at root level.
- `package.json` — Package identity for npm workspace resolution (`name`,
  `version`, `exports`, `devDependencies`). The root `package.json` defines
  the workspace glob.

**Root `package.json` (workspace definition):**

```json
{
  "name": "@eserstack/stack",
  "private": true,
  "workspaces": ["pkg/@eserstack/*", "pkg/@cool/*"],
  "scripts": { "cli": "deno run --allow-all ./pkg/@eserstack/cli/main.ts" }
}
```

Cross-package imports (e.g., `import * as foo from "@eserstack/bar/baz"`) resolve
through this npm workspace. Run `pnpm install` at root after adding a new
package to wire up the graph.

**Per-package `deno.json`:**

```json
{
  "name": "@eserstack/my-pkg",
  "version": "4.1.12",
  "exports": { ".": "./mod.ts", "./sub": "./sub.ts" }
}
```

**Per-package `package.json` (must mirror exports):**

```json
{
  "name": "@eserstack/my-pkg",
  "version": "4.1.12",
  "type": "module",
  "exports": { ".": "./mod.ts", "./sub": "./sub.ts" },
  "devDependencies": { "@std/assert": "npm:@jsr/std__assert@^1.0.16" }
}
```

**Root `deno.json` (lint/fmt config only, NO workspace key):**

```json
{
  "nodeModulesDir": "auto",
  "lint": { "rules": { "tags": ["recommended"] } },
  "exclude": [".git", "node_modules/", "etc/templates/"]
}
```

**After adding a new package, ALWAYS run:**

```bash
pnpm install   # at project root — wires up workspace graph
```

Incorrect (don't skip package.json — workspace resolution will fail):

```json
// Having only deno.json without package.json means other packages
// cannot import via bare specifiers like "@eserstack/my-pkg/sub"
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
pnpm install
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

---

## Go Tooling

### Make Commands

Scope: Go services

Rule: Use Makefile commands for all Go operations. Don't run go commands
directly for common tasks.

```bash
# In /apps/ajan directory
make restart         # Restart services after changes
make check           # Run static analysis tools
make lint            # Run linting (golangci-lint)
make fix             # Fix formatting and linting issues
make test            # Run tests
make build           # Build binaries
```

Correct:

```bash
cd apps/ajan && make lint
cd apps/ajan && make test
```

Incorrect:

```bash
cd apps/ajan && go fmt ./...
cd apps/ajan && go test ./...
```

---

### Code Generation

Scope: Go services with SQLC

Rule: Use SQLC for database query generation. SQL queries live in
`etc/data/{datasource}/queries/`.

**Structure:**

```
apps/ajan/
├── etc/data/default/
│   ├── migrations/     # Database migrations
│   ├── queries/        # SQL queries for SQLC
│   │   ├── profiles.sql
│   │   ├── users.sql
│   │   └── sessions.sql
│   └── seed/           # Seed data
├── pkg/api/adapters/storage/
│   ├── *_gen.go        # Generated SQLC code
│   └── repository.go   # Repository wrapper
└── sqlc.yaml           # SQLC configuration
```

Regenerate after SQL changes:

```bash
cd apps/ajan && make generate
```

---

## Monorepo Commands

Scope: Root-level operations

Rule: Use root Makefile for cross-project operations.

```bash
# In monorepo root
make ok              # Run all quality checks
make build           # Build all containers
make up              # Start all services
make down            # Stop all services
make logs            # View service logs
```

**Workflow:**

```bash
# After making changes
make ok              # Ensure all checks pass
git add . && git commit -m "..."
```

---

## Editor Configuration

Scope: Development environment

Rule: Use project-level editor configuration for consistent formatting.

**.editorconfig:**

```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_size = 2
indent_style = space
insert_final_newline = true
trim_trailing_whitespace = true

[*.go]
indent_size = 4
indent_style = tab

[Makefile]
indent_style = tab
```

**VS Code Settings (.vscode/settings.json):**

```json
{
  "editor.formatOnSave": true,
  "deno.enable": true,
  "deno.lint": true,
  "go.lintTool": "golangci-lint",
  "go.lintOnSave": "workspace"
}
```

---

## Codebase File Tools

### File Tool Factory Pattern

Scope: @eserstack/codebase file check/fix tools

Rule: Use `createFileTool()` factory for all file-based codebase tools. Pure
`checkFile`/`checkAll` logic returns issues. Fixers return `{path, oldContent, newContent}`
mutations — never write to disk directly.

Correct:
```typescript
export const tool: FileTool = createFileTool({
  name: "fix-eof",
  description: "Ensure files end with newline",
  canFix: true,
  stacks: [],
  defaults: {},
  checkFile(file, content) { /* pure logic */ },
  fixFile(file, content) { return { path, oldContent, newContent }; },
});
```

Incorrect:
```typescript
// Don't write files inside check/fix logic
fixFile(file, content) {
  await fs.writeTextFile(file.path, fixed); // BAD — side effect
}
```

---

### @eserstack/functions Integration

Scope: All codebase tools and CLI commands

Rule: Tools use Handler/Adapter/ResponseMapper from `@eserstack/functions`. Handler = pure
logic, Adapter = input transform (CLI/MCP/agent), ResponseMapper = output format.

---

### Runtime Abstraction

Scope: All @eserstack/* packages

Rule: Use `@eserstack/standards/cross-runtime` for all filesystem, exec, and env access.
Never use `Deno.*` directly. Enables cross-runtime (Deno/Node/Bun) and testability.

Exception: CLI-only code (commands, tools that only run in the CLI context) may
use `Deno.*` directly when `@eserstack/standards/cross-runtime` doesn't expose the needed
API (e.g., `Deno.cwd()`, `Deno.makeTempDir()`). Prefer the abstraction when available.

Correct:
```typescript
import { runtime } from "@eserstack/standards/cross-runtime";
const content = await runtime.fs.readTextFile(path);
```

Incorrect:
```typescript
const content = await Deno.readTextFile(path); // BAD — Deno-specific
```

---

### Walk-Once Pipeline

Scope: @eserstack/codebase validation system

Rule: When running multiple tools via `validate`, walk the filesystem once and pass the
file list to all validators. Fixers return mutations; the runner applies between tools
and writes to disk at the end. This enables dry-run and transactional rollback.
