# Scripts and Editor Settings

Where this codebase's commands are defined and which editor settings are shared.

---

## Scripts Location

Scope: Commands of this codebase

Rule: Commands are `scripts` in `.eser/manifest.yml` and run through the `eser`
CLI as `eser <name>`; `eser --help` lists them. When this codebase runs the CLI
from source, its AGENTS.md names the script that starts it. The root
`package.json` holds only the CLI entry points and the toolchain scripts
(`check`, `lint`, `fmt`, `test`). Add a new command to the manifest, not to the
root `package.json`. A package keeps its own build and test scripts in its
`package.json` and runs them with `pnpm <script>` or `node --run <script>`
(node-and-packages.md: Tooling Preference).

Correct:

```yaml
# .eser/manifest.yml
scripts:
  docs-lint: eser codebase validate-docs
```

Incorrect:

```json
{ "scripts": { "docs-lint": "eser codebase validate-docs" } }
```

**Why:** one list of commands, discoverable with `--help` and shared by the
precommit and release workflows.

---

## Avoid Redundant Scripts

Scope: New scripts

Rule: Do not add a script that only renames a built-in command
(`"lint": "oxlint"` in a new place, `"install:deps": "pnpm install"`). Run the
built-in, or use the existing manifest entry.

---

## Editor Configuration

Scope: Shared editor settings

Rule: Formatting rules come from `.editorconfig` (2-space indent, LF, UTF-8,
final newline, trimmed trailing whitespace except in Markdown) and
`.oxfmtrc.json`. The shared `.vscode/settings.json` makes the oxc extension the
formatter for TypeScript, JavaScript, JSON and Markdown, and
`.vscode/extensions.json` recommends it with the coverage gutters extension,
which reads the LCOV file the test script writes. Change these files only with
the owner's approval; personal preferences go in user settings.

**Why:** the editor formats with the same oxfmt settings as the gate, so a saved
file passes the formatter check without a second run (ADR 0005).
