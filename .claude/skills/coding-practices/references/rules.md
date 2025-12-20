# Coding Practices - Detailed Rules

## Self-Documenting Code

Scope: All languages Rule: Use meaningful variable, class, and function names.
Makes code easier to understand and maintain.

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

Scope: All languages Rule: Use comments to explain 'why' and 'how' if code is
not self-explanatory.

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

Scope: All languages Rule: Abstract common functionality into reusable modules
or functions.

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

Scope: All languages Rule: Validate input data. Ensures robustness and prevents
bugs or security vulnerabilities.

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

Scope: All languages Rule: Handle all possible error cases. Ensures graceful
recovery and better user experience.

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

Scope: All languages Rule: Use proper error objects. Include context via
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

## Custom Error Classes (IO/Resource Errors)

Scope: JS/TS Rule: Use custom Error classes with ES2022 `cause` property for
IO/resource errors only. These are situations where something is genuinely
broken and operation must abort (network failures, database connection errors,
file system errors).

Correct:

```typescript
class DbConnectionError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "DbConnectionError";
  }
}

// Usage with cause chaining for IO errors
try {
  await connectToDatabase();
} catch (originalError) {
  throw new DbConnectionError(
    "Failed to connect to database",
    "DB_CONNECTION_FAILED",
    { cause: originalError },
  );
}
```

When to use Error classes:

- Network connection failures
- Database connection errors
- File system errors (permission denied, disk full)
- External service unavailable

When NOT to use Error classes:

- User not found (expected application state)
- Validation failures (expected input handling)
- Business rule violations (normal flow control)

---

## Result Pattern (Application/Business Logic)

Scope: JS/TS Rule: Use Result pattern for application logic and business errors.
Forces explicit handling of both success and failure cases.

Correct:

```typescript
type Result<T, E = Error> =
  | { ok: true; value: T }
  | { ok: false; error: E };

class ParseError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ParseError";
  }
}

function parseConfig(raw: string): Result<Config, ParseError> {
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (e) {
    return { ok: false, error: new ParseError("Invalid JSON", { cause: e }) };
  }
}

// Forces you to handle both cases
const result = parseConfig(input);
if (!result.ok) {
  console.error(result.error.message);
  return;
}
// result.value is now typed as Config

function findUser(id: string): Result<User, "NOT_FOUND"> {
  const user = users.get(id);
  if (!user) return { ok: false, error: "NOT_FOUND" };
  return { ok: true, value: user };
}
```

When to use Result pattern:

- User/entity not found
- Validation failures
- Parsing errors
- Business rule violations
- Any expected failure that's part of normal application flow

---

## Ignored Errors

Scope: All languages Rule: Never ignore returned errors. Handle appropriately.

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

Scope: All languages Rule: Use assertions to verify pre/post-conditions and
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

Scope: All languages Rule: Use logging for tracing and debugging. Helps
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

Scope: All languages Rule: Avoid circular dependencies. Leads to unexpected
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

Scope: All languages Rule: Avoid magic numbers or strings. Use named constants.

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

## Resource Cleanup

Scope: All languages Rule: Use try/finally for resource cleanup. Ensures
resources are released even when errors occur.

Correct:

```typescript
const lock = await mutex.acquire();
try {
  await performCriticalOperation();
} finally {
  lock.release();
}

const file = await Deno.open("data.txt");
try {
  await processFile(file);
} finally {
  file.close();
}
```

Incorrect:

```typescript
const lock = await mutex.acquire();
await performCriticalOperation();
lock.release(); // never reached if operation throws
```

---

## File Organization Order

Scope: JS/TS Rule: Organize file contents in consistent order: Types/Interfaces
→ Constants → Helper functions → Main implementation → Exports.

Correct:

```typescript
// 1. Types and interfaces
type UserData = {
  id: string;
  name: string;
};

// 2. Constants
const DEFAULT_TIMEOUT = 5000;
const MAX_RETRIES = 3;

// 3. Helper functions (private/internal)
const validateInput = (data: UserData): boolean => {
  return data.id.length > 0;
};

// 4. Main implementation
export const createUser = (data: UserData): User => {
  if (!validateInput(data)) {
    throw new Error("Invalid input");
  }
  return new User(data);
};

// 5. Additional exports at end if needed
export { UserData };
```

Incorrect:

```typescript
export const createUser = () => {}; // export before types
const helper = () => {}; // helper after export
type UserData = {}; // type after implementation
const CONSTANT = 5; // constant mixed in
```
