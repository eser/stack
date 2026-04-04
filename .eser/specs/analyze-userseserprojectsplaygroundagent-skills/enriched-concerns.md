# Enriched Concerns

Analysis of 12 agent-skills (4 high, 8 medium) adapted into noskills concern
format.

---

## PART 1: ENRICHMENTS TO EXISTING CONCERNS

---

### 1. Concern: `long-lived` (003)

#### NEW Reminders

| Reminder                                                                                                   | Source Skill                |
| ---------------------------------------------------------------------------------------------------------- | --------------------------- |
| Deprecation planning starts at design time -- ask "how would we remove this in 3 years?"                   | deprecation-and-migration   |
| Never deprecate without a working, production-proven replacement                                           | deprecation-and-migration   |
| If you own the deprecated infra, YOU migrate the consumers (the Churn Rule)                                | deprecation-and-migration   |
| Zombie code with no owner must get investment or removal -- no limbo                                       | deprecation-and-migration   |
| Prefer addition over modification for public interfaces -- new optional fields, not changed types          | api-and-interface-design    |
| Every observable API behavior is a de facto contract (Hyrum's Law) -- be intentional about what you expose | api-and-interface-design    |
| RATIONALIZATION ALERT: "Someone might need it later" -- unused code costs more to keep than to rebuild     | deprecation-and-migration   |
| RATIONALIZATION ALERT: "We can maintain both systems indefinitely" -- two systems = double everything      | deprecation-and-migration   |
| Feature flags that live forever become tech debt -- set a cleanup date at creation                         | shipping-and-launch         |
| Separate refactoring from feature work into distinct commits                                               | git-workflow-and-versioning |

#### NEW Acceptance Criteria

| Criterion                                                                                  | Source Skill              |
| ------------------------------------------------------------------------------------------ | ------------------------- |
| Deprecated code has a migration guide with concrete steps and examples                     | deprecation-and-migration |
| No zombie code: every module has an identifiable owner                                     | deprecation-and-migration |
| API changes are additive (optional fields) -- no breaking modifications to existing fields | api-and-interface-design  |
| ADRs exist for all significant architectural decisions made in this spec                   | documentation-and-adrs    |
| No feature flags without an owner and expiration date                                      | shipping-and-launch       |

#### NEW Extras

| Question                                                                   | questionId     | Source Skill              |
| -------------------------------------------------------------------------- | -------------- | ------------------------- |
| How would we remove this system in 3 years? What clean boundaries exist?   | reversibility  | deprecation-and-migration |
| Are there zombie modules with no owner that this change touches?           | scope_boundary | deprecation-and-migration |
| Does this change leak implementation details through the public interface? | scope_boundary | api-and-interface-design  |

#### NEW specSections

| Section               | Source Skill              |
| --------------------- | ------------------------- |
| Deprecation Lifecycle | deprecation-and-migration |
| ADR Log               | documentation-and-adrs    |
| Interface Stability   | api-and-interface-design  |

---

### 2. Concern: `open-source` (001)

#### NEW Reminders

| Reminder                                                                                            | Source Skill                |
| --------------------------------------------------------------------------------------------------- | --------------------------- |
| Types ARE the documentation -- define contracts before implementing                                 | api-and-interface-design    |
| API error responses must follow a single consistent shape across all endpoints                      | api-and-interface-design    |
| List endpoints must support pagination from day one                                                 | api-and-interface-design    |
| Every change needs a description that stands alone in version control history                       | git-workflow-and-versioning |
| ADRs prevent re-debating the same decision 6 months later -- write them                             | documentation-and-adrs      |
| RATIONALIZATION ALERT: "We'll document the API later" -- the types ARE the first test of the design | api-and-interface-design    |
| Comment the WHY, not the WHAT -- code shows what, docs explain why and what was rejected            | documentation-and-adrs      |
| Changelog updated for every shipped feature with Added/Fixed/Changed sections                       | documentation-and-adrs      |

#### NEW Acceptance Criteria

| Criterion                                                              | Source Skill                |
| ---------------------------------------------------------------------- | --------------------------- |
| Every endpoint has typed input and output schemas                      | api-and-interface-design    |
| Error responses follow a single consistent format across all endpoints | api-and-interface-design    |
| Naming follows consistent conventions across all endpoints             | api-and-interface-design    |
| Commit messages explain the why, follow conventional type prefixes     | git-workflow-and-versioning |
| Known gotchas documented inline where they matter                      | documentation-and-adrs      |

#### NEW Extras

| Question                                            | questionId   | Source Skill             |
| --------------------------------------------------- | ------------ | ------------------------ |
| Is the API contract defined before implementation?  | verification | api-and-interface-design |
| Are there architectural decisions that need an ADR? | status_quo   | documentation-and-adrs   |

#### NEW specSections

| Section         | Source Skill             |
| --------------- | ------------------------ |
| Error Contract  | api-and-interface-design |
| Changelog Entry | documentation-and-adrs   |

---

### 3. Concern: `beautiful-product` (002)

#### NEW Reminders

| Reminder                                                                                           | Source Skill             |
| -------------------------------------------------------------------------------------------------- | ------------------------ |
| Keyboard navigation must work for all interactive elements                                         | shipping-and-launch      |
| Color contrast must meet WCAG 2.1 AA (4.5:1 for text)                                              | shipping-and-launch      |
| Focus management must be correct for modals and dynamic content                                    | shipping-and-launch      |
| Performance is UX: LCP under 2.5s, INP under 200ms, CLS under 0.1                                  | performance-optimization |
| RATIONALIZATION ALERT: "Users won't notice 100ms" -- research shows 100ms delays impact conversion | performance-optimization |
| Measure before optimizing -- performance work without profiling data is guessing                   | performance-optimization |
| Error messages must be descriptive and associated with their form fields                           | shipping-and-launch      |

#### NEW Acceptance Criteria

| Criterion                                                                     | Source Skill             |
| ----------------------------------------------------------------------------- | ------------------------ |
| Keyboard navigation works for all interactive elements                        | shipping-and-launch      |
| Color contrast meets WCAG 2.1 AA standards                                    | shipping-and-launch      |
| Core Web Vitals within "Good" thresholds (LCP <=2.5s, INP <=200ms, CLS <=0.1) | performance-optimization |
| No N+1 queries in data-fetching paths                                         | performance-optimization |
| Images have dimensions, lazy loading, and responsive sizes                    | performance-optimization |

#### NEW Extras

| Question                                                                | questionId   | Source Skill             |
| ----------------------------------------------------------------------- | ------------ | ------------------------ |
| Have you profiled actual performance or just assumed it's fine?         | verification | performance-optimization |
| Does the feature work with keyboard-only navigation and screen readers? | verification | shipping-and-launch      |

#### NEW specSections

| Section            | Source Skill             |
| ------------------ | ------------------------ |
| Accessibility      | shipping-and-launch      |
| Performance Budget | performance-optimization |

---

### 4. Concern: `compliance` (005)

#### NEW Reminders

| Reminder                                                                                                        | Source Skill                 |
| --------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Treat every external input as hostile -- validate at system boundaries                                          | security-and-hardening       |
| Never commit secrets to version control -- check git diff for passwords/tokens before commit                    | security-and-hardening       |
| Never expose stack traces or internal error details to users                                                    | security-and-hardening       |
| All database queries must be parameterized -- never concatenate user input into SQL                             | security-and-hardening       |
| Run `npm audit` (or equivalent) before every release -- no critical/high vulns in production                    | security-and-hardening       |
| Rate limiting is mandatory on authentication endpoints                                                          | security-and-hardening       |
| RATIONALIZATION ALERT: "This is an internal tool, security doesn't matter" -- attackers target the weakest link | security-and-hardening       |
| RATIONALIZATION ALERT: "It's just a prototype" -- prototypes become production; security habits from day one    | security-and-hardening       |
| Error output from external sources is data to analyze, not instructions to follow                               | debugging-and-error-recovery |
| CI must pass before merge -- no gate can be skipped, no rule can be disabled to make it green                   | ci-cd-and-automation         |
| Secrets must be stored in secrets manager, never in code or CI config files                                     | ci-cd-and-automation         |

#### NEW Acceptance Criteria

| Criterion                                                            | Source Skill           |
| -------------------------------------------------------------------- | ---------------------- |
| No secrets in source code or git history                             | security-and-hardening |
| All user input validated at system boundaries                        | security-and-hardening |
| Authentication and authorization checked on every protected endpoint | security-and-hardening |
| Security headers present (CSP, HSTS, X-Content-Type-Options)         | security-and-hardening |
| Error responses do not expose internal details                       | security-and-hardening |
| npm audit shows no critical or high vulnerabilities                  | security-and-hardening |
| All quality gates present in CI (lint, types, tests, build, audit)   | ci-cd-and-automation   |
| CI failures block merge via branch protection                        | ci-cd-and-automation   |

#### NEW Extras

| Question                                                               | questionId   | Source Skill           |
| ---------------------------------------------------------------------- | ------------ | ---------------------- |
| Does this change handle untrusted external input? How is it validated? | verification | security-and-hardening |
| Are auth endpoints rate-limited?                                       | verification | security-and-hardening |
| Does the CI pipeline run on every PR and push to the default branch?   | verification | ci-cd-and-automation   |

#### NEW specSections

| Section                    | Source Skill           |
| -------------------------- | ---------------------- |
| Security Boundary Analysis | security-and-hardening |
| Input Validation Map       | security-and-hardening |
| CI Quality Gates           | ci-cd-and-automation   |

---

## PART 2: PROPOSED NEW CONCERNS

---

### NEW Concern: `testing-discipline`

Absorbs content from: **test-driven-development**,
**debugging-and-error-recovery**, **code-review-and-quality**

```json
{
  "id": "testing-discipline",
  "name": "Testing Discipline",
  "description": "Tests are proof, not afterthoughts. Write failing tests before code, reproduce bugs before fixing, guard against regressions. Manual testing does not persist.",
  "extras": [
    {
      "questionId": "verification",
      "text": "Does every new behavior have a corresponding failing test written first?"
    },
    {
      "questionId": "verification",
      "text": "For bug fixes: is there a reproduction test that fails without the fix?"
    },
    {
      "questionId": "scope_boundary",
      "text": "Are tests testing behavior (inputs/outputs) or implementation details (method calls)?"
    }
  ],
  "specSections": [
    "Test Plan",
    "Regression Guards",
    "Bug Reproduction Steps"
  ],
  "reminders": [
    "Write the failing test BEFORE writing the code that makes it pass",
    "Bug fixes require a reproduction test that fails without the fix",
    "Test behavior (state), not implementation (interactions)",
    "RATIONALIZATION ALERT: 'I'll write tests after the code works' -- you won't, and late tests verify assumptions not behavior",
    "RATIONALIZATION ALERT: 'This is too simple to test' -- simple code gets complicated; the test documents intent",
    "Every test must fail on first run -- a test that passes immediately proves nothing",
    "Flaky tests mask real bugs -- fix the flakiness, do not just re-run",
    "No test skipping to make the suite pass -- disabled tests are hidden regressions",
    "RED FLAG: 'All tests pass' but no tests were actually run for the changed code",
    "Stop the line: do not push past a failing test to work on the next feature",
    "Prefer real implementations over mocks -- over-mocking creates false confidence",
    "After a bug fix, run the full suite to verify no regressions"
  ],
  "acceptanceCriteria": [
    "Every new behavior has a corresponding test",
    "All tests pass with no skipped or disabled tests",
    "Bug fixes include reproduction test that failed before the fix",
    "Test names describe the expected behavior",
    "No test verifies implementation details (method call order, internal state)",
    "Root cause identified and documented for any bug fix"
  ]
}
```

---

### NEW Concern: `shipping-safely`

Absorbs content from: **shipping-and-launch**, **ci-cd-and-automation**,
**git-workflow-and-versioning**

```json
{
  "id": "shipping-safely",
  "name": "Shipping Safely",
  "description": "Every deploy is reversible, observable, and incremental. Rollback plan before deploy, monitoring during deploy, verification after deploy. No big-bang releases.",
  "extras": [
    {
      "questionId": "verification",
      "text": "What is the rollback plan if this deploy fails? How long does rollback take?"
    },
    {
      "questionId": "verification",
      "text": "Is monitoring in place to detect problems within 15 minutes of deploy?"
    },
    {
      "questionId": "scope_boundary",
      "text": "Can this change be deployed behind a feature flag for incremental rollout?"
    }
  ],
  "specSections": [
    "Pre-Launch Checklist",
    "Rollback Plan",
    "Monitoring and Observability",
    "Staged Rollout Plan"
  ],
  "reminders": [
    "Every deployment needs a documented rollback plan BEFORE it happens",
    "Deploy behind feature flags -- decouple deployment from release",
    "RATIONALIZATION ALERT: 'It works in staging, it'll work in production' -- production has different data, traffic, and edge cases",
    "RATIONALIZATION ALERT: 'We don't need monitoring' -- without it you learn about problems from user complaints",
    "RATIONALIZATION ALERT: 'Rolling back is admitting failure' -- shipping broken features is the real failure",
    "Roll back immediately if error rate exceeds 2x baseline or P95 latency exceeds 50% above baseline",
    "Monitor for the first hour after every deploy: health check, error rate, latency, critical flow",
    "No Friday afternoon deploys",
    "Atomic commits: each commit does one logical thing, under 300 lines",
    "RED FLAG: production deploys without staging verification",
    "RED FLAG: CI failures ignored or tests disabled to make pipeline pass",
    "No console.log debugging statements in production code"
  ],
  "acceptanceCriteria": [
    "Rollback plan documented before deploy",
    "Feature flag configured for new features (if applicable)",
    "Monitoring confirms normal error rate and latency post-deploy",
    "Health check endpoint returns 200 in production",
    "Critical user flow verified manually after deploy",
    "All CI quality gates pass (lint, types, tests, build, audit)",
    "No TODO comments that should be resolved before launch"
  ]
}
```

---

### NEW Concern: `idea-quality`

Absorbs content from: **idea-refine**

```json
{
  "id": "idea-quality",
  "name": "Idea Quality",
  "description": "Ideas are refined through structured divergent and convergent thinking. Every spec starts with a clear problem, target user, and 'Not Doing' list. Assumptions are surfaced before committing to a direction.",
  "extras": [
    {
      "questionId": "status_quo",
      "text": "Who specifically is this for, and what does success look like for them?"
    },
    {
      "questionId": "scope_boundary",
      "text": "What are the hidden assumptions being made? How will each be validated?"
    },
    {
      "questionId": "ambition",
      "text": "What is the 10x simpler version of this that still solves the core problem?"
    },
    {
      "questionId": "scope_boundary",
      "text": "What are we explicitly NOT doing, and why?"
    }
  ],
  "specSections": [
    "Problem Statement (How Might We)",
    "Target User and Success Criteria",
    "Assumptions to Validate",
    "Not Doing List",
    "MVP Scope"
  ],
  "reminders": [
    "Start with the user and their problem -- work backwards to technology",
    "RATIONALIZATION ALERT: 'How it's usually done' is not a reason -- challenge every assumption",
    "The Not Doing list is the most valuable part -- make trade-offs explicit",
    "No plan without surfacing assumptions -- untested assumptions kill good ideas",
    "Push toward the simplest version that still solves the real problem",
    "Be honest, not supportive -- a good partner is not a yes-machine for weak ideas",
    "RED FLAG: jumping to solution without defining who it's for and what success looks like",
    "RED FLAG: generating 20+ shallow variations instead of 5-8 well-considered ones",
    "The user must confirm the final direction before any implementation work begins"
  ],
  "acceptanceCriteria": [
    "Clear 'How Might We' problem statement exists",
    "Target user and success criteria are defined",
    "Multiple directions explored, not just the first idea",
    "Hidden assumptions listed with validation strategies",
    "Not Doing list makes trade-offs explicit",
    "Output is a concrete artifact, not just conversation",
    "User confirmed the final direction"
  ]
}
```

---

### NEW Concern: `code-review-rigor`

Absorbs content from: **code-review-and-quality**,
**debugging-and-error-recovery**

```json
{
  "id": "code-review-rigor",
  "name": "Code Review Rigor",
  "description": "Five-axis review (correctness, readability, architecture, security, performance) on every change. No rubber-stamping. Dead code hygiene. AI-generated code gets more scrutiny, not less.",
  "extras": [
    {
      "questionId": "verification",
      "text": "Has this change been reviewed across all five axes (correctness, readability, architecture, security, performance)?"
    },
    {
      "questionId": "verification",
      "text": "Is there dead code left behind by this change? List it explicitly."
    }
  ],
  "specSections": [
    "Review Checklist",
    "Dead Code Audit"
  ],
  "reminders": [
    "Review tests FIRST -- they reveal intent and coverage gaps",
    "RATIONALIZATION ALERT: 'AI-generated code is probably fine' -- AI code needs MORE scrutiny, not less",
    "RATIONALIZATION ALERT: 'We'll clean it up later' -- later never comes; require cleanup before merge",
    "RATIONALIZATION ALERT: 'It works, that's good enough' -- working but unreadable/insecure code creates compounding debt",
    "Don't rubber-stamp: 'LGTM' without evidence of review helps no one",
    "Label review findings: Critical / Nit / Optional / FYI -- so authors know what's required",
    "Quantify problems when possible: 'N+1 adds ~50ms per item' beats 'could be slow'",
    "Check for dead code after every refactor -- list it, ask before deleting",
    "Target ~100 lines per change; split anything over 300 lines",
    "1000 lines where 100 suffice is a failure -- ask if abstractions earn their complexity",
    "RED FLAG: security-sensitive changes without security-focused review"
  ],
  "acceptanceCriteria": [
    "All Critical review findings resolved",
    "Tests pass and build succeeds",
    "No dead code artifacts (no-op variables, commented-out code, backwards-compat shims)",
    "Change is under 300 lines or has justified split plan",
    "Verification story documented (what changed, how verified)"
  ]
}
```

---

## PART 3: ANTI-RATIONALIZATION REFERENCE

Cross-skill rationalization alerts adapted as reminder-length text, grouped by
theme.

### "I'll do it later" family

- `testing-discipline`: "I'll write tests after the code works" -- late tests
  verify assumptions, not behavior
- `code-review-rigor`: "We'll clean it up later" -- later never comes; cleanup
  before merge
- `compliance`: "We'll add security later" -- retrofitting security is 10x
  harder
- `shipping-safely`: "We'll add monitoring later" -- you can't debug what you
  can't see
- `long-lived`: "We'll deprecate it after we finish the new system" -- plan
  deprecation at design time

### "It's not important" family

- `compliance`: "This is an internal tool, security doesn't matter" -- attackers
  target the weakest link
- `testing-discipline`: "This is too simple to test" -- simple code gets
  complicated
- `compliance`: "It's just a prototype" -- prototypes become production
- `shipping-safely`: "We don't need feature flags for this" -- even simple
  changes can break things

### "Trust me" family

- `testing-discipline`: "I tested it manually" -- manual testing doesn't persist
- `code-review-rigor`: "AI-generated code is probably fine" -- AI code needs
  MORE scrutiny
- `code-review-rigor`: "I wrote it, so I know it's correct" -- authors are blind
  to own assumptions
- `shipping-safely`: "It works in staging, it'll work in production" --
  production has different data and edge cases
- `beautiful-product`: "Users won't notice 100ms" -- research shows 100ms delays
  impact conversion

### "It's fine as-is" family

- `long-lived`: "It still works, why remove it?" -- unmaintained code
  accumulates security debt silently
- `long-lived`: "Someone might need it later" -- keeping unused code costs more
  than rebuilding
- `open-source`: "The code is self-documenting" -- code shows what, not why or
  what was rejected
- `long-lived`: "We can maintain both systems indefinitely" -- two systems =
  double maintenance

---

## PART 4: VERIFICATION GATES REFERENCE

Concrete checks per concern, derived from skill verification sections.

### testing-discipline

- [ ] Every new behavior has a corresponding test
- [ ] Bug fixes include a reproduction test that failed before the fix
- [ ] All tests pass with no skipped tests
- [ ] Root cause identified and documented for any bug fix
- [ ] Full test suite run after fix to check for regressions

### shipping-safely

- [ ] Pre-launch checklist completed (code quality, security, performance,
      accessibility, infra, docs)
- [ ] Feature flag configured and tested in both states
- [ ] Rollback plan documented with trigger conditions and steps
- [ ] Health check returns 200 post-deploy
- [ ] Error rate and latency normal post-deploy
- [ ] Critical user flow works end-to-end in production
- [ ] All CI quality gates present and enforced

### idea-quality

- [ ] "How Might We" problem statement exists
- [ ] Target user and success criteria defined
- [ ] Multiple directions explored (not just the first idea)
- [ ] Hidden assumptions listed with validation strategies
- [ ] "Not Doing" list with explicit trade-offs
- [ ] User confirmed direction before implementation

### code-review-rigor

- [ ] All Critical/Important review issues resolved
- [ ] Five-axis review performed (correctness, readability, architecture,
      security, performance)
- [ ] Tests pass and build succeeds
- [ ] Verification story documented
- [ ] Dead code identified and removed

### long-lived (new additions)

- [ ] Replacement is production-proven before deprecation
- [ ] Migration guide exists with concrete steps
- [ ] All consumers migrated (verified by metrics)
- [ ] No references to deprecated systems remain
- [ ] API changes are additive and backward-compatible

### compliance (new additions)

- [ ] npm audit shows no critical/high vulnerabilities
- [ ] All user input validated at system boundaries
- [ ] Auth checked on every protected endpoint
- [ ] Security headers present
- [ ] Error responses don't expose internals
- [ ] Rate limiting active on auth endpoints
- [ ] CI pipeline runs on every PR with branch protection

---

## PART 5: RED FLAGS REFERENCE

Observable patterns indicating a concern is being violated, grouped by concern.

### testing-discipline

- Writing code without corresponding tests
- Tests that pass on first run without being verified to fail first
- Bug fixes without reproduction tests
- Skipping tests to make the suite pass
- "All tests pass" but no tests exist for the changed code

### shipping-safely

- Deploying without a rollback plan
- No monitoring or error reporting in production
- Big-bang releases (everything at once, no staging)
- Feature flags with no expiration or owner
- Friday afternoon deploys
- CI failures ignored or tests disabled to pass pipeline

### idea-quality

- Jumping straight to implementation without defining the user and problem
- No assumptions surfaced before committing to a direction
- No "Not Doing" list making trade-offs explicit
- Yes-machining weak ideas instead of pushing back

### code-review-rigor

- PRs merged without any review
- "LGTM" without evidence of actual review
- Large PRs that are "too big to review properly"
- No regression tests accompanying bug fix PRs
- Accepting "I'll fix it later" promises

### long-lived (new additions)

- Deprecated systems with no replacement available
- "Soft" deprecation advisory for years with no progress
- New features added to a deprecated system
- Removing code without verifying zero active consumers

### compliance (new additions)

- User input passed directly to queries, commands, or HTML rendering
- Secrets in source code or commit history
- API endpoints without auth checks
- Wildcard CORS origins
- Stack traces exposed to users
- Dependencies with known critical vulnerabilities
