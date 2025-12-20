# Code Design Principles - Detailed Rules

## Pure Functions

Scope: All languages Rule: Prefer pure (stateless) functions over stateful ones.
Easier to reason about, test, and reuse.

Correct:

```typescript
function calculateTotal(items: Item[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

function formatDate(date: Date): string {
  return date.toISOString();
}
```

Incorrect:

```typescript
let total = 0;
function addToTotal(item: Item) { // modifies external state
  total += item.price;
}
```

---

## Immutability

Scope: All languages Rule: Prefer immutable data structures. Prevents unintended
side effects.

Correct:

```typescript
const user = { name: "John", age: 30 };
const updatedUser = { ...user, age: 31 }; // new object

const items = [1, 2, 3];
const newItems = [...items, 4]; // new array
const filtered = items.filter((x) => x > 1); // new array
```

Incorrect:

```typescript
const user = { name: "John", age: 30 };
user.age = 31; // mutation

const items = [1, 2, 3];
items.push(4); // mutation
```

---

## Single Responsibility

Scope: All languages Rule: Keep functions short and focused on single task.
Easier to understand, test, and reuse.

Correct:

```typescript
function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function sendWelcomeEmail(email: string): void {
  const message = createWelcomeMessage();
  sendEmail(email, message);
}
```

Incorrect:

```typescript
function processUser(email: string, data: UserData): void {
  // validates email
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  // saves to database
  database.save(data);
  // sends email
  const message = "Welcome!";
  sendEmail(email, message);
  // logs activity
  console.log("User processed");
}
```

---

## Early Returns

Scope: All languages Rule: Use early returns. Reduces nesting and improves
readability.

Correct:

```typescript
function processPayment(amount: number, balance: number): boolean {
  if (amount <= 0) return false;
  if (balance < amount) return false;
  if (!isValidTransaction(amount)) return false;

  deductBalance(amount);
  return true;
}
```

Incorrect:

```typescript
function processPayment(amount: number, balance: number): boolean {
  if (amount > 0) {
    if (balance >= amount) {
      if (isValidTransaction(amount)) {
        deductBalance(amount);
        return true;
      }
    }
  }
  return false;
}
```

---

## Composition Over Inheritance

Scope: All languages Rule: Prefer composition over inheritance. More flexible
and decoupled.

Correct:

```typescript
interface Logger {
  log(message: string): void;
}

class UserService {
  constructor(private logger: Logger) {}

  createUser(data: UserData) {
    this.logger.log("Creating user");
  }
}
```

Incorrect:

```typescript
class BaseService {
  log(message: string) {}
}

class UserService extends BaseService { // tight coupling
  createUser(data: UserData) {
    this.log("Creating user");
  }
}
```

---

## Async Patterns

Scope: JS/TS Rule: Prefer promises over callbacks. Cleaner and more
maintainable.

Correct:

```typescript
async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
}

function loadData(): Promise<Data> {
  return fetch("/api/data").then((r) => r.json());
}
```

Incorrect:

```typescript
function fetchUser(id: string, callback: (user: User) => void) {
  fetch(`/api/users/${id}`).then((r) => r.json()).then(callback);
}
```

---

## String Formatting

Scope: JS/TS Rule: Prefer template strings over concatenation. More readable,
allows embedded expressions.

Correct:

```typescript
const greeting = `Hello, ${user.name}!`;
const url = `/api/users/${userId}/posts/${postId}`;
const multiline = `
  Line 1
  Line 2
`;
```

Incorrect:

```typescript
const greeting = "Hello, " + user.name + "!";
const url = "/api/users/" + userId + "/posts/" + postId;
```

---

## Loop Control Flow

Scope: All languages Rule: Use plain for loops when break/continue needed.

Correct:

```typescript
for (const item of items) {
  if (item.skip) continue;
  if (item.error) break;
  process(item);
}
```

Use array methods when no break/continue needed:

```typescript
const processed = items
  .filter((item) => !item.skip)
  .map((item) => process(item));
```

---

## Global Variables

Scope: All languages Rule: Avoid global variables. Lead to unintended side
effects.

Correct:

```typescript
export function createConfig(env: string) {
  return { apiUrl: env === "prod" ? "api.prod" : "api.dev" };
}

class AppState {
  constructor(private config: Config) {}
}
```

Incorrect:

```typescript
let globalConfig = {}; // global mutable state
let currentUser = null; // global mutable state

export function setConfig(config: Config) {
  globalConfig = config;
}
```

---

## Class Design

Scope: All languages Rule: Separate data and methods. Use plain objects for
data, classes only for stateful services.

Plain objects (records):

