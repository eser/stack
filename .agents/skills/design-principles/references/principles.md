# Design Principles

How functions, modules, data and state are shaped in eserstack, in TypeScript
and Go. Architecture-level structure (ports, adapters, composition roots) is in
architecture-guidelines: Hexagonal Architecture (Double-Layered).

## Contents

- Pure Functions
- Immutability
- Small Interfaces
- Data as Plain Objects
- One Clock Read per Operation
- Cancellation Flows With the Work
- Choose Data Structures by Access Pattern
- Module-Level Side Effects

---

## Pure Functions

Scope: All languages

Rule: Put logic in pure functions that take everything they need as parameters
and return a result without touching outside state. Keep pure logic in modules
that do not import environment or framework state (env variables, build-tool
globals, UI context, process-wide singletons). When a module needs both, put the
logic in its own file with explicit parameters and let a thin wrapper inject the
configuration. A function that must have an effect keeps it at the edge: compute
first, then perform one effect with the result.

Correct:

```typescript
// discount.ts: pure, testable without setup
export function applyDiscount(order: Order, rate: number): Order {
  return { ...order, total: order.total * (1 - rate) };
}

// checkout.ts: thin wrapper that reads configuration and performs the effect
export async function checkout(order: Order, deps: CheckoutDeps) {
  const priced = applyDiscount(order, deps.config.discountRate);
  await deps.orders.save(priced);
}
```

Incorrect:

```typescript
let appliedDiscount = 0; // hidden state shared by every caller

export function applyDiscount(order: Order): Order {
  appliedDiscount = order.total * runtime.env.get("DISCOUNT_RATE"); // reads env
  return { ...order, total: order.total - appliedDiscount };
}
```

**Why:** a pure function is tested with plain values, and a change in the
environment cannot change its result.

---

## Immutability

Scope: All languages

Rule: Do not mutate inputs or shared data; return a new value. In TypeScript,
mark properties and array or object parameters that are not mutated as readonly
(`readonly T[]`, `Readonly<T>`, `as const` for literal tables), so the compiler
enforces it. Mutation of a local value that nobody else can see is fine.

Correct:

```typescript
export function addTag(
  session: Readonly<Session>,
  tag: string,
): Session {
  return { ...session, tags: [...session.tags, tag] };
}
```

Incorrect:

```typescript
export function addTag(session: Session, tag: string): Session {
  session.tags.push(tag); // the caller's object changes too
  return session;
}
```

**Why:** a caller that passed a value does not expect it to change; readonly
types turn that expectation into a compile error.

---

## Small Interfaces

Scope: Interfaces and the functions that accept them, in TypeScript and Go

Rule: Define small, purpose-specific interfaces, ideally in the package that
uses them. Public functions accept an interface, not a concrete type, so callers
can pass any implementation and tests can pass a fake. Pass dependencies in
(parameters, a deps object, a constructor) instead of inheriting behavior from a
base class. Do not add a wrapper that only forwards to another method; call the
method directly.

Correct:

```typescript
type Clock = { now(): number };

export function isExpired(session: Session, clock: Clock): boolean {
  return session.expiresAt <= clock.now();
}
```

```go
type SessionReader interface {
    Get(ctx context.Context, id string) (*Session, error)
}

func Summarize(ctx context.Context, r SessionReader, id string) (Summary, error)
```

Incorrect:

```go
type EverythingStore interface {
    Read() error
    Write() error
    Delete() error
    Update() error
    Migrate() error // every caller depends on all of it
}
```

**Why:** a small interface is cheap to fake in a test and leaves each caller
coupled only to what it uses.

---

## Data as Plain Objects

Scope: TypeScript types and classes

Rule: Model data as plain objects with `readonly` fields and put behavior in
functions that take them. Use a class only for a stateful service that owns
resources or a cache. Do not use getters or setters: a property access that runs
code (logging, validation, lazy loading) surprises the caller. An update is a
function that returns a new object.

Correct:

```typescript
type User = { readonly id: string; readonly email: string };

export function changeEmail(user: User, email: string): User {
  return { ...user, email };
}

export class SessionRegistry {
  readonly #sessions = new Map<string, Session>();
  // ...
}
```

Incorrect:

```typescript
class User {
  #email = "";
  get email(): string {
    this.logAccess(); // a read with a side effect
    return this.#email;
  }
}
```

