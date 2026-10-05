---
name: tooling-standards
description: "Tooling conventions of this codebase: pnpm installs, deno task and node --run for scripts, a generated deno.json, JSR first, dependency vetting, manifest scripts, editor settings, file naming, license headers. Use when installing or setting up a package locally, running its tests or build, adding or evaluating a dependency, adding a package or command, editing package config, or naming files."
---

# Tooling Standards

Tools, configuration files, dependencies and file conventions of this codebase's
TypeScript and Go workspaces. Facts that differ between codebases (paths,
generators, the command list) are in its `AGENTS.md`.

## Always

- pnpm installs; Deno formats, lints, checks and tests; package scripts run with
  `deno task <name>`, or `node --run <script>` in a Node-only package; no
  `npm install`, `npm ci`, `npm test`, `npm run`, npx or `deno install`, even
  where a README still says npm
- `package.json` is the source of truth; per-package `deno.json` is generated,
  so never edit it; run the generator instead; extra JSR fields go in
  `deno.extra.json`
- Internal dependencies use `workspace:*`, external ones plain semver or
  `npm:@jsr/...`; never `catalog:`
- Prefer JSR packages; npm only when no JSR package exists
- Ask before adding any dependency, with purpose, license, advisories, health
  and exit cost written down
- Commands of this codebase live in `.eser/manifest.yml` and run through the
  `eser` CLI
- Files are kebab-case, Go files snake_case; every source file starts with the
  license header, copied from an existing file
- Do not swap or re-wire existing tools without the owner's approval

## References

| File                                                      | Read when                                                                        |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- |
| [deno-and-packages.md](references/deno-and-packages.md)   | Running package scripts, editing package config, choosing or adding a dependency |
| [scripts-and-editor.md](references/scripts-and-editor.md) | Adding a command, changing editor settings                                       |
| [repo-conventions.md](references/repo-conventions.md)     | Naming files, license headers, creating a package                                |
