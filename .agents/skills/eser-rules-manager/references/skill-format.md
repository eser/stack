# Skill Format

How a skill in `.agents/skills/` is laid out and written. Based on Anthropic's
skill authoring guidance
(platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) and
the Claude Code skills reference, adjusted to this repository.

## Contents

- Layout
- Frontmatter
- SKILL.md Body
- Reference Files
- What Belongs in a Skill
- Rule Sections
- Scripts
- Validation
- Creating a Skill
- Changing a Skill

---

## Layout

```
skill-name/
├── SKILL.md              # Required: overview and navigation, at most 80 lines
├── references/           # Topic files, each read only when its task needs it
│   ├── errors.md
│   └── logging.md
├── scripts/              # Optional: code the skill runs instead of re-deriving
└── evals/                # Optional: evals.json, triggers.json (skill-evaluation.md)
```

`.claude` is a symlink to `.agents`, so edit skills under `.agents/skills/`
only. Paths use forward slashes.

**Why:** an agent sees only the name and description of every skill up front. It
reads SKILL.md when the skill loads and a reference file only when it opens it.
A skill costs context in proportion to what the task actually needs.

---

## Frontmatter

Scope: The YAML block at the top of SKILL.md

Rule: Only `name` and `description` are required. The validator allows the
fields of the Agent Skills spec (`license`, `compatibility`, `metadata`,
`allowed-tools`) and two Claude Code fields that other agents can ignore safely:
`disable-model-invocation: true` for a command-style skill that only the user
starts (`/handoff`), and `argument-hint` for its argument. It rejects fields
that change when a skill loads, such as `paths` or `when_to_use`, because other
agents read the same files and would load it differently.

A user-invoked skill's description is not shown to the model, so it needs no
"Use when" clause; write it for the person reading the `/` menu.

- `name`: kebab-case, at most 64 characters, equal to the directory name, and
  without the words "anthropic" or "claude". Existing names stay as they are:
  AGENTS.md, `.agents/settings.json` and other skills refer to them.
- Quote every value in double quotes. An unquoted value containing `:` or `#` is
  invalid YAML, and strict loaders such as `npx skills` skip the whole skill;
  the validator reports it.
- `description`: third person, at most 1,024 characters, aiming for under 400.
  First what the skill covers, then `Use when ...` with concrete triggers:
  tasks, file types, commands, and phrasings that never name the topic. When a
  nearby skill is the better fit for a near miss, add a "Not for X (use
  other-skill)" clause. The description is the only thing an agent sees before
  it decides to load the skill, so every "when" signal belongs there, not in the
  body.

Correct:

```yaml
description: "Go conventions for pkg/ajan and the FFI bridge, covering errors, logfx logging, context, testing, data structures and performance. Use when writing or reviewing .go files, adding a Go business domain, or fixing golangci-lint findings. Not for Go module tags (use release-and-ci)."
```

Incorrect:

```yaml
description: Helps with Go stuff # no scope, no triggers
```

---

## SKILL.md Body

Scope: Everything below the frontmatter

Rule: SKILL.md is an overview that sends the reader to the right file. Keep it
to at most 80 lines, in this order:

1. `# Title`, then one or two sentences on scope and what the skill does not
   cover.
2. `## Always`: 5 to 12 bullets that apply to every task in the domain. Only
   project-specific rules, each with a short reason when the reason is not
   obvious.
3. `## References`: a table that links every reference file directly and says
   when to read it.

```markdown
## References

| File                                | Read when                                    |
| ----------------------------------- | -------------------------------------------- |
| [errors.md](references/errors.md)   | Writing error handling, messages or wrapping |
| [logging.md](references/logging.md) | Adding logs or changing log levels           |
```

Loaded skill content stays in context for the rest of the session. A line that
does not change behavior costs tokens on every later turn.

---

## Reference Files

Scope: Files under `references/`

Rule:

- **One level deep.** SKILL.md links every reference file. An agent that follows
  a link from one reference file to another tends to preview the second one
  partially; links between reference files are fine as long as SKILL.md also
  links the target.
- **Split by topic.** One file per task area (errors, logging, testing), named
  for its content, kebab-case. A task should read one or two files, not the
  whole skill. Aim for at most 400 lines per file; the validator warns past 500.
- **Contents list.** A file over 100 lines starts with `## Contents` after its
  one-line scope, so a partial read still shows everything the file covers.
  `validate-skills.ts --fix` writes and refreshes it.
- **Repository facts go in `AGENTS.md`.** Paths, package counts, generators and
  the command list of this repository are loaded every session from `AGENTS.md`;
  skills state conventions that hold in any repository on the toolchain, and
  point to `AGENTS.md` for the concrete names. Keep that section short, since
  every session pays for it.
