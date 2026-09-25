# READMEs and Project Docs

What package READMEs and project documents contain, where they live, and when
they change.

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
(`import * as pkg from "@eserstack/pkg"`) and access everything through the
namespace. Never show sub-path direct imports in README examples. Sub-path
exports exist in deno.json for advanced users, but READMEs use the primary
namespace pattern.

Correct:

```typescript
import * as functions from "@eserstack/functions";

// Access through namespace
const result = await functions.run(async function* () {/* ... */});
const pipeline = functions.collect<string, Error>();
const myTask = functions.task.fromPromise(() => fetch("/api"));
const data = await functions.resources.bracket(acquire, use, release);
```

Incorrect:

```typescript
// ❌ Sub-path imports in README examples
import { collect } from "@eserstack/functions";
import * as resources from "@eserstack/functions/resources";
import * as task from "@eserstack/functions/task";
```

---

## Emoji Preservation

Scope: All documentation files

Rule: Never remove existing emojis from files. Package README titles use emojis
(e.g. 🧱, ⚡) and footers use 🔗. Preserve them when editing.

Correct:

```markdown
# 🧱 @eserstack/primitives

...

## 🔗 Links
```

Incorrect:

```markdown
# @eserstack/primitives <!-- ❌ Removed emoji from title -->

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

---

## Cross-Package References

Scope: Documentation that explains how packages relate

Rule: State what each layer provides and how the layers differ, and show each
import from the package that owns it, still as a namespace import of the package
root.

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
  reference in `docs/api/`. Edit the JSDoc, never `docs/api/`, and run
  `deno task cli docs-lint`.
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

Scope: Adding or moving project documentation

Rule: Put a document where its kind already lives, and do not create a new
top-level docs file when one of these fits:

| Location                          | Holds                                                 |
| --------------------------------- | ----------------------------------------------------- |
| `README.md`                       | Project overview, install, first run                  |
| `pkg/@eserstack/<name>/README.md` | Package usage (Package README Structure)              |
| `.github/ARCHITECTURE.md`         | Repository architecture overview                      |
| `.github/SECURITY.md`             | Security policy and reporting                         |
| `CONTRIBUTING.md`                 | Contributor setup and workflow                        |
| `docs/adr/`                       | Architectural decisions (architecture-guidelines)     |
| `docs/api/`                       | Generated by `deno task cli docs`; never edit by hand |
| `CHANGELOG.md`                    | Generated by `deno task cli changelog` at release     |

CONTRIBUTING.md exists both at the root and in `.github/`, and the two differ.
Until one is chosen as canonical, a change to contributor setup updates both.

---

## Contributor Setup Stays Documented

Scope: Changes that add a tool, a required environment variable, a service, or a
setup step

Rule: A first-time contributor goes from `git clone` to a passing
`deno task cli ok` using only CONTRIBUTING.md. A change that adds a prerequisite
or a step updates CONTRIBUTING.md in the same change, and prefers folding the
step into `deno task cli init` over documenting another manual step. Changes to
noskills-server install or first run stay within the time-to-hello-world target
in `docs/adr/0002-magical-moment-and-tthw-target.md`. A setup failure prints
what is missing and the command that fixes it.
