# Coding Practices - Detailed Rules

## Self-Documenting Code

Scope: All languages

Rule: Use meaningful variable, class, and function names. Makes code easier to
understand and maintain.

Correct:

```typescript
function calculateTotalPrice(items: Item[], taxRate: number): number {
  const subtotal = items.reduce((sum, item) => sum + item.price, 0);
  const tax = subtotal * taxRate;
  return subtotal + tax;
}

class UserAuthenticationService {
  async validateCredentials(
    username: string,
    password: string,
  ): Promise<boolean> {}
}
```

Incorrect:

```typescript
function calc(arr: Item[], r: number): number {
  const s = arr.reduce((a, b) => a + b.price, 0); // what is s?
  const t = s * r; // what is t?
  return s + t;
}

class UAS { // unclear abbreviation
  async validate(u: string, p: string): Promise<boolean> {} // u? p?
}
```

---

## Comments

Scope: All languages

Rule: Use comments to explain 'why' and 'how' if code is not self-explanatory.

Correct:

```typescript
// Use binary search because dataset can be very large (10M+ items)
// Linear search would be O(n), binary search is O(log n)
function findUser(users: User[], id: string): User | null {
  // Binary search implementation
}

// Cache results for 5 minutes to reduce database load
// Trade-off: slight staleness for better performance
const cache = new Map<string, CachedValue>();
```

Incorrect:

```typescript
// This function finds a user
function findUser(users: User[], id: string): User | null { // redundant comment
}

const x = 5 * 60 * 1000; // no explanation of why this specific value
```

Good practices:

- Explain why, not what (code shows what)
- Document trade-offs and decisions
- Explain non-obvious algorithms or optimizations
- Note important constraints or assumptions

---

## Don't Repeat Yourself

Scope: All languages

Rule: Abstract common functionality into reusable modules or functions.

Correct:

```typescript
function formatUserName(user: User): string {
  return `${user.firstName} ${user.lastName}`;
}

function displayWelcome(user: User) {
  console.log(`Welcome, ${formatUserName(user)}`);
}

function sendEmail(user: User) {
  email.send(`Hello ${formatUserName(user)}`);
}
```

Incorrect:

```typescript
function displayWelcome(user: User) {
  console.log(`Welcome, ${user.firstName} ${user.lastName}`); // duplicated
}

function sendEmail(user: User) {
  email.send(`Hello ${user.firstName} ${user.lastName}`); // duplicated
}
```

When to abstract:

- Used 3+ times: definitely abstract
- Used 2 times: consider abstracting if logic is complex
- Used 1 time: keep inline unless it improves clarity

---

## Input Validation

Scope: All languages

Rule: Validate input data. Ensures robustness and prevents bugs or security
vulnerabilities.

Correct:

```typescript
function createUser(email: string, age: number): User {
  if (!email.includes("@")) throw new Error("Invalid email");
  if (age < 0 || age > 150) throw new Error("Invalid age");
  return { email, age };
}
```

Incorrect:

```typescript
function createUser(email: string, age: number): User {
  return { email, age }; // no validation
}
```

---

## Error Handling

Scope: All languages

Rule: Handle all possible error cases. Ensures graceful recovery and better
user experience.

Correct:

```typescript
async function fetchUser(id: string): Promise<User | null> {
  try {
    const response = await fetch(`/api/users/${id}`);
    if (!response.ok) return null;
    return await response.json();
  } catch (error) {
    console.error("Failed to fetch user", error);
    return null;
  }
}
```

Incorrect:

```typescript
async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${id}`); // unhandled
  return await response.json();
}
```

---

## Error Objects

Scope: All languages

Rule: Use proper error objects. Include context via
properties/cause. Avoid string concatenation in messages.

Correct:

```typescript
throw new Error("Failed to process payment", {
  cause: { userId, amount, reason: "Insufficient funds" },
});