**Why:** plain data serializes, compares and copies without surprises; state
belongs in the few objects that manage it.

---

## One Clock Read per Operation

Scope: Code that timestamps or compares times

Rule: Read the clock once per logical operation and pass the value down. Do not
call `new Date()`, `Date.now()` or `time.Now()` inside a loop or in several
steps that must agree on the same time. Taking the clock as a parameter also
makes the code testable.

Correct:

```typescript
const now = Date.now();
const expired = sessions.filter((s) => s.expiresAt <= now);
```

Incorrect:

```typescript
const expired = sessions.filter((s) => s.expiresAt <= Date.now());
```

**Why:** two reads in one operation can straddle a boundary and give the steps
different answers about the same moment.

---

## Cancellation Flows With the Work

Scope: Any operation that can be abandoned: requests, CLI commands, daemon RPCs,
background jobs, in TypeScript and Go

Rule: An operation carries one cancellation handle from the point it starts to
every call it makes: a `context.Context` in Go, an `AbortSignal` in TypeScript.
Pass the caller's handle down instead of creating a new one, so when the caller
gives up (a client disconnects, a user presses Ctrl-C, a deadline passes)
everything the operation started stops. A step may shorten the remaining time
for its own part, never extend it. Work that must finish after the caller leaves
is detached on purpose, gets its own time limit and an owner that reports its
failure.

Correct:

```typescript
export async function syncAll(
  projects: readonly Project[],
  signal: AbortSignal,
): Promise<void> {
  for (const project of projects) {
    signal.throwIfAborted();
    await syncOne(
      project,
      AbortSignal.any([signal, AbortSignal.timeout(30_000)]),
    );
  }
}
```

```go
func SyncAll(ctx context.Context, projects []Project) error {
    for _, p := range projects {
        if err := syncOne(ctx, p); err != nil {
            return fmt.Errorf("sync %s: %w", p.Name, err)
        }
    }
    return nil
}
```

Incorrect:

```typescript
await syncOne(project, new AbortController().signal); // caller cannot stop it
```

```go
_ = syncOne(context.Background(), p) // detached from the caller's deadline
```

The Go form is in the go-practices context reference (`context.md`).

**Why:** a chain that drops the handle at one link keeps consuming CPU,
connections and quota for a caller that is no longer there.

---

## Choose Data Structures by Access Pattern

Scope: Collections in TypeScript and Go

Rule: Pick the structure from how the data is read and written:

- Keyed lookup or membership: a map or set (`Map`/`Set` in TypeScript, `map` in
  Go), not a linear search through an array.
- Ordered data read in sequence: a contiguous array or slice. Use linked
  structures only for frequent insertion in the middle, and only after
  measuring.
- Known or estimable size: allocate once up front instead of growing in a loop.
- Shared state handed to a caller: return a copy or a read-only view, so the
  caller cannot change the owner's data.

Correct:

```typescript
const activeById = new Map(sessions.map((s) => [s.id, s]));
const session = activeById.get(sessionId);

export function listIds(): readonly string[] {
  return [...ids];
}
```

Incorrect:

```typescript
const session = sessions.find((s) => s.id === sessionId); // O(n) per lookup in a loop

export function listIds(): string[] {
  return ids; // caller can push into the registry's own array
}
```

The Go form is in the go-practices data structures reference
(`data-structures.md`).

**Why:** the wrong structure turns a lookup loop quadratic, and a shared
internal array lets any caller corrupt the owner's state.

---

## Module-Level Side Effects

Scope: All TypeScript modules

Rule: Importing a module runs no I/O, reads no environment, starts no timers and
does no heavy computation. Module scope holds constants, types, and function and
class declarations. State that must be computed goes behind a lazy getter that
computes on first call and caches the result (or its promise). Mutable
module-level variables exist only as that cache. Top-level `await` is banned by
lint (`no-top-level-await`).

Correct:

```typescript
let settingsPromise: Promise<Settings> | null = null;

export const getSettings = (): Promise<Settings> => {
  if (settingsPromise === null) {
    settingsPromise = loadConfig().then(processConfig);
  }
  return settingsPromise;
};
```

Incorrect:

```typescript
const env = runtime.env.toObject(); // environment read on import
export const settings = processConfig(await loadConfig()); // I/O on import
export let currentUser: User | null = null; // global mutable state
```

**Why:** code at module scope runs on every import, in import order, before a
test can intercept it; one failure there breaks every importer.