- **One owner per topic.** A rule lives in exactly one skill. Other skills point
  to it as `skill-name: Exact Section Title`; the validator checks that the
  title exists.

---

## What Belongs in a Skill

Scope: Every rule and example

Rule: Assume the reader is a strong model. Write down only what it would not do
by default in this repository:

- project decisions and conventions that differ from common defaults;
- paths, commands, package names and validators that exist here;
- the reason behind each rule, so it carries over to cases the examples miss.

Leave out textbook explanations, lists of benefits, API catalogues, and rules a
linter or formatter already enforces (name the tool in one line instead). Check
every path and command against the repository before writing it. Every example
must follow the other skills' rules too: an example that breaks another rule
teaches the break.

Give one default rather than a menu of options, and add the exception that
changes it. Use one term per concept across a skill (for example always
"endpoint", never also "route" or "URL"). Do not write dates or "until version
X" into a rule. State the current rule, and put a replaced one under an "Old
patterns" note only if readers still meet it in the code.

---

## Rule Sections

Scope: `##` sections in reference files

Rule: Each rule is one section, separated from the next by `---`:

````markdown
## Rule Title

Scope: where it applies

Rule: the rule, in the imperative.

Correct:

```go
// example
```

Incorrect:

```go
// counter-example
```

**Why:** the reason, in one or two sentences.
````

Keep capitalized MUST and NEVER for true invariants (security, data loss, commit
policy). An agent that knows the reason applies a rule better than one told to
obey it in capitals. Follow documentation-conventions: Plain Prose.

Match specificity to fragility:

- **Many valid approaches:** state the goal and the constraints in prose.
- **A preferred pattern:** give the pattern and say what may vary.
- **One safe sequence** (releases, migrations): give the exact commands and say
  not to change them.

A rule that agents break under pressure (skipping tests, committing unasked) may
add an anti-rationalization note: the excuse in quotes, then the answer.

---

## Scripts

Scope: `scripts/` in a skill

Rule: When agents keep re-deriving the same steps (a validation, a generator, a
checklist run by hand), put the code in `scripts/` and tell the skill whether to
run it or read it. A script runs without loading into context and gives the same
result every time.

Scripts use Node built-ins or the repo's own packages, carry the license header,
handle their own errors with messages that say what to fix, justify their
constants, and pass `deno task cli ok`.

---

## Validation

Validate after creating or changing a skill:

```bash
node .agents/skills/eser-rules-manager/scripts/validate-skills.ts        # all skills
node .agents/skills/eser-rules-manager/scripts/validate-skills.ts --fix  # also rewrite Contents lists
```

Pass skill directories to check only those. Errors exit 1; warnings do not.

| Check                | Level   | Requirement                                           |
| -------------------- | ------- | ----------------------------------------------------- |
| Frontmatter          | error   | Present, only allowed keys                            |
| name                 | error   | kebab-case, at most 64 chars, equals the directory    |
| description          | error   | At most 1,024 chars, no `<` or `>`, has "Use when"    |
| description length   | warning | Aim for under 400 chars                               |
| SKILL.md length      | error   | At most 80 lines                                      |
| SKILL.md links       | error   | Every relative link resolves                          |
| SKILL.md sections    | warning | Has `## Always` and `## References`                   |
| Reference links      | error   | Every `references/*.md` is linked from SKILL.md       |
| Contents list        | error   | Present and current in reference files over 100 lines |
| Reference length     | warning | At most 500 lines                                     |
| Cross-skill pointers | warning | `skill-name: Title` matches a heading in that skill   |
| eser-rules-manager   | error   | Every skill is in both skill tables                   |

---

## Creating a Skill

1. Check whether an existing skill should own the topic. Add a new skill only
   when no current scope fits.
2. Capture the intent from the conversation first: the steps taken, the owner's
   corrections, the tools used. Ask only for the gaps: what the skill should
   make an agent do, when it should load, what a good result looks like.
3. Write the evals before the rules (skill-evaluation.md), then write just
   enough to pass them.
4. Create `SKILL.md` and the reference files in the format above.
5. Add the skill to the table in eser-rules-manager SKILL.md, to the trigger
   table in skill-discovery.md, and to the skill map in AGENTS.md.
6. Validate, then run the behavior and trigger evals.

---

## Changing a Skill

1. Keep the name and directory.
2. For a change meant to alter behavior, snapshot the skill first
   (`cp -r .agents/skills/<name> etc/temp/_skill-evals/<name>/snapshot/`) as the
   eval baseline.
3. Change the existing rule rather than adding a near duplicate. When the rule
   belongs to another skill, change it there.
4. Update `## Always` only when the change applies to every task in the domain.
5. Validate with `--fix`, then evaluate the change against the snapshot.
