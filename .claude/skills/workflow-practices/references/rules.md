# Workflow Practices - Detailed Rules

## Standard Workflow

Scope: All development tasks

Rule: Follow a consistent workflow for task
execution.

**Workflow Steps:**

1. Read the codebase for relevant files
2. Create a todo list with actionable items
3. Check plan with user before executing
4. Execute todo items, marking complete as you go

---

## Never Revert User Changes

Scope: All code modifications

Rule: NEVER revert, undo, or overwrite code that
user intentionally wrote.

**Critical Rules:**

- NEVER revert, undo, or overwrite code that user intentionally wrote
- NEVER pull code from git history or previous versions
- ALWAYS work with current state of files as they exist
- ALWAYS respect user's architectural decisions and naming choices
- If user has removed code, do NOT add it back
- If user has renamed fields, do NOT change them back
- Work WITH user changes, not against them

Correct:

```
User removes a function -> Do not add it back
User renames a variable -> Use the new name
User changes architecture -> Follow the new pattern
```

Incorrect:

```
User removes a function -> "I noticed this was deleted, let me restore it"
User renames userId to id -> "I'll change this back to userId for consistency"
```

---

## Never Use Git to Revert File Contents

Scope: All code modifications

Rule: NEVER use `git checkout`, `git restore`, or any git command to revert
file contents. Parallel tasks run with parallel agents, so git-based reverting
can destroy work from other agents. Always undo changes using Edit operations.

**Critical Rules:**

- NEVER use `git checkout -- <file>` to revert changes
- NEVER use `git restore <file>` to revert changes
- NEVER use `git stash` to discard or shelve changes
- If you need to undo edits you just made, use the Edit tool to manually revert
  each change
- This protects parallel agent workflows from losing each other's work

Correct:

```
# Undo a change you just made using Edit tool
Edit: old_string="new code" new_string="original code"
```

Incorrect:

```
git checkout -- path/to/file
git restore path/to/file
git checkout HEAD -- path/to/file
```

---

## Git Commit Policy

Scope: Version control

Rule: Do NOT create git commits unless explicitly
requested by user.

Correct:

```
User: "Please commit these changes"
-> Create commit with descriptive message

User: "Fix this bug"
-> Fix the bug, do NOT commit
```

Incorrect:

```
User: "Fix this bug"
-> Fix the bug AND create a commit without asking
```

---

## Code Quality Principles

Scope: All code changes

Rule: Write complete, correct, readable code.

**Requirements:**

- Follow user requirements carefully and to the letter
- Think step-by-step, describe plan in detail before implementing
- Write correct, idiomatic, bug-free, fully functional code
- Focus on readable code over premature optimization
- Fully implement all requested functionality (NO todos, placeholders, or
  missing pieces)
- Include all required imports and proper naming
- Be concise, minimize prose
- If uncertain about correctness or don't know the answer, say so

Correct:

```typescript
// Complete implementation with all edge cases
function processOrder(order: Order): Result {
  if (!order.items.length) {
    return { success: false, error: "Empty order" };
  }

  const total = order.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  const tax = total * order.taxRate;

  return {
    success: true,
    total: total + tax,
    breakdown: { subtotal: total, tax },
  };
}
```

Incorrect:

```typescript
function processOrder(order: Order): Result {
  // TODO: implement validation
  // TODO: calculate tax
  return { success: true, total: 0 }; // Placeholder
}
```

---

## Tooling Preferences

Scope: Project tooling

Rule: Never change native tooling without explicit
permission.

**General Rule:**

- Don't replace native tooling (Node.js, Deno, Go, Make) with alternatives
- Respect the project's architectural decisions about tooling
- Ask before changing any tool commands
- Each service has its own tooling philosophy - honor it

Correct:

```
Project uses Make -> Use make commands
Project uses Deno -> Use deno commands
Project uses npm scripts -> Use `node --run` commands
```

Incorrect:

```
Project uses Make -> "Let me replace this with a shell script"
Project uses Deno -> "Let me add npm for this task"
```

---

## Handling Uncertainty

Scope: All situations with incomplete information

Rule: When uncertain, ask or
state the uncertainty. Never guess.

Correct:

```
"I'm not certain about the expected behavior in this edge case.
Should the function return null or throw an error?"

"I don't know the answer to that specific API behavior.
Let me check the documentation."
```

Incorrect:

```
// Making assumptions without stating them
function handleEdgeCase() {
  return null;  // Guessed behavior
}
```

---

## Implementation Completeness

Scope: All feature implementations

Rule: Fully implement all requested
functionality. No partial implementations.

**Checklist:**

- [ ] All requested features implemented
- [ ] All edge cases handled
- [ ] All imports included
- [ ] All types properly defined
- [ ] Error handling complete
- [ ] No TODO comments for required functionality
- [ ] No placeholder values
- [ ] No "implement later" notes

