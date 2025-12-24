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
