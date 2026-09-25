---
name: tooling-standards
description: "Tooling conventions for repositories on the eserstack toolchain: pnpm installs and Deno runs, package.json over generated deno.json, JSR over npm, workspace dependencies, vetting new dependencies, manifest scripts, editor settings, file naming, license headers, adding a workspace package. Use when adding a dependency, package or project command, editing package config, or naming or creating files."
---

# Tooling Standards

Tools, configuration files, dependencies and repository conventions shared by
every repository on the eserstack toolchain. Repository-specific facts (paths,
generators, command list) are in `AGENTS.md`.

## Always

- pnpm installs; Deno formats, lints, checks and tests; no npm, npx or
  `deno install`
- `package.json` is the source of truth; per-package `deno.json` is generated,
  so never edit it; run the generator instead; extra JSR fields go in
  `deno.extra.json`
- Internal dependencies use `workspace:*`, external ones plain semver or
  `npm:@jsr/...`; never `catalog:`
- Prefer JSR packages; npm only when no JSR package exists
- Ask before adding any dependency, with purpose, license, advisories, health
  and exit cost written down
- Project commands live in `.eser/manifest.yml` and run through the `eser` CLI
- Files are kebab-case, Go files snake_case; every source file starts with the
  license header, copied from an existing file
- Do not swap or re-wire existing tools without the owner's approval

## References

| File                                                      | Read when                                               |
| --------------------------------------------------------- | ------------------------------------------------------- |
| [deno-and-packages.md](references/deno-and-packages.md)   | Editing package config, choosing or adding a dependency |
| [scripts-and-editor.md](references/scripts-and-editor.md) | Adding a project command, changing editor settings      |
| [repo-conventions.md](references/repo-conventions.md)     | Naming files, license headers, creating a package       |
