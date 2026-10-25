---
name: tooling-standards
description: "Tooling conventions of this codebase: pnpm, node --run, pnpm exec, oxfmt, oxlint, tsc, package.json as sole manifest, root devDependencies, lockfile owner, dependency vetting, manifest scripts, editor settings, file naming, license headers. Use when setting up a package, running its tests or build, adding or vetting a dependency, adding a package or command, editing package config or naming files."
---

# Tooling Standards

Tools, configuration files, dependencies and file conventions of this codebase's
TypeScript and Go workspaces. Facts that differ between codebases (paths, the
gate command, the command list) are in its `AGENTS.md`.

## Always

- pnpm installs; oxfmt formats, oxlint lints, tsc type-checks (`--noEmit`) and
  `node --test` tests; scripts run with `pnpm <script>` or `node --run <script>`
  and pinned tools with `pnpm exec <tool>`; no `npm install`, `npm ci`,
  `npm test`, `npm run` or npx, even where a README still says npm
- `package.json` is each package's only manifest; nothing generated mirrors it
- Internal dependencies use `workspace:*`, external ones plain semver from the
  npm registry; never `catalog:`
- The root `package.json` carries only the allowed toolchain devDependencies,
  pinned exactly
- While an integration agent is named, only it edits `pnpm-lock.yaml` and the
  root `package.json`; others send it their dependency changes
- Ask before adding any dependency, with purpose, license, advisories, health
  and exit cost written down
- Commands of this codebase live in `.eser/manifest.yml` and run through the
  `eser` CLI
- Files are kebab-case, Go files snake_case; every source file starts with the
  license header, copied from an existing file
- Do not swap or re-wire existing tools without the owner's approval

## References

| File                                                      | Read when                                                                         |
| --------------------------------------------------------- | --------------------------------------------------------------------------------- |
| [node-and-packages.md](references/node-and-packages.md)   | Running scripts or tools, editing package config, choosing or adding a dependency |
| [scripts-and-editor.md](references/scripts-and-editor.md) | Adding a command, changing editor settings                                        |
| [repo-conventions.md](references/repo-conventions.md)     | Naming files, license headers, creating a package                                 |