Correct:

```typescript
// Feature: User registration with email validation

import { z } from "zod";
import { hash } from "bcrypt";
import { db } from "./database.ts";

const UserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
});

export async function registerUser(input: unknown): Promise<User> {
  const validated = UserSchema.parse(input);

  const existingUser = await db.user.findByEmail(validated.email);
  if (existingUser) {
    throw new Error("Email already registered");
  }

  const hashedPassword = await hash(validated.password, 10);

  return db.user.create({
    email: validated.email,
    password: hashedPassword,
    name: validated.name,
  });
}
```

Incorrect:

```typescript
// Incomplete implementation
export async function registerUser(input: any) {
  // TODO: add validation
  // TODO: check for existing user
  return db.user.create(input);
}
```

---

## Quality Gates (MANDATORY)

Scope: All code changes

Rule: ALWAYS run tests and linters when making changes. Fix linter errors
immediately. Never commit without passing all quality gates.

**Before Committing Checklist:**

- [ ] All linters pass (`deno lint`, `make lint`)
- [ ] All formatters pass (`deno fmt --check`, `make fix`)
- [ ] TypeScript compilation successful
- [ ] All tests pass (unit + integration)
- [ ] No TODO comments or placeholders left
- [ ] Endpoints tested with curl/manual testing

**Frontend Quality Gates:**

```bash
# In /apps/webclient directory
deno task lint         # Run Deno linter
deno fmt --check       # Check formatting
deno task build        # Build for production
```

**Backend Quality Gates:**

```bash
# In /apps/services directory
make check            # Run static analysis tools
make lint             # Run linting
make fix              # Fix formatting and linting issues
make test             # Run tests
```

**Root Quality Gates:**

```bash
# In monorepo root
make ok               # Run all quality checks
```

Correct:

```bash
# Full quality check before committing
make lint && make test && make check
```

Incorrect:

```bash
# Skipping quality gates
git add . && git commit -m "Quick fix"
```

---

## Testing Requirements

Scope: All code changes

Rule: Business logic MUST have unit tests. Adapters should have integration
tests. Use dependency injection for testable code.

**Test Structure:**

- Unit tests: Test business logic with mock adapters
- Integration tests: Test adapters with real dependencies
- Test files co-located with `_test` suffix (Go) or `.test.ts` (JS/TS)

Correct:

```go
// profiles_test.go - Unit test with mock
type mockRepository struct{}

func (m *mockRepository) GetProfile(ctx context.Context, id string) (*Profile, error) {
    return &Profile{ID: id, Title: "Test"}, nil
}

func TestProfileService_GetProfile(t *testing.T) {
    service := &Service{repo: &mockRepository{}}
    profile, err := service.GetProfile(context.Background(), "test-id")
    // Assert results
}
```

```typescript
// user-service.test.ts - Unit test with mock
const mockRepo = {
  findUser: async (id: string) => ({ id, name: "Test" }),
};

Deno.test("UserService.getUser - returns user", async () => {
  const service = new UserService(mockRepo);
  const user = await service.getUser("test-id");
  assertEquals(user.name, "Test");
});
```

Incorrect:

```typescript
// No tests for business logic
export function calculateDiscount(price: number, percent: number): number {
  return price * (1 - percent / 100);
}
```

---

## Avoid Over-Engineering

Scope: All code changes

Rule: Only make changes that are directly requested or clearly necessary. Keep
solutions simple and focused.

**Anti-patterns to Avoid:**

- Don't add features beyond what was asked
- Don't refactor code that wasn't part of the request
- Don't add docstrings/comments to unchanged code
- Don't add error handling for scenarios that can't happen
- Don't create abstractions for one-time operations
- Don't design for hypothetical future requirements

Correct:

```typescript
// User asked: "Fix the null check in getUserName"
function getUserName(user: User | null): string {
  if (user === null) {
    return "Unknown";
  }
  return user.name;
}
```

Incorrect:

```typescript
// User asked: "Fix the null check in getUserName"
// But developer added unnecessary complexity

/** Gets the user's display name with fallback support */
type GetUserNameOptions = {
  fallback?: string;
  includeTitle?: boolean;
};

function getUserName(user: User | null, options: GetUserNameOptions = {}): string {
  const { fallback = "Unknown", includeTitle = false } = options;
  if (user === null) {
    return fallback;
  }
  return includeTitle && user.title
    ? `${user.title} ${user.name}`
    : user.name;
}
```

**Guidelines:**

- Three similar lines of code is better than a premature abstraction
- A bug fix doesn't need surrounding code cleaned up
- A simple feature doesn't need extra configurability
- Trust internal code and framework guarantees
