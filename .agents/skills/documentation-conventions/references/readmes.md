# READMEs and Project Docs

What this codebase's package READMEs and project documents contain, where they
live, and when they change. Page structure, code examples and doc review are in
docs-structure.md.

## Contents

- README Import Pattern
- Emoji Preservation
- Descriptive Text Preservation
- Package README Structure
- Cross-Package References
- Docs Change With the Code
- Where Documentation Lives
- Contributor Setup Stays Documented

---

## README Import Pattern

Scope: All package README.md files

Rule: README code examples must use the **namespaced import pattern**
(`import * as pkg from "@scope/pkg"`) and access everything through the
namespace. Never show sub-path direct imports in README examples. Code may
import a published sub-path to keep its module graph small
(javascript-practices: Imports), but READMEs use the primary namespace pattern.
Two cases are exceptions:

- A CLI-first package maps its `.` export to the CLI's `main.ts`, so that
  `deno run jsr:@scope/pkg` starts the CLI, and publishes its library as
  `./mod`. Its README imports the library as
  `import * as pkg from "@scope/pkg/mod"`, and the module JSDoc of `main.ts`
  names that import. The notes linked from this codebase's AGENTS.md list these
  packages.
- A module that the package root does not re-export, such as an adapter kept out
  of the root so its dependencies load only when used, is shown at the sub-path
  the package publishes for it.

Correct:

```typescript
import * as functions from "@eserstack/functions";

// Access through namespace
const result = await functions.run(async function* () {
  /* ... */
});
const pipeline = functions.collect<string, Error>();
const myTask = functions.task.fromPromise(() => fetch("/api"));
const data = await functions.resources.bracket(acquire, use, release);
```

```typescript
// A CLI-first package: "." runs the CLI, "./mod" is the library
import * as workflows from "@eserstack/workflows/mod";

const registry = workflows.createRegistry();
```

Incorrect:

```typescript
// ❌ Sub-path imports in README examples
import { collect } from "@eserstack/functions";
import * as resources from "@eserstack/functions/resources";
import * as task from "@eserstack/functions/task";
```

**Why:** the reader copies the form the README shows, and the root namespace
reaches the whole public API with one import. Moving a CLI-first package's CLI
off `.` would break every `deno run jsr:@scope/pkg` command already in use, so
its library takes the `/mod` path instead.

---

## Emoji Preservation

Scope: All documentation files

Rule: Never remove existing emojis from files. Package README titles use emojis
(e.g. 🧱, ⚡) and footers use 🔗. Preserve them when editing.

Correct:

```markdown
# 🧱 @scope/primitives

...

## 🔗 Links
```

Incorrect:

```markdown
# @scope/primitives <!-- ❌ Removed emoji from title -->

...

## Links <!-- ❌ Removed emoji from footer -->
```

---

## Descriptive Text Preservation

Scope: All documentation files

Rule: Never strip descriptive details, comments, or explanatory text when
rewriting documentation. If the original says "Safe acquire-use-release patterns
with guaranteed cleanup", do not shorten it to "Safe acquire-use-release
patterns". Preserve all descriptive context: details like "(LIFO cleanup)" and
"in reverse order" exist for a reason.

Correct:

```markdown
Safe acquire-use-release patterns with guaranteed cleanup (LIFO order)
```

Incorrect:

```markdown
Safe acquire-use-release patterns <!-- ❌ Lost "guaranteed cleanup" detail -->
```

---

## Package README Structure

Scope: All package README.md files

Rule: Each package README should include:

1. **Title** with emoji and package name
2. **Vision/description**: what the package does and its design philosophy
3. **Quick Start**: the most common use case first, in the fewest lines that run
   as pasted, with namespace imports. Options, adapters and advanced composition
   come in the API sections, not in the first example
4. **API sections**: grouped by category with examples
5. **Links footer** with 🔗 emoji

The vision paragraph under the title is the page's opening summary
(docs-structure.md: Openings, Sections and Headings): one paragraph saying what
the package does and for whom.

---

## Cross-Package References

Scope: Documentation that explains how packages relate

Rule: State what each layer provides and how the layers differ, and show each
import from the package that owns it, still as a namespace import of the package
root (or of `/mod` for a CLI-first package, README Import Pattern).

Correct:

```typescript
// Types and constructors come from @eserstack/primitives
import * as primitives from "@eserstack/primitives";
// Pure FP utilities come from @eserstack/fp
import * as fp from "@eserstack/fp";

const ok = primitives.results.ok(42);
```

Incorrect:

```typescript
import * as results from "@eserstack/primitives/results"; // sub-path import
```

---

## Docs Change With the Code

Scope: Any change to a public export, CLI command or flag, config key,
environment variable, daemon endpoint, or install and first-run steps

Rule: The documentation diff ships in the same change as the code diff; it is
not a follow-up. Before marking the task done, find each doc that describes the
changed surface and make it describe the new state:

- Exported function or type: its JSDoc in the package, which feeds the generated
  API reference. Edit the JSDoc, never the generated output, and run the doc
  lint (`deno doc --lint`, or this codebase's docs-lint script).
- Package usage: the package README Quick Start and API sections.
- CLI command or flag: the command's help text and the README that shows it.
- Install, configuration or first run: the root README and CONTRIBUTING.md.
- Environment variable: the package README lists its name, purpose, whether it
  is required, its default and an example value. Environment-specific URLs come
  from configuration or environment variables, never from literals in code.
- Removed or changed behavior: delete or rewrite the sentences that describe the
  old behavior. Descriptive Text Preservation protects details that are still
  true, not text that has become false.

README examples run as pasted: imports included, no elided setup the reader must
guess.

**Why:** a feature whose docs lag the code does not exist for the reader who
finds it later, and stale instructions cost more than missing ones.

---

## Where Documentation Lives

Scope: Adding or moving documentation

Rule: Put a document where its kind already lives, and do not create a new
top-level docs file when one of these fits:

| Location                   | Holds                                             |
| -------------------------- | ------------------------------------------------- |
| `README.md`                | Project overview, install, first run              |
| Each package's `README.md` | Package usage (Package README Structure)          |
| `ARCHITECTURE.md`          | Architecture overview                             |
| `SECURITY.md`              | Security policy and reporting                     |
| `CONTRIBUTING.md`          | Contributor setup and workflow                    |
| `docs/adr/`                | Architectural decisions (architecture-guidelines) |
| Generated API reference    | Built from JSDoc; never edited by hand            |
| `CHANGELOG.md`             | Generated from commits at release                 |

This codebase may keep `ARCHITECTURE.md`, `SECURITY.md` or `CONTRIBUTING.md`
under `.github/`; AGENTS.md says where. When the same document exists twice, a
change updates both until one is made canonical.

---

## Contributor Setup Stays Documented

Scope: Changes that add a tool, a required environment variable, a service, or a
setup step

Rule: A first-time contributor goes from `git clone` to a passing full gate (the
one named in AGENTS.md) using only CONTRIBUTING.md. A change that adds a
prerequisite or a step updates CONTRIBUTING.md in the same change, and prefers
folding the step into this codebase's init script over documenting another
manual step. When an ADR sets a first-run target, install and first-run changes
stay within it. A setup failure prints what is missing and the command that
fixes it.