try {
  processPayment(data);
} catch (error) {
  throw new Error("Payment processing failed", { cause: error });
}
```

Incorrect:

```typescript
throw new Error("Failed for user " + userId + " amount " + amount);
throw "Payment failed"; // not an Error object
```

---

## Specific Error Types

Scope: All languages

Rule: Throw specific error types, not generic errors.
Provides better context.

Correct:

```typescript
class ValidationError extends Error {
  constructor(message: string, public field: string) {
    super(message);
    this.name = "ValidationError";
  }
}

throw new ValidationError("Invalid email", "email");
```

Incorrect:

```typescript
throw new Error("Something went wrong"); // too generic
```

---

## Result Objects

Scope: All languages

Rule: Consider result objects instead of throwing errors.
More predictable.

Correct:

```typescript
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

function parseData(input: string): Result<Data, string> {
  if (!input) return { ok: false, error: "Empty input" };
  try {
    return { ok: true, value: JSON.parse(input) };
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }
}

const result = parseData(input);
if (result.ok) {
  process(result.value);
}
```

---

## Ignored Errors

Scope: All languages

Rule: Never ignore returned errors. Handle appropriately.

Correct:

```typescript
try {
  await saveToDatabase(data);
} catch (error) {
  console.error("Failed to save", error);
  throw new Error("Database operation failed", { cause: error });
}
```

Incorrect:

```typescript
try {
  await saveToDatabase(data);
} catch (error) {
  // ignored
}
```

---

## Assertions

Scope: All languages

Rule: Use assertions to verify pre/post-conditions and
invariants. Documents assumptions.

Correct:

```typescript
function divide(a: number, b: number): number {
  console.assert(b !== 0, "Divisor must not be zero");
  console.assert(Number.isFinite(a), "Dividend must be finite");
  return a / b;
}
```

---

## Logging

Scope: All languages

Rule: Use logging for tracing and debugging. Helps
understand program flow.

Correct:

```typescript
function processOrder(order: Order) {
  console.log("Processing order", { orderId: order.id });
  try {
    const result = validateOrder(order);
    console.log("Order validated", { orderId: order.id });
    return result;
  } catch (error) {
    console.error("Validation failed", { orderId: order.id, error });
    throw error;
  }
}
```

---

## Circular Dependencies

Scope: All languages

Rule: Avoid circular dependencies. Leads to unexpected
behavior.

Incorrect:

```typescript
// file-a.ts
import { funcB } from "./file-b.ts";
export function funcA() {
  funcB();
}

// file-b.ts
import { funcA } from "./file-a.ts"; // circular
export function funcB() {
  funcA();
}
```

---

## Magic Values

Scope: All languages

Rule: Avoid magic numbers or strings. Use named constants.

Correct:

```typescript
const MAX_RETRIES = 3;
const API_TIMEOUT_MS = 5000;

if (retries >= MAX_RETRIES) {}
setTimeout(callback, API_TIMEOUT_MS);
```

Incorrect:

```typescript
if (retries >= 3) {} // what is 3?
setTimeout(callback, 5000); // what is 5000?
```

---

## Structured Logging

Scope: All logging statements

Rule: Use appropriate log levels by layer and
include correlation context.

**Layer Guidelines:**

- Repository/data layer: Only `warn`, `debug`, `trace` levels
- Service/business layer: Log successful operations at `info` level
- Always include context (trace IDs, user IDs, operation IDs)
- Log errors with full context before propagating

Correct:

```typescript
// Service layer - info for successful operations
logger.info("user created", { userId, traceId, operation: "createUser" });

// Repository layer - debug for data operations
logger.debug("fetching user from db", { userId, traceId });

// Error with full context
logger.error("failed to create user", {
  userId,
  traceId,
  error: err.message,
  stack: err.stack,
});
throw err;
```

Incorrect:

```typescript
console.log("user created"); // no structure, no context
logger.info("db query executed"); // wrong level for repository layer
logger.error("error"); // no context
```

---

## Error Wrapping

Scope: All error handling

Rule: Wrap errors with context for traceability.
Define domain-specific error types.

Correct:

```typescript
class UserNotFoundError extends Error {
  constructor(public userId: string) {
    super(`User not found: ${userId}`);
    this.name = "UserNotFoundError";
  }
}

