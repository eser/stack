# Plain Prose

Writing rules for every sentence a person reads in this repository.

## Contents

- Plain Prose
- Empty Qualifiers
- Claims Need Evidence
- No Em Dashes
- Borrowed Rhythm
- Filler and Hedging
- Name the Actor
- Neutral Terms
- Formatting That Shouts
- Audit Before Delivering

---

## Plain Prose

Scope: Every sentence a person reads: READMEs, skill docs, ADRs, backlog items,
changelog entries, commit messages, code comments

Rule: Documentation says what the code does, in the words a maintainer would use
out loud. Text that reads as generated (empty qualifiers, borrowed rhythm,
claims with nothing behind them) is a defect even when every fact in it is true,
because readers stop trusting the page. The rules below name the patterns that
give it away. When a sentence trips one, fix the sentence; do not pad it back up
with a different pattern.

---

## Empty Qualifiers

Rule: Cut words that sound like praise and carry no information: comprehensive,
seamless, robust, powerful, elegant, cutting-edge, next-level, world-class,
effortless, streamline, leverage, harness (as a verb), unlock, elevate, empower,
delve, showcase, testament, game-changer. Replace the word with what the package
actually does, or with nothing.

Correct:

```markdown
`@eserstack/parsing` is a parsing library for analyzing and tokenizing strings.

The HTTP adapter provides HTTP connections with built-in resilience features:
```

Incorrect:

```markdown
`@eserstack/parsing` is a comprehensive parsing library designed to analyze and
tokenize strings. <!-- ❌ comprehensive says nothing -->

The HTTP adapter provides robust, production-ready HTTP connections with
built-in resilience features: <!-- ❌ two claims, no evidence -->
```

---

## Claims Need Evidence

Rule: A statement about quality, scale or adoption is either backed by something
in the repository (a benchmark with its date and command, a test, a measured
size) or it is not written. This covers "production-ready", "battle-tested",
"blazing fast", "trusted by", "industry-leading", and any number, quote or name
that did not come from a source the reader can open. When you do not know a
fact, leave it out; never fill the gap with a plausible guess.

Correct:

```markdown
Measured on 2026-09-17 over this repository (1964 files, best of 4 warm runs):
Go 104.5 ms, TypeScript 126.1 ms.
```

Incorrect:

```markdown
The Go validator is significantly faster.

<!-- ❌ faster than what, measured how --> Used by thousands of teams.
<!-- ❌ no source -->
```

---

## No Em Dashes

Rule: New or edited prose uses no em dash (`—`), spaced or not, and no double
hyphen standing in for one. Replace each with, in order of preference, a period,
a comma, a colon, or parentheses; restructure when none fits. Text you did not
touch keeps its punctuation, and so do verbatim quotes of program output, step
names and titles. Convert the sentences you are already editing; do not reformat
a file you were not asked to change.

Correct:

```markdown
Every publish step is idempotent: `deno publish` skips versions already on JSR,
and asset upload clobbers. The chain can therefore be run again for the same
tag.
```

Incorrect:

```markdown
Every publish step is idempotent — `deno publish` skips versions already on JSR,
asset upload clobbers — so the chain can be run again for the same tag.
```

---

## Borrowed Rhythm

Rule: Avoid the sentence shapes that models reach for by default:

- "It's not just X, it's Y" and "not only X but also Y"
- A run of clipped fragments for drama ("No config. No setup. No surprises.")
- Every list forced to three items when the content has two or five
- "From X to Y, and everything in between" where X and Y are not a scale
- Aphorisms ("Simplicity is the language of trust")
- Signposting ("Let's dive in", "Here's what you need to know", "In this section
  we'll explore")
- Chatbot closers ("I hope this helps", "Let me know if you have questions")
- Upbeat send-offs ("Exciting times ahead", "The future looks bright")

Say the thing directly, in as many items as there are.

Correct:

```markdown
The dashboard shows the metrics you select. Options come from the selected item.
```

Incorrect:

```markdown
It's not just a dashboard, it's a command center. No guessing. No noise.
```

---

## Filler and Hedging

Rule: "In order to" is "to"; "due to the fact that" is "because"; "it is
important to note that" and "it is worth noting" are nothing. One qualifier per
claim: "may" or "usually", never "could potentially possibly".

Correct:

```markdown
Spawning it would mean shipping and installing a program to talk to a struct
already in memory.
```

Incorrect:

```markdown
Spawning it would mean shipping and installing a program in order to talk to a
struct already in memory.
```

---

## Name the Actor

Rule: When the actor is known, the sentence names it. "The pipeline publishes
the platform packages first", not "the platform packages are published first".
Passive is fine when the actor is unknown, irrelevant or deliberately withheld
("the server was restarted at 03:00"). Do not give abstractions a mind: a
resolver probes, a validator reports, a bundle imports; none of them
"understands", "decides" or "wants".

---

## Neutral Terms

Rule: Use neutral technical terms in new code, flags and docs: allowlist and
denylist, primary and replica, main. Do not assume the reader's gender,
operating system or access to a paid tool.

---

## Formatting That Shouts

Rule: Emphasis is written into the sentence, not into the markup.

- No inline-header bullets that restate the item
  (`- **Performance:** it is
  faster`). Changelog scope labels
  (`**codebase**:`) are a commit convention and stay.
- No bold on every key term; bold at most the one phrase the reader must not
  miss.
- No quotation marks as emphasis or hedging; quotes are for real quotes, titles
  and program output.
- No all-caps clauses inside paragraphs.
- Emojis only where the Emoji Preservation rule already puts them: package
  titles and the links footer. Not as bullet decoration in body text.

---

## Audit Before Delivering

Rule: Before handing over any documentation, read it once as a stranger and
answer two questions: what in this text makes it look generated, and does it
state any fact, number, name, date or quote that is not in the source or in the
repository. Fix both. Then search the diff for `—`; a hit means the text is not
done. This is the same loop the antislop copywriting skill describes; the
patterns above are its documentation-specific subset, adapted to this
repository's own conventions (emoji titles and footers, changelog scope labels).
