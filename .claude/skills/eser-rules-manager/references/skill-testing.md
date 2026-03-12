# Skill Testing & Validation

Test-Driven Development applied to skill documentation.

---

## TDD for Skills: RED-GREEN-REFACTOR

Rule: Never write a skill without observing a failure first.

### RED Phase (Baseline)

1. Run scenarios WITHOUT the skill present
2. Document exact failures and rationalizations word-for-word
3. Create pressure scenarios with 3+ simultaneous constraints
4. Identify what actually needs preventing (not assumptions)

### GREEN Phase (Write Skill)

1. Write minimal documentation addressing observed failures
2. Re-test with skill present
3. Agents should now comply
4. If violations continue, clarify the skill

### REFACTOR Phase (Close Loopholes)

1. Identify new rationalizations during testing
2. Add explicit counters for each excuse
3. Update anti-pattern sections
4. Re-test until compliance achieved

---

## Pressure Scenario Design

Rule: Test skills under realistic operational pressure, not ideal conditions.

### Constraint Types

Combine 3+ of these in test scenarios:

- **Time scarcity**: Tight deadlines, closing windows
- **Sunk cost**: Hours invested, reluctance to discard work
- **Fatigue**: End-of-session, competing priorities
- **Authority pressure**: User insistence or directive
- **Economic stakes**: Importance of task completion
- **Social dynamics**: Appearing inflexible or unhelpful

### Weak vs Strong Scenarios

Weak (single pressure):

```
"Implement this feature quickly"
```

Strong (layered pressures):

```
"We're 3 hours into this refactor, the user is getting frustrated,
and they just said 'just make it work, we can fix it later'.
Should you skip the tests?"
```

---

## Rationalization Capture

Rule: Document agent excuses verbatim to identify skill gaps.

### Common Rationalizations

Track these patterns and add explicit counters:

- "This case is different because..."
- "I'm following the spirit, not the letter"
- "Being pragmatic means adapting rules"
- "I already manually verified it works"
- "The user implicitly approved this"
- "It's just a small exception"

### Counter Pattern

For each rationalization, add explicit negation:

```markdown
## Anti-Patterns

**"This is a special case"**
No. The rule applies to ALL cases. If you think it's special,
ask the user to confirm the exception explicitly.
```

---

## Cross-Model Testing

Rule: Test skills with multiple model tiers.

| Model  | Testing Focus                                |
| ------ | -------------------------------------------- |
| Haiku  | Needs most guidance; reveals unclear areas   |
| Sonnet | Balanced; good baseline for average behavior |
| Opus   | Most capable; may mask skill ambiguities     |

If Opus complies but Haiku doesn't, the skill needs more explicit guidance.

---

## Degrees of Freedom

Rule: Match instruction specificity to task fragility.

### High Freedom (Text Instructions)

Use when: Multiple valid approaches exist, context-dependent decisions.

```markdown
Choose an appropriate data structure for the use case.
```

### Medium Freedom (Pseudocode)

Use when: Preferred patterns exist but some variation acceptable.

```markdown
1. Validate input
2. Transform data
3. Return result or error
```

### Low Freedom (Exact Scripts)

Use when: Operations are fragile, consistency critical.

```markdown
Run exactly: `npm run build && npm test`
Do not modify or skip steps.
```

---

## Feedback Loops

Rule: Build validator → fix → repeat patterns into skills.

### Pattern Structure

```
1. Create output/plan
2. Validate against requirements
3. If issues found → revise and revalidate
4. Proceed only when validation passes
```

### Example

```markdown
## Workflow

1. Generate migration SQL
2. Run: `make lint` to validate syntax
3. If errors, fix and re-run lint
4. Only after lint passes, run: `make migrate`
```

---

## Search Optimization

Rule: Optimize descriptions and content for skill discovery.

### Keyword Categories

Include all relevant keywords:

- **Error messages**: Exact text from common errors
- **Symptoms**: "flaky", "hanging", "slow", "failing"
- **Synonyms**: "test/spec/check", "lint/format/style"
- **Tool names**: Actual CLI tools and frameworks

### Naming Conventions

Use active voice with gerund form when appropriate:

Correct: `processing-pdfs`, `validating-forms`, `handling-errors`

Incorrect: `pdf-helper`, `form-utils`, `error-stuff`

---

## Pre-Share Checklist

### Content Quality

- [ ] Description includes WHAT + WHEN triggers (<200 chars)
- [ ] SKILL.md under 50 lines
- [ ] Detailed content in references/
- [ ] No time-sensitive information
- [ ] Consistent terminology throughout
- [ ] Concrete Correct/Incorrect examples
- [ ] File references one level deep only
- [ ] Clear workflows with numbered steps

### Testing Quality

- [ ] Baseline (RED) test completed without skill
- [ ] At least 3 pressure scenarios tested
- [ ] Tested with multiple model tiers if available
- [ ] Rationalizations captured and countered
- [ ] Real usage scenarios validated

### Anti-Patterns Covered

- [ ] Common excuses explicitly addressed
- [ ] Spirit-vs-letter arguments countered
- [ ] Red flags section for warning signs
- [ ] No vague guidance ("be careful", "use judgment")

---

## Terminology Consistency

Rule: Choose one term per concept; use throughout.

### Examples

| Concept       | Pick ONE            | Avoid mixing              |
| ------------- | ------------------- | ------------------------- |
| API paths     | endpoint            | URL, route, path          |
| Form elements | field               | input, box, element       |
| Data action   | extract             | pull, get, fetch, retrieve |
| File action   | create              | write, generate, make     |

---

## Collaborative Development

Rule: Use separate Claude instances for refinement vs testing.

### Process

1. **Claude A**: Refine skill instructions iteratively
2. **Claude B**: Test on real tasks (fresh context)
3. **Observe**: Navigation patterns, missed sections, confusion points
4. **Iterate**: Based on observed behavior, not assumptions

### Observation Points

- Unexpected exploration → structure needs clarity
- Missed connections → links need prominence
- Overreliance on one section → move to main file
- Ignored content → remove or improve signaling
