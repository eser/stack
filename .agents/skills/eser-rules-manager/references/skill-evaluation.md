# Skill Evaluation

How to show that a new or changed skill changes behavior, and that its
description makes it load when it should.

## Contents

- Test First
- When to Evaluate
- Behavior Evals
- Trigger Evals
- Improving From Results
- Pressure and Model Coverage
- Watch How Agents Use the Skill
- Before Sharing

---

## Test First

Scope: Every new skill and every rule meant to change behavior

Rule: Observe the failure before writing the fix, as with code:

1. **Red.** Run realistic tasks without the skill (or against a snapshot of the
   old version). Record what went wrong and the agent's own words when it talked
   itself out of a rule.
2. **Green.** Write the least text that addresses those failures, then rerun.
3. **Refactor.** When new excuses appear, answer them in the rule's reason or an
   anti-rationalization note, and rerun until the runs comply.

**Why:** a rule written for an imagined failure costs context in every session
and may not address what agents actually get wrong.

---

## When to Evaluate

Scope: Creating a skill, or a change to a skill that alters what an agent does

Rule: Evaluate when the change is meant to change behavior: a new rule, a
reworded rule that agents were ignoring, a new or rewritten description. Skip it
for typo fixes, link fixes and formatting. Rules whose result is objectively
checkable (a file exists, a command ran, a pattern is absent from the diff) get
assertions. Rules about judgment or prose style get a human read of the outputs
instead of forced assertions.

**Why:** a skill that reads well but does not change what an agent does is noise
in every context it loads into.

---

## Behavior Evals

Scope: Checking that the skill's rules are followed

Rule: Write 2-3 realistic task prompts, the kind a person would type in this
repo, and run each one twice in the same turn with separate subagents:

- **With skill:** the subagent reads the skill under test.
- **Baseline:** for a new skill, no skill at all. For a changed skill, the old
  version: snapshot it before editing and point the baseline at the snapshot.

```bash
cp -r .agents/skills/<name> etc/temp/_skill-evals/<name>/snapshot/
```

Launch both runs together so they finish around the same time. While they run,
write the assertions. Each assertion is objectively verifiable and named so a
reader knows what it checks. After the runs, grade each assertion against the
output with a pass or fail and one line of evidence (a file path, a quoted line,
a command result). Check assertions with a script when possible. Then read the
transcripts, not only the final output.

Keep the work outside the tracked tree, under
`etc/temp/_skill-evals/<skill>/iteration-<n>/<eval-name>/{with_skill,baseline}/`
(`etc/temp/` is gitignored; the leading `_` keeps Go's `./...` from compiling Go
files an eval writes there). Commit only the eval definitions:
`.agents/skills/<skill>/evals/evals.json`.

```json
{
  "skill_name": "workflow-practices",
  "evals": [
    {
      "id": 1,
      "name": "bugfix-writes-failing-test-first",
      "prompt": "the config merge drops a timeout of 0 from the env, fix it",
      "assertions": [
        "A test reproducing the zero-value case is added",
        "The commit body names the root cause with file:line"
      ]
    }
  ]
}
```

A skill passes when the with-skill runs pass assertions that the baseline fails.
An assertion that passes in both configurations does not discriminate; replace
it or drop it.

---

## Trigger Evals

Scope: A new skill, or any change to a `description`

Rule: The description is what decides whether the skill loads at all. Write
16-20 realistic queries and store them in
`.agents/skills/<skill>/evals/triggers.json`:

- 8-10 should trigger: different phrasings of the same need, formal and casual,
  some that never name the skill's topic directly.
- 8-10 should not trigger: near misses that share keywords but need a different
  skill. "Write a fibonacci function" is not a useful negative for a release
  skill; "bump the Go module tag for ajan" is, because Go modules do not use the
  version-bump script.

```json
[
  { "query": "cut v4.6.0 and push the tag", "should_trigger": true },
  { "query": "tag pkg/ajan v0.9.2 for the Go module", "should_trigger": false }
]
```

Queries must be substantive. An agent does not consult a skill for a one-step
request it can do directly, so "read file X" tests nothing. Check the
description against the set. When skill-creator is installed, its
`scripts/run_loop.py` automates this with a held-out test split; take its best
description by test score, not train score.

---

## Improving From Results

Scope: The iteration after a failed or mixed eval

Rule:

- Generalize. Fix the reason a run went wrong, not the specific prompt; a skill
  tuned to three prompts fails on the fourth.
- Remove text that is not pulling its weight. If transcripts show agents
  spending time on something the skill told them to do that did not help, cut it
  and rerun.
- Explain the reason. When an agent ignored a rule, adding capital letters
  rarely helps; saying why the rule exists usually does.
- Bundle repeated work. If every run wrote the same helper script, put it in the
  skill's `scripts/` and tell the skill to run it.

Rerun into a new `iteration-<n+1>/` with the same baseline, and stop when the
with-skill runs pass, the owner is satisfied, or iterations stop improving.

---

## Pressure and Model Coverage

Scope: Discipline rules (tests, commits, quality gates) and skills used by
several models

Rule: Test discipline rules under the pressure that breaks them, not in calm
conditions. Combine at least three pressures in one prompt: time ("we are three
hours in"), sunk cost, the user's insistence ("just make it work"), fatigue at
the end of a long session. A rule that holds only without pressure does not
hold.

Run the evals on the smallest model that will use the skill as well as the
largest. A skill that works for Opus can be too terse for Haiku; one tuned for
Haiku can over-explain to Opus.

---

## Watch How Agents Use the Skill

Scope: After a skill has been in use

Rule: Read transcripts of real tasks, not only eval outputs:

- Files read in an unexpected order: the References table does not say clearly
  when to read what.
- A reference file never opened: it is not needed, or its "Read when" is wrong.
- The same file opened on every task: its core belongs in `## Always`.
- A rule stated in the skill but not followed: give the reason, or move it
  higher; do not add capitals.

---

## Before Sharing

- [ ] `validate-skills.ts` passes without errors
- [ ] The description says what and when, in the third person
- [ ] SKILL.md links every reference file with a "Read when"
- [ ] Every path, command and validator named in the skill exists
- [ ] Every example follows the other skills' rules
- [ ] Each rule says why it exists
- [ ] A baseline run failed an assertion that the with-skill run passes
- [ ] The description was checked against should-trigger and near-miss queries
