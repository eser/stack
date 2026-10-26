# Page Structure, Examples and Review

How a documentation page in this codebase is shaped: what job it does, how it
opens, how its headings, lists, code, placeholders and links work, and how a
page is reviewed. Adapted from vercel-labs/writing-guidelines (83e2316); the
sentence-level rules are in prose.md.

## Contents

- One Job per Page
- Openings, Sections and Headings
- Lists
- Code Examples
- Placeholders and Units
- Links and Terms
- Reviewing Docs

---

## One Job per Page

Scope: Guides, tutorials, docs pages and the long sections of READMEs

Rule: Decide what kind of page you are writing before writing it, and let it do
that one job:

| Kind            | Reader                  | Tone                                     |
| --------------- | ----------------------- | ---------------------------------------- |
| Tutorial        | Learning by doing       | Encouraging, predictable steps, no traps |
| How-to          | In the middle of a task | Terse and direct                         |
| Reference       | Looking something up    | Neutral, complete, quotable              |
| Conceptual      | Building a mental model | Explanatory, with examples               |
| Troubleshooting | Stuck on a failure      | Acknowledge the problem, then fix it     |

A page that mixes a tutorial, a how-to and a reference serves none of them;
split it, or link from one to the other. The goal of the page is a verb the
reader can check ("configure retries", "debug a failed release"). The title of a
guide names the reader's task or question ("Resume a failed release"), not the
feature ("Release Resume Subsystem"). Package READMEs keep the package name as
their title (readmes.md: Package README Structure).

When a page serves several audiences, open with a short shared part and put the
technical depth in its own sections.

**Why:** a reader arrives with one question; a page built around a feature name
or several jobs makes them search for the part that answers it.

---

## Openings, Sections and Headings

Scope: Every documentation page

Rule:

- The page opens with one paragraph saying what it covers and for whom. In a
  package README that is the vision paragraph under the title.
- A major section opens with a sentence saying what it covers.
- A paragraph holds one idea, in two to four sentences; split anything longer.
- Spell out an acronym on first use ("Server-Side Request Forgery (SSRF)") and
  define each term the first time it appears, linking to where it is explained.
- A heading tells the reader what the section holds, so they can find a section
  from the headings alone: "Retry limits when the registry is down", not "Notes"
  or "Caveats". Headings fixed by a template (README "Quick Start" and "🔗
  Links", skill "Contents", "Always" and "References") stay as they are.
- Headings use Title Case, the case this codebase's READMEs, docs and skill
  files already use. Skill section titles must keep their exact wording, since
  other skills point to them as `skill-name: Exact Section Title`.

**Why:** readers scan openings and headings before they read; a page whose first
paragraph and headings answer "is this the page I need" saves them the rest.

---

## Lists

Scope: Lists in any documentation

Rule: Three or more parallel items in a sentence become a list. Introduce a list
with a colon. Use numbers for an order the reader follows (steps, lifecycles)
and bullets otherwise. Items that are full sentences end with a period;
fragments do not.

---

## Code Examples

Scope: Code blocks in READMEs, guides and docs

Rule:

- Every fenced block has a language tag (`typescript`, `go`, `bash`, `json`,
  `yaml`, `text`), so it is highlighted and the reader knows what it is.
- Examples are written in the language of the package they document; TypeScript
  for the TypeScript packages.
- Say in prose what a block does before or after it; do not drop code without
  context.
- Keep a block to about 25 lines and lines to about 80 columns. Split a longer
  flow into steps with prose between them.
- Leave out options set to their defaults, and do not repeat a definition an
  earlier block already showed.
- Comments inside the block stay few; the explanation goes in the prose.
- Put the code in the page. "See the full example in `example.ts`" at the end of
  a guide is not a substitute for the example.
- An example that names an AI model uses a current model ID, never a retired
  one.

Examples run as pasted (readmes.md: Docs Change With the Code).

---

## Placeholders and Units

Scope: Values the reader replaces, and numbers with units

Rule: A value the reader must replace is a descriptive `snake_case` placeholder
they can double-click to select: `your_access_token`, `your_project_id`. A
placeholder number is recognizably fake: `1234567890`. Never use `<TOKEN>`,
`xxx`, `your-token` or a bare `ABC123`, which readers paste as is. Angle
brackets stay in command synopses, where they are the usage notation
(`git switch <branch-name>`).

Write sizes and durations with a space and the standard unit: `64 KB`, `5 MB`,
`200 ms`. Values written in a config or flag syntax keep that syntax (`30s`).

Correct:

```bash
export REGISTRY_TOKEN=your_registry_token
```

Incorrect:

```bash
export REGISTRY_TOKEN=<TOKEN>
```

---

## Links and Terms

Scope: Links in any documentation

Rule: Link text names the destination ("see the release process"), never "here",
"link" or a bare URL. Link a term where it is first used to the page that
explains it, rather than repeating the explanation.

Correct:

```markdown
Releases follow the [release process](./releasing.md).
```

Incorrect:

```markdown
For releases, click [here](./releasing.md).
```

---

## Reviewing Docs

Scope: Reviewing a page or a docs diff, yours or someone else's

Rule: Check the page against this file, prose.md and readmes.md, then answer:

- Can a reader with only this page complete the task it promises?
- Do the code examples run as written, and do commands and paths exist?
- Are prerequisites listed before the first step, and limits documented?
- When there are several ways to do it, does the page recommend the simplest?
- Does every heading and opening say what follows?

Report findings grouped by file, one line each, as `file:line - issue`, with the
fix only when it is not obvious. A file with no findings gets `✓ pass`. No
preamble.

```text
## docs/guide/releases.md

docs/guide/releases.md:12 - title is feature-shaped, name the reader's task
docs/guide/releases.md:31 - "easy" presses the reader, describe the step
docs/guide/releases.md:58 - code block has no language tag
docs/guide/releases.md:71 - placeholder <TOKEN>, use your_registry_token

## README.md

✓ pass
```
