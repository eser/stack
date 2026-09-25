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

Scope: JS/TS work in repositories on the eserstack toolchain

Rule: pnpm installs dependencies; Deno runs, formats, lints, type-checks and
tests. Do not use `npm install`, `deno install` or `npx`. Do not replace a tool
the project already uses (Deno, pnpm, Go, Make) with another one, or change how
a tool is invoked, without the owner's approval.

Correct:

```bash
pnpm install
pnpm add react --filter @scope/web
deno fmt
deno lint
deno task cli test
```

Incorrect:

```bash
npm install
npx vitest
```

**Why:** module resolution runs through pnpm's workspace symlinks in
`node_modules`, and every validation step is a Deno command; a second package
manager produces a different tree.

---

## Configuration Files

Scope: Root and per-package configuration

Rule: `package.json` is the source of truth for each package's name, exports and
dependencies. A package's `deno.json` is a generated JSR publish manifest; never
edit it, and when you change `package.json` run the repository's generator
(named in `AGENTS.md`) instead of mirroring the change by hand. Fields
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
- License: compatible with the repository's license (Apache-2.0 here). GPL, LGPL
  or AGPL dependencies need explicit approval from the owner.
- Advisories: no open advisory in the registry's advisory data or the Go
  vulnerability database.
- Health: an identifiable maintainer and recent releases. Its install scripts
  and entry point contain nothing unexpected. New packages with install scripts
  also need an `allowBuilds` entry in `pnpm-workspace.yaml`, with the reason.
- Exit cost: what breaks if the package disappears, and how much code touches
  it.

"It looked fine" is not evidence. Prefer established, widely used packages over
new ones.
