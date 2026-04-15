# Documentation Conventions - Detailed Rules

## README Import Pattern

Scope: All package README.md files

Rule: README code examples must use the **namespaced import pattern**
(`import * as pkg from "@eserstack/pkg"`) and access everything through the
namespace. Never show sub-path direct imports in README examples. Sub-path
exports exist in deno.json for advanced users, but READMEs showcase the primary
namespace pattern.

Correct:

```typescript
import * as functions from "@eserstack/functions";

// Access through namespace
const result = await functions.run(async function* () { /* ... */ });
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
# @eserstack/primitives          <!-- ❌ Removed emoji from title -->
...
## Links                     <!-- ❌ Removed emoji from footer -->
```

---

## Descriptive Text Preservation

Scope: All documentation files

Rule: Never strip descriptive details, comments, or explanatory text when
rewriting documentation. If the original says "Safe acquire-use-release patterns
with guaranteed cleanup", do not shorten it to "Safe acquire-use-release
patterns". Preserve all descriptive context — details like "(LIFO cleanup)" and
"in reverse order" exist for a reason.

Correct:

```markdown
Safe acquire-use-release patterns with guaranteed cleanup (LIFO order)
```

Incorrect:

```markdown
Safe acquire-use-release patterns    <!-- ❌ Lost "guaranteed cleanup" detail -->
```

---

## Package README Structure

Scope: All package README.md files

Rule: Each package README should include:

1. **Title** with emoji and package name
2. **Vision/description** — what the package does and its design philosophy
3. **Quick Start** — minimal usage examples with namespace imports
4. **API sections** — grouped by category with examples
5. **Links footer** with 🔗 emoji

---

## Cross-Package References

Scope: Documentation that references other packages

Rule: When documenting how packages relate, clearly state what each layer
provides and how they differ. Use concrete examples showing the import from
the correct source package.

Correct:

```markdown
Types and constructors come from `@eserstack/primitives`:
import * as results from "@eserstack/primitives/results";

Pure FP utilities come from `@eserstack/fp`:
import * as fp from "@eserstack/fp";
```
