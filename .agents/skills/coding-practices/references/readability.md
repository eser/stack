# Readability

Naming, comments, abstraction, checks and control flow, in TypeScript and Go.
Formatting itself belongs to `deno fmt` and `gofmt`; what they enforce is not
repeated here.

## Contents

- Self-Documenting Code
- Comments
- Don't Repeat Yourself
- Magic Values
- Explicit Checks (CRITICAL)
- Exhaustive Branching
- Identity Comparison
- Early Returns
- Line Length and Breaking
- Prefix Extraction
- No Runtime Code Generation or Global Patching
- Circular Dependencies

---

## Self-Documenting Code

Scope: All languages

Rule: Name similar operations the same way within a package and across packages:
all loaders are `load*`, not a mix of `load*`, `fetch*` and `get*`. Use full
words, not abbreviations (`sessionRegistry`, not `sessReg`). Casing follows the
language and lint (`camelcase` in deno lint).

**Why:** consistent verbs let a reader and a search find every operation of one
kind; a mix hides some of them.

---

## Comments

Scope: All languages

Rule: Comments explain why: a trade-off, a constraint, a non-obvious algorithm.
Every deliberate shortcut or exception (a lint ignore, a validator exclude, a
hardcoded limit, a skipped case) carries a comment giving the reason and what
would remove it. Do not commit commented-out code; git history keeps it. TODOs
follow deno lint `ban-untagged-todo` (`TODO(owner): ...`).

Correct:

```typescript
// The FFI bridge returns untyped JSON; the schema check below narrows it.
// Remove the ignore when the bridge emits typed results.
// deno-lint-ignore no-explicit-any
const raw: any = bridge.call("status");
```

Incorrect:

```typescript
// deno-lint-ignore no-explicit-any
const raw: any = bridge.call("status");
```

**Why:** an unexplained exception looks like an oversight, so the next person
either copies it or removes it without knowing what breaks.

---

## Don't Repeat Yourself

Scope: All languages

Rule: Extract repeated logic at its third real use, or at the second when the
logic is complex or must stay in sync (a validation rule, a path layout, a wire
format). Lines that only look alike but encode different decisions are not
repetition; keep them apart. Prefer a plain function over a configurable
abstraction; add parameters when a caller needs them, not in advance.

**Why:** duplicated logic drifts apart when one copy is fixed; a premature
abstraction couples unrelated callers and is harder to undo than a copy.

---

## Magic Values

Scope: All languages

Rule: A number or string with meaning beyond its value (a limit, a timeout, a
status name, a path segment) is a named constant, and its unit is in the name
(`API_TIMEOUT_MS`, `maxPooledBuffer`). The comment on it says why that value.

**Why:** the name says what the value means and gives one place to change it.

---

## Explicit Checks (CRITICAL)

Scope: TypeScript and JavaScript

Rule: Use implicit truthy/falsy checks only on booleans. Compare everything else
explicitly: `=== null`, `=== undefined`, `=== ""`, `.length === 0`, `=== 0`,
`!== -1`. Defaults use `??`, never `||`. Equality is always `===` (lint:
`eqeqeq`).

Correct:

```typescript
if (value === null) {}
if (name === "") {}
if (items.length === 0) {}
if (index !== -1) {}
if (!response.ok) {} // boolean
const port = config.port ?? 8000;
```

Incorrect:

```typescript
if (!value) {} // also true for 0, "" and false
if (!items.length) {}
if (user) {}
const port = config.port || 8000; // replaces a valid 0
```

**Why:** `0`, `""` and `false` are often valid values; an implicit check treats
them as missing and the bug shows up only with those inputs.

---

## Exhaustive Branching

Scope: `switch` or `if` chains over unions and enums, in TypeScript and Go

Rule: Handle every case. In TypeScript, end the switch with a `never` check so a
new member fails compilation. In Go, a `switch` over an enum-like type has a
`default` that returns an error.

Correct:

```typescript
switch (state.kind) {
  case "idle":
    return renderIdle();
  case "running":
    return renderRunning(state);
  default: {
    const unreachable: never = state;
    throw new Error(`unhandled state ${JSON.stringify(unreachable)}`);
  }
}
```

```go
default:
    return fmt.Errorf("%w: %q", ErrUnknownPhase, phase)
```

Incorrect:

```typescript
switch (state.kind) {
  case "idle":
    return renderIdle();
} // "running" silently returns undefined
```

**Why:** the compiler then finds every switch a new state must be added to.

---

## Identity Comparison

Scope: All languages

Rule: Compare entities by their stable ids, never by display strings such as
slugs, usernames, emails or titles.

Correct:

```typescript
const isOwnProfile = membership.profileId === profile.id;
```

Incorrect:

```typescript
const isOwnProfile = membership.profileSlug === profile.slug; // renames break it
```

**Why:** display strings change and differ in case and whitespace; ids do not.

---

## Early Returns

Scope: All languages

