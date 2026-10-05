# Deno, pnpm and Packages

Which tool does what, where package configuration lives, and how dependencies
are chosen and declared.

## Contents

- Tooling Preference
- Configuration Files
- Registry Preference
- Adding a Dependency

---

## Tooling Preference

Scope: JS/TS work in this codebase

Rule: pnpm is the package manager: it installs, adds and removes dependencies.
Deno runs, formats, lints, type-checks and tests. npm stays at a minimum: do not
use `npm install`, `npm ci`, `npm test`, `npm run`, `npx` or `deno install`.
Read-only registry queries such as `npm view` are fine.

Package scripts run without a package manager in between:

- A package whose scripts are Deno tasks runs them with `deno task <name>`.
- A Node-only tooling package (a web app built with Vite, a package whose tests
  run on Node) keeps its scripts in its `package.json` and runs them with
  `node --run <script>`, which needs Node 22 or later.

A README, script or older document that tells a contributor to use npm in this
codebase is not an exception: run the pnpm, `deno task` or `node --run` form and
update that text in the same change. Install instructions for consumers of a
published package, and strings in code or API examples, are not commands for
this codebase and stay as they are.

Do not replace a tool this codebase already uses (Deno, pnpm, Node, Go, Make)
with another one, or change how a tool is invoked, without the owner's approval.

Correct:

```bash
pnpm install
pnpm add react --filter @scope/web
deno fmt
deno lint
deno task test
node --run build   # in a Node-only package
```

Incorrect:

```bash
npm install
npm ci
npm run build
npx vitest
```

**Why:** module resolution runs through pnpm's workspace symlinks in
`node_modules`, and a second package manager produces a different tree.
`node --run` reads a script straight from `package.json` and starts it without
loading a package manager or its pre and post hooks.

---

## Configuration Files

Scope: Root and per-package configuration

Rule: `package.json` is the source of truth for each package's name, exports and
dependencies. A package's `deno.json` is a generated JSR publish manifest; never
edit it, and when you change `package.json` run this codebase's generator (named
in its `AGENTS.md`) instead of mirroring the change by hand. Fields
`package.json` cannot express (`publish.include`, `tasks`) go in the package's
`deno.extra.json`.

| File                      | Holds                                                     |
| ------------------------- | --------------------------------------------------------- |
| Root `package.json`       | `workspaces` and the CLI entry scripts only               |
| `pnpm-workspace.yaml`     | Workspace packages and pnpm settings                      |
| Root `deno.json`          | Lint, fmt, `unstable` flags, excludes; no `workspace` key |
| Package `package.json`    | `name`, `type: module`, `exports`, dependencies           |
| Package `deno.extra.json` | Extra JSR fields merged into the generated `deno.json`    |
| Package `deno.json`       | Generated; do not edit                                    |

Internal dependencies use `workspace:*`; external ones use plain semver or the
`npm:@jsr/` alias. Never use `catalog:`, which only pnpm understands. After
adding a package, run `pnpm install` at the root to link it.

Correct:

```json
{
  "name": "@scope/my-pkg",
  "type": "module",
  "exports": { ".": "./mod.ts", "./sub": "./sub.ts" },
  "dependencies": {
    "@scope/primitives": "workspace:*",
    "@std/path": "npm:@jsr/std__path@^1.1.6"
  }
}
```

Incorrect:

```json
{
  "dependencies": {
    "@scope/primitives": "catalog:",
    "@std/path": "^1.0.0"
  }
}
```

**Why:** the exports map used to live in two files and drifted; generating
`deno.json` keeps one source.

---

## Registry Preference

Scope: Choosing where a dependency comes from

Rule: Prefer a JSR package when one exists; fall back to npm. JSR packages are
declared through the npm compatibility registry: `.npmrc` sets
`@jsr:registry=https://npm.jsr.io`, and the dependency is written as
`"@std/path": "npm:@jsr/std__path@^1.1.6"`. npm-only packages (`react`) use
plain semver.

**Why:** JSR packages ship TypeScript source and work in Deno and Node through
the same `package.json` entry.

---

## Adding a Dependency

Scope: Every new JSR, npm or Go module dependency

Rule: A new dependency is untrusted code and a long-term liability, and
workflow-practices already requires asking first. Before proposing one, write
down:

- Purpose, and why the standard library (`@std/*`, Go stdlib) or an existing
  workspace package cannot do it. If about 50 lines of our own code would do it,
  write the code.
- License: compatible with this codebase's license. GPL, LGPL or AGPL
  dependencies need explicit approval from the owner.
- Advisories: no open advisory in the registry's advisory data or the Go
  vulnerability database.
- Health: an identifiable maintainer and recent releases. Its install scripts
  and entry point contain nothing unexpected. New packages with install scripts
  also need an `allowBuilds` entry in `pnpm-workspace.yaml`, with the reason.
- Exit cost: what breaks if the package disappears, and how much code touches
  it.

"It looked fine" is not evidence. Prefer established, widely used packages over
new ones.