```typescript
interface User {
  id: string;
  name: string;
  email: string;
}

function createUser(name: string, email: string): User {
  return { id: generateId(), name, email };
}
```

Functions for behavior:

```typescript
function validateUser(user: User): boolean {
  return user.email.includes("@");
}
```

Classes for stateful services:

```typescript
class UserRepository {
  private cache = new Map<string, User>();

  async getUser(id: string): Promise<User> {
    if (this.cache.has(id)) return this.cache.get(id)!;
    const user = await this.fetchUser(id);
    this.cache.set(id, user);
    return user;
  }
}
```

---

## Side Effects

Scope: All languages Rule: Avoid side effects in non-pure functions. Store state
closest to where used.

Correct:

```typescript
function calculateDiscount(price: number, discountRate: number): number {
  return price * (1 - discountRate);
}

function processOrder(order: Order) {
  const discount = calculateDiscount(order.total, 0.1);
  const finalPrice = order.total - discount;
  return { ...order, finalPrice };
}
```

Incorrect:

```typescript
let appliedDiscount = 0; // external state

function calculateDiscount(price: number, rate: number): number {
  appliedDiscount = price * rate; // side effect
  return price * (1 - rate);
}
```

---

## Getters/Setters

Scope: All languages Rule: Avoid getter/setters. Can lead to unexpected side
effects.

Correct:

```typescript
interface User {
  readonly name: string;
  readonly email: string;
}

function updateUserEmail(user: User, email: string): User {
  return { ...user, email };
}
```

Incorrect:

```typescript
class User {
  private _email: string;

  get email(): string {
    this.logAccess(); // unexpected side effect
    return this._email;
  }

  set email(value: string) {
    this.validateEmail(value); // side effect
    this._email = value;
  }
}
```

---

## State Factory Pattern

Scope: JS/TS Rule: Use `createXState()` factory functions that return class
instances. Combines factory flexibility with class encapsulation.

Correct:

```typescript
type WriterState = {
  buffer: string[];
  locked: boolean;
};

class Writer {
  constructor(private state: WriterState) {}

  write(text: string): void {
    this.state.buffer.push(text);
  }

  flush(): string {
    const content = this.state.buffer.join("");
    this.state.buffer = [];
    return content;
  }
}

export const createWriterState = (): WriterState => ({
  buffer: [],
  locked: false,
});

export const createWriter = (state?: WriterState): Writer => {
  return new Writer(state ?? createWriterState());
};
```

Incorrect:

```typescript
// Direct class instantiation without factory
const writer = new Writer();

// Global state
let globalBuffer: string[] = [];
```

---

## Builder Pattern

Scope: JS/TS Rule: Use builder pattern with chainable methods returning `this`.
Enables fluent API design.

Correct:

```typescript
class QueryBuilder {
  private query: QueryOptions = {};

  select(fields: string[]): this {
    this.query.fields = fields;
    return this;
  }

  where(condition: string): this {
    this.query.where = condition;
    return this;
  }

  limit(count: number): this {
    this.query.limit = count;
    return this;
  }

  build(): Query {
    return new Query(this.query);
  }
}

// Usage
const query = new QueryBuilder()
  .select(["id", "name"])
  .where("active = true")
  .limit(10)
  .build();
```

Incorrect:

```typescript
class QueryBuilder {
  select(fields: string[]): void { // returns void, not chainable
    this.query.fields = fields;
  }
}

// Requires multiple statements
const builder = new QueryBuilder();
builder.select(["id", "name"]);
builder.where("active = true");
const query = builder.build();
```

---

## Registry Pattern

Scope: JS/TS Rule: Use Map-based registries for plugin/handler registration.
Provides type-safe, dynamic extension points.

Correct:

```typescript
type Handler<T> = (data: T) => Promise<void>;

class HandlerRegistry<T> {
  private handlers = new Map<string, Handler<T>>();

  register(name: string, handler: Handler<T>): void {
    if (this.handlers.has(name)) {
      throw new Error(`Handler "${name}" already registered`);
    }
    this.handlers.set(name, handler);
  }

  get(name: string): Handler<T> | undefined {
    return this.handlers.get(name);
  }

  has(name: string): boolean {
    return this.handlers.has(name);
  }

  all(): IterableIterator<[string, Handler<T>]> {
    return this.handlers.entries();
  }
}

// Usage
const eventHandlers = new HandlerRegistry<Event>();
eventHandlers.register("click", async (e) => {});
eventHandlers.register("submit", async (e) => {});
```

Incorrect:

```typescript
// Object-based (no type safety for values)
const handlers: Record<string, Function> = {};
handlers["click"] = () => {};

// Array-based (no name lookup)
const handlerList: Function[] = [];
handlerList.push(() => {});
```
