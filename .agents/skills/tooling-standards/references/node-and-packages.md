# Node, pnpm and Packages

Which tool does what, where package configuration lives, and how dependencies
are chosen, declared and landed.

## Contents

- Tooling Preference
- Configuration Files
- Root devDependencies
- Lockfile and Root Manifest Owner
- Registry Preference
- Adding a Dependency

---

## Tooling Preference

Scope: JS/TS work in this codebase

Rule: pnpm is the package manager: it installs, adds and removes dependencies.
The rest of the toolchain is pinned in the root `package.json`: oxfmt formats,
oxlint lints, tsc type-checks with `--noEmit`, and `node --test` runs the tests.
Node runs TypeScript files directly, with no build step. Do not use
`npm install`, `npm ci`, `npm test`, `npm run` or `npx`. Read-only registry
queries such as `npm view` are fine.

- A script in a `package.json` runs as `pnpm <script>`, the gate named in this
  codebase's `AGENTS.md` included. `node --run <script>` runs the same script
  without starting pnpm.
- A pinned tool runs as `pnpm exec <tool>` (`pnpm exec oxlint`).
- One test file runs as `node --test path/to/file.test.ts`.

A README, script or older document that tells a contributor to use npm in this
codebase is not an exception: run the pnpm or `node` form and update that text
in the same change. Install instructions for consumers of a published package,
and strings in code or API examples, are not commands for this codebase and
stay as they are.

Do not replace a tool this codebase already uses (pnpm, Node, oxfmt, oxlint,
tsc, Go, Make) with another one, or change how a tool is invoked, without the
owner's approval.

Correct:

```bash
pnpm install
pnpm add react --filter @scope/web
pnpm exec oxfmt --check
pnpm exec oxlint
pnpm exec tsc --noEmit
node --test pkg/@scope/config/loader.test.ts
node --run build
```

Incorrect:

```bash
npm install
npm ci
npm run build
npx oxlint
npx vitest
```

**Why:** module resolution runs through pnpm's workspace symlinks in
`node_modules`, and a second package manager produces a different tree.
`pnpm exec` runs the exact version pinned in the root `package.json`, where
`npx` may download another. `node --run` reads a script straight from
`package.json` and starts it without loading a package manager or its pre and
post hooks. One runtime with one pinned toolchain replaced the previous
runtime's built-in formatter, linter, checker and test runner (ADR 0005).

---

## Configuration Files

Scope: Root and per-package configuration

Rule: `package.json` is each package's only manifest: its name, `type: module`,
`exports`, dependencies, `files` and its own scripts. No other file mirrors it,
so a change to a package's exports or dependencies is a change to its
`package.json` alone.

| File                   | Holds                                                         |
| ---------------------- | ------------------------------------------------------------- |
| Root `package.json`    | `workspaces`, `packageManager`, `engines`, scripts, toolchain |
| `pnpm-workspace.yaml`  | Workspace packages and pnpm settings (`allowBuilds`)          |
| `tsconfig.json`        | Compiler options for the type check of the whole workspace    |
| `.oxlintrc.json`       | Lint plugins, rules and ignore patterns                       |
| `.oxfmtrc.json`        | Formatter settings and ignore patterns                        |
| Package `package.json` | `name`, `type`, `exports`, dependencies, `files`, scripts     |

Internal dependencies use `workspace:*`; external ones use plain semver. Never
use `catalog:`, which only pnpm understands. After adding a package, run
`pnpm install` at the root to link it (Lockfile and Root Manifest Owner).

Correct:

```json
{
  "name": "@scope/my-pkg",
  "type": "module",
  "exports": { ".": "./mod.ts", "./sub": "./sub.ts" },
  "dependencies": {
    "@scope/primitives": "workspace:*",
    "esbuild": "^0.28.2"
  }
}
```

Incorrect:

```json
{
  "dependencies": {
    "@scope/primitives": "catalog:",
    "@scope/logging": "^4.5.0"
  }
}
```

**Why:** one manifest per package cannot drift. The generated publish manifest
that used to sit next to `package.json` existed only for a registry this
codebase no longer publishes to (ADR 0005).

---

## Root devDependencies

Scope: The root `package.json`

Rule: The root declares only the devDependencies on the allow list in ADR 0005,
Appendix C: the toolchain (typescript, oxlint, oxlint-tsgolint, oxfmt, mitata,
@types/node), the test seam `@eserstack/test-kit` as `workspace:*`, and the few
packages the list adds for root-level scripts, such as a browser test driver.
Tools are pinned to an exact
version and vetted like any dependency (Adding a Dependency). Anything else
needs the owner's approval and an entry in that list. A check that needs another
workspace package runs from inside a package that declares it, not from the
root.

**Why:** root-level scripts resolve only what the root declares, so every
convenience import there grows a second, undeclared dependency set next to the
packages' own. The list keeps the root to the toolchain (ADR 0005).

---

## Lockfile and Root Manifest Owner

Scope: Agents working in parallel while this codebase names an integration agent
(ADR 0005, Appendix D)

Rule: The integration agent alone edits `pnpm-lock.yaml` and the root
`package.json`, and it lands every dependency change in any `package.json`, one
commit per batch. Every other agent sends it the change it needs (the package,
the version range, the notes from Adding a Dependency) and never runs
`pnpm install`, `pnpm add` or `pnpm remove` itself. When `pnpm exec` or
`pnpm <script>` would install first because `node_modules` is out of date, run
the tool from `./node_modules/.bin/` instead, so the lockfile stays as it is.

**Why:** every install rewrites the whole lockfile, so parallel edits conflict
and one agent's install silently changes another's dependencies. One owner keeps
the lockfile mergeable and vets each dependency once (ADR 0005).

---

## Registry Preference

Scope: Choosing where a dependency comes from

Rule: Prefer a Node built-in, then a package from the npm registry, declared
with plain semver. Libraries publish to npm only. Do not add an `npm:` alias
that points at another registry's mirror. The `@std/*` aliases still in the code
are being replaced with built-ins and vetted npm packages; they are not a
precedent.

**Why:** a library published to npm installs with plain npm or pnpm only when
every dependency it declares comes from the npm registry, and one registry
keeps one release path (ADR 0005).

---

## Adding a Dependency

Scope: Every new npm or Go module dependency

Rule: A new dependency is untrusted code and a long-term liability, and
workflow-practices already requires asking first. Before proposing one, write
down:

- Purpose, and why the standard library (Node built-ins, Go stdlib) or an
  existing workspace package cannot do it. If about 50 lines of our own code
  would do it, write the code.
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
