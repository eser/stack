# Requirement Clarification - Detailed Rules

## Clarification Workflow

Scope: Before implementing any non-trivial feature

Rule: Follow this decision tree before writing code.

```
Is the requirement clear and unambiguous?
├── YES → Proceed with implementation
└── NO → Are there multiple valid approaches?
    ├── YES → Present options with trade-offs, ask for preference
    └── NO → Is critical information missing?
        ├── YES → Ask specific questions to fill gaps
        └── NO → State your assumption, proceed unless corrected
```

---

## When to Ask Questions

Scope: Identifying situations requiring clarification

Rule: Ask clarifying questions when any of these conditions apply.

**Must Ask:**

- Multiple architecturally different implementations exist
- Business logic has unclear edge cases
- Breaking changes to existing behavior possible
- Security implications unclear
- Performance vs. simplicity trade-off needed
- Scope boundaries undefined ("add a feature" without details)

**Should Ask:**

- User's preferred technology/library unclear
- Testing strategy not specified
- Error handling approach ambiguous
- Data validation rules missing

**Don't Ask:**

- Trivial implementation details (variable names, formatting)
- Decisions covered by existing codebase patterns
- Standard best practices apply clearly
- User explicitly said "use your judgment"

---

## Question Templates

Scope: Formulating effective clarifying questions

Rule: Use structured question formats for clarity.

### Scope Clarification

```
I want to clarify the scope before implementing:
- Should this handle [edge case A]?
- Should this include [related feature B]?
- Is [boundary condition C] in or out of scope?
```

### Multiple Approaches

```
There are several ways to implement this:

1. **[Approach A]**: [1-line description]
   - Pros: [benefits]
   - Cons: [drawbacks]

2. **[Approach B]**: [1-line description]
   - Pros: [benefits]
   - Cons: [drawbacks]

Which approach do you prefer, or should I choose based on [criteria]?
```

### Missing Information

```
To implement this correctly, I need to know:
1. [Specific question about requirement]
2. [Specific question about behavior]

Without this, I'll assume [default behavior]. Let me know if that works.
```

### Trade-off Decision

```
There's a trade-off here:
- Option A: [faster/simpler] but [limitation]
- Option B: [more robust] but [cost]

Which priority should I optimize for?
```

---

## Batching Questions

Scope: Asking multiple questions efficiently

Rule: Group related questions in a single message. Never ask questions one at a time when they're related.

Correct:

```
Before implementing the user profile feature, I have a few questions:

1. **Scope**: Should profiles include social links, or just basic info?
2. **Privacy**: Should profiles be public by default or private?
3. **Images**: Should users upload avatars, or use Gravatar/GitHub?

I can proceed with sensible defaults if you prefer.
```

Incorrect:

```
Should profiles include social links?
[waits for response]
Should profiles be public by default?
[waits for response]
Should users upload avatars?
```

---

## Stating Assumptions

Scope: When proceeding without explicit confirmation

Rule: State assumptions clearly when proceeding without asking.

Correct:

```
I'll implement this with the following assumptions:
- Using the existing auth middleware pattern
- Returning 404 for missing resources (not empty response)
- Adding validation matching existing forms

Let me know if any of these should be different.
```

Incorrect:

```
I'll just implement it how I think is best.
```

---

## Anti-Patterns to Avoid

Scope: Common mistakes in requirement clarification

### Over-Asking

Rule: Don't ask about trivial decisions or things covered by codebase patterns.

Incorrect:

```
Should I use camelCase or snake_case for variables?
Should I add comments to this function?
What indentation should I use?
```

These are covered by existing code style and linting rules.

### Under-Asking

Rule: Don't assume critical business logic without verification.

Incorrect:

```
*Implements delete as soft-delete without asking*
*Assumes admin-only access without verification*
*Picks one of several valid database schemas*
```

### Vague Questions

Rule: Ask specific, actionable questions.

Incorrect:

```
How should this work?
What do you want me to do?
Is this okay?
```

Correct:

```
Should the delete action require confirmation, or delete immediately?
When a user is deactivated, should their posts remain visible or be hidden?
```

### Asking After Implementation

Rule: Clarify before writing code, not after.

Incorrect:

```
*Writes 200 lines of code*
By the way, should I have used approach A instead of B?
```

Correct:

```
Before I implement this, should I use approach A (faster) or B (more flexible)?
```

---

## Context-Aware Clarification

Scope: Adjusting questions based on context

Rule: Consider the user's expertise and project phase.

**For New Projects:**

- Ask more about architecture and patterns
- Clarify technology choices early
- Establish conventions before building

**For Existing Codebases:**

- Follow established patterns unless asked otherwise
- Ask only when deviating from patterns
- Reference existing code: "I'll follow the pattern in user-service.ts"

**For Quick Fixes:**

- Minimal questions, state assumptions
- Focus on correctness over perfection
- "I'll fix this the simplest way unless you need something specific"

**For Major Features:**

- More thorough clarification warranted
- Break into phases if scope is large
- "Let's align on the approach before I implement all of this"

---

## Using AskUserQuestion Tool

Scope: When to use the structured question tool

Rule: Use AskUserQuestion for decisions with discrete options.

Correct Usage:

```
AskUserQuestion with:
- header: "Auth method"
- question: "Which authentication approach should I use?"
- options:
  - "JWT tokens (Recommended)" - Standard, stateless
  - "Session cookies" - Better for SSR
  - "OAuth only" - Delegate to providers
```

When NOT to Use:

- Open-ended questions requiring explanation
- Questions needing code examples in the answer
- Trivial yes/no confirmations

---

## Examples

### Good Clarification

User: "Add a delete button to the dashboard"

Response:

```
Before adding the delete button, I want to clarify:

1. **What gets deleted?** The dashboard itself, or items within it?
2. **Confirmation?** Should it show a confirmation dialog?
3. **Permissions?** Should any user delete, or only owners/admins?

I'll add a delete button for dashboard items with confirmation dialog,
owner-only access, following the existing button patterns. Let me know
if you need something different.
```

### Good Assumption Statement

User: "Fix the login bug"

Response:

```
I found the issue - the session token isn't being refreshed properly.
I'll fix it by:
- Adding token refresh before expiry (5 min buffer)
- Keeping the existing localStorage approach
- Adding error handling for refresh failures

Proceeding with this fix now.
```