Rule: Handle errors and edge cases first and return early, so the happy path
stays at the lowest indentation and reads straight down. Each guard checks one
condition and leaves; the main work comes after all of them, not in an `else`.

Correct:

```go
func LoadSession(root, sessionID string) (*Session, error) {
    if !ValidSessionID(sessionID) {
        return nil, fmt.Errorf("load session %q: %w", sessionID, ErrInvalidSessionID)
    }

    data, err := os.ReadFile(filepath.Join(root, sessionID+".json"))
    if err != nil {
        return nil, fmt.Errorf("read session %q: %w", sessionID, err)
    }

    return decodeSession(data)
}
```

Incorrect:

```typescript
function sessionStatus(session: Session | null): Status {
  if (session !== null) {
    if (session.active) {
      return loadStatus(session.id);
    } else {
      return "inactive";
    }
  } else {
    return "missing";
  }
}
```

**Why:** nested branches make the reader hold every condition at once; guards
retire them one by one.

---

## Line Length and Breaking

Scope: All code; TypeScript, JavaScript and Markdown are wrapped by `deno fmt`,
so this governs Go and anything the formatter does not wrap

Rule: There is no fixed column limit, but a line past about 120 characters is
broken. Break where the structure already has a seam (between arguments, after
an operator, before a chained call), not at whatever column the line reaches. A
call with four or more arguments puts each argument on its own line, with the
closing parenthesis on its own line. This holds for code written on request too;
asking for a one-liner does not make a long call acceptable. Where `deno fmt`
owns the layout, keep its output rather than hand-wrapping against it.

A signature that is too long to read usually has too many parameters. The fix is
an options struct or object (see architecture-guidelines: Public API and CLI
Surface), not cleverer wrapping.

Correct:

```go
handleSessions(
    w,
    r,
    registry,
    cfg,
    logger,
)

type StartOptions struct {
    Root    string
    Timeout time.Duration
    Logger  *logfx.Logger
}

func StartSession(ctx context.Context, opts StartOptions) (*Session, error)
```

Incorrect:

```go
mux.HandleFunc("/api/sessions", func(w http.ResponseWriter, r *http.Request) { handleSessions(w, r, registry, cfg, logger) })

func StartSession(ctx context.Context, root string, timeout time.Duration, logger *logfx.Logger, retries int, dryRun bool) (*Session, error)
```

**Why:** a line broken at its seams can be read and diffed argument by argument.

---

## Prefix Extraction

Scope: Taking a value after a known prefix: HTTP headers, URIs, file paths,
protocol strings, in TypeScript and Go

Rule: Check that the value starts with the prefix, then cut exactly the prefix
length. Never use a search-and-replace for this: it matches the first occurrence
anywhere in the string, so `"xBearer token"` or `"s3://file://bucket"` are
silently rewritten. Return "no value" when the prefix is missing or nothing
follows it.

Correct:

```typescript
function extractAfterPrefix(
  value: string | null,
  prefix: string,
): string | null {
  if (value === null || !value.startsWith(prefix)) {
    return null;
  }
  const extracted = value.slice(prefix.length);
  return extracted.length > 0 ? extracted : null;
}

const token = extractAfterPrefix(authHeader, "Bearer ");
```

```go
token, ok := strings.CutPrefix(authHeader, "Bearer ")
if !ok || token == "" {
    return "", ErrMissingToken
}
```

Incorrect:

```typescript
const token = authHeader?.replace("Bearer ", "") ?? null; // matches anywhere
const token2 = authHeader?.slice(7) ?? null; // never checks the prefix
```

```go
token := strings.Replace(authHeader, "Bearer ", "", 1) // matches anywhere
```

**Why:** a replace that matches mid-string accepts malformed input as valid,
which in a header parser is an authentication bug.

---

## No Runtime Code Generation or Global Patching

Scope: All languages

Rule: Do not build and run code at runtime, and do not change shared built-ins
or other packages' internals. In TypeScript that means no `eval` (lint:
`no-eval`), no `new Function`, no prototype changes and no
`Object.defineProperty` on shared objects. In Go it means no `unsafe` or
`reflect` writes into another package's unexported state.

Correct:

```typescript
const handlers: Record<Action, (x: Input) => Output> = { add, remove };
const handler = handlers[action];
```

Incorrect:

```typescript
eval(`${action}(input)`); // any action string becomes code
Array.prototype.last = function () {}; // changes every array in the process
```

**Why:** both break static analysis, and any input that reaches them becomes
code.

---

## Circular Dependencies

Scope: Imports between TypeScript modules and packages

Rule: Module imports form a graph without cycles. The `validate-circular-deps`
validator in `@eserstack/codebase` detects them; it is not part of the precommit
workflow, so run it after moving code between modules. Break a cycle by moving
the shared part into a module both sides import.

**Why:** a cycle makes evaluation order decide which side sees `undefined`
exports, and the failure depends on which module is imported first.
