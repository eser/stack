# Scripts and Editor Settings

Where project commands are defined and which editor settings are shared.

---

## Scripts Location

Scope: Project commands

Rule: Project commands are `scripts` in `.eser/manifest.yml` and run through the
`eser` CLI (`deno task cli <name>` in a repository that runs it from source;
`deno task cli --help` lists them). The root `package.json` holds only the CLI
entry points. Add a new command to the manifest, not to `package.json` or a
`deno.json` `tasks` block; package-specific tasks that JSR needs go in
`deno.extra.json`.

Correct:

```yaml
# .eser/manifest.yml
scripts:
  docs-lint: deno doc --lint ./pkg/*/mod.ts
```

Incorrect:

```json
{ "scripts": { "docs-lint": "deno doc --lint ./pkg/*/mod.ts" } }
```

**Why:** one list of commands, discoverable with `--help` and shared by the
precommit and release workflows.

---

## Avoid Redundant Scripts

Scope: New scripts

Rule: Do not add a script that only renames a built-in command
(`"lint": "deno lint"` in a new place, `"install:deps": "pnpm install"`). Run
the built-in, or use the existing manifest entry.

---

## Editor Configuration

Scope: Shared editor settings

Rule: Formatting rules come from `.editorconfig` (2-space indent, LF, UTF-8,
final newline, trimmed trailing whitespace except in Markdown) and `deno fmt`.
The shared `.vscode/settings.json` makes the Deno extension the formatter for
TypeScript, JavaScript and Markdown and enables Deno lint. Change these files
only with the owner's approval; personal preferences go in user settings.