class PaymentError extends Error {
  constructor(
    message: string,
    public transactionId: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PaymentError";
  }
}

// Wrap with cause for traceability
try {
  await processPayment(data);
} catch (error) {
  throw new PaymentError("Failed to process payment", txId, { cause: error });
}
```

Incorrect:

```typescript
throw new Error("Something went wrong"); // no context
throw originalError; // no wrapping, loses context
throw new Error(originalError.message); // loses stack trace
```

---

## Explicit Checks (CRITICAL)

Scope: All languages

Rule: NEVER use implicit/truthy/falsy checks except for boolean values. Always
use explicit comparisons for null, undefined, empty strings, and zero values.

Correct:

```typescript
// Explicit null/undefined checks
if (value === null) {}
if (value !== undefined) {}

// Explicit string checks
if (string === "") {}
if (string.length === 0) {}

// Explicit array checks
if (array.length === 0) {}
if (items.length > 0) {}

// Explicit number checks
if (count === 0) {}
if (index !== -1) {}

// Boolean values can use implicit checks
if (!response.ok) {}
if (isValid) {}
if (user.isActive) {}

// Ternary with explicit checks
const result = value !== null ? value : defaultValue;
```

Incorrect:

```typescript
// ❌ Implicit truthy/falsy checks
if (!value) {}           // Fails for 0, "", false
if (!string) {}          // Fails for ""
if (!array.length) {}    // Fails for 0
if (user) {}             // Ambiguous

// ❌ Implicit ternary
const result = value || defaultValue;  // Fails if value is 0 or ""
```

**Why This Matters:**

- `0`, `""`, `false`, `null`, `undefined` are all falsy in JavaScript
- Implicit checks can cause subtle bugs when these are valid values
- Explicit checks document intent and prevent ambiguity
- Makes code review easier - intent is clear

---

## Identity Comparison

Scope: All languages

Rule: Always compare entities by their stable unique identifiers (IDs), never by
display strings like slugs, usernames, emails, or titles. Strings are mutable,
can be duplicated, and may have formatting differences (whitespace, casing).
IDs are immutable and guaranteed unique.

Correct:

```typescript
// Compare by ID — stable and unambiguous
const isAuthorProfile = story.author_profile?.id === profile.id;
const isSameUser = comment.user_id === currentUser.id;
const isOwnProfile = membership.profile_id === userProfile.id;
```

```go
// Go — same principle
if story.AuthorProfileID == profile.ID {
    // author's own profile
}
```

Incorrect:

```typescript
// ❌ Comparing by slug — can change, may have formatting issues
const isAuthorProfile = story.author_profile?.slug === slug;

// ❌ Comparing by username — can change, case-sensitive issues
const isSameUser = comment.username === currentUser.username;

// ❌ Comparing by email — can change, normalization issues
const isOwner = member.email === user.email;
```

**Why This Matters:**

- Slugs, usernames, and emails can be renamed or reformatted
- String comparisons are vulnerable to whitespace, casing, and encoding issues
- IDs are immutable, unique, and indexed for performance
- Using IDs makes refactoring safer — renaming a slug won't break logic

---

## Early Returns

Scope: All languages

Rule: Use early returns to reduce nesting and improve readability. Handle error
cases first, then proceed with the happy path.

Correct:

```typescript
function processUser(user: User | null): Result {
  if (user === null) {
    return { error: "User not found" };
  }

  if (!user.isActive) {
    return { error: "User is inactive" };
  }

  // Happy path - no nesting
  const profile = loadProfile(user.id);
  return { data: profile };
}
```

Incorrect:

```typescript
function processUser(user: User | null): Result {
  if (user !== null) {
    if (user.isActive) {
      const profile = loadProfile(user.id);
      return { data: profile };
    } else {
      return { error: "User is inactive" };
    }
  } else {
    return { error: "User not found" };
  }
}
```

**Benefits:**

- Reduces cognitive load from nested conditionals
- Error handling is visible at the top
- Main logic flows naturally without indentation
- Easier to add new validation checks
