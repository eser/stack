# Errors

How code in this repository raises, wraps, reports and matches errors, in
TypeScript and Go. Go idioms (`%w`, `errors.Is`, `errors.AsType`) are in
go-practices: Error Handling; user-facing sanitization is in security-practices:
Error Sanitization.

## Contents

- Error Handling
- Error Wrapping
- Actionable Error Messages
- Ignored Errors
- Handle Each Error Once
- Result Objects

---

## Error Handling

Scope: All code, in TypeScript and Go

Rule: Handle every failure that can actually happen: I/O, network, parsing, user
input, a dependency returning an error. Do not add handling for states the types
or an invariant already rule out; a check for the impossible hides the real
contract and never runs in a test. Catch narrowly: handle the error types you
expect and let the rest propagate. A normal outcome (a missing optional file, a
404 for a lookup) is a return value, not an exception.

Correct:

```typescript
export async function fetchManifest(
  url: string,
  signal: AbortSignal,
): Promise<Manifest | null> {
  const response = await fetch(url, { signal });
  if (response.status === 404) {
    return null; // no manifest is a normal answer for this registry
  }
  if (!response.ok) {
    throw new ManifestFetchError(url, response.status);
  }
  return await response.json() as Manifest;
}
```

Incorrect:

```typescript
try {
  return await fetchManifest(url, signal);
} catch {
  return null; // an outage, a bad URL and a bug all look like "no manifest"
}
```

**Why:** a catch-all turns every failure into the same silent answer, and the
caller cannot tell a missing value from a broken system.

---

## Error Wrapping

Scope: Errors raised or propagated in TypeScript

Rule: Throw `Error` subclasses named for the domain failure (`ValidationError`,
`ManifestFetchError`), with the identifying data as properties. When
propagating, wrap with `{ cause: error }` and a message naming the step that
failed, so the chain reads from the outermost operation to the root cause. Never
throw strings, never rethrow a new error that copies only `.message`, and never
build messages by string concatenation.

Correct:

```typescript
export class ManifestFetchError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
    options?: ErrorOptions,
  ) {
    super(`fetch manifest ${url}: HTTP ${status}`, options);
    this.name = "ManifestFetchError";
  }
}

try {
  await installPackage(spec);
} catch (error) {
  throw new InstallError(`install ${spec.name}@${spec.version}`, {
    cause: error,
  });
}
```

Incorrect:

```typescript
throw "install failed"; // not an Error, no stack (lint: no-throw-literal)
throw new Error(error.message); // loses the stack and the cause chain
throw new Error("Something went wrong"); // nothing to act on
```

In Go, the same rule is `fmt.Errorf("step: %w", err)` with sentinel errors and
custom types; see go-practices: Error Handling.

**Why:** the type lets callers match without parsing text, and the cause chain
keeps the root error that a copied message throws away.

---

## Actionable Error Messages

Scope: Every error a user or developer can see: thrown errors, CLI output, HTTP
and daemon error responses

Rule: An error message states what went wrong, why, and what to do next. Include
the value, path or identifier that failed. A validation error says what a valid
value looks like. "Something went wrong", "failed" and a bare "invalid" are
defects. Messages name the operation ("install foo@1.2.0: ...") instead of
starting with "Failed to".

Correct:

```typescript
throw new ValidationError(
  `email "${email}" has no "@"; expected an address like name@example.com`,
  "email",
);
```

Incorrect:

```typescript
throw new Error("Invalid email");
```

**Why:** the person reading the message usually has only the message; one that
names the value and the fix saves a trip into the code.

---

## Ignored Errors

Scope: All languages

Rule: Never ignore returned errors or rejected promises. An empty catch is
allowed only on a cleanup path where a second failure must not hide the first,
and it carries a comment saying why.

Correct:

```typescript
try {
  await runtime.fs.remove(tempDir, { recursive: true });
} catch {
  // Best-effort cleanup after the real error was already reported.
}
```

Incorrect:

```typescript
try {
  await saveSession(session);
} catch {
  // ignored
}
```

```go
result, _ := operation() // error discarded
```

**Why:** an ignored error surfaces later as corrupted state, far from the call
that could have explained it.

---

## Handle Each Error Once

Scope: All error handling, in TypeScript and Go

Rule: An error is either handled or returned, never both. Code that returns an
error adds context and passes it up without logging it. The code that handles it
(a request handler, a CLI command, a worker loop, a cleanup path that decides to
continue) logs it once with full context and turns it into a response, a retry
or a fallback.

Correct:

```go
func (s *SessionService) Load(ctx context.Context, id string) (*Session, error) {
    session, err := s.store.Get(ctx, id)
    if err != nil {
        return nil, fmt.Errorf("load session %q: %w", id, err) // returned, not logged
    }
    return session, nil
}

func (h *Handler) GetSession(w http.ResponseWriter, r *http.Request) {
    session, err := h.sessions.Load(r.Context(), r.PathValue("id"))
    if err != nil {
        h.logger.ErrorContext(r.Context(), "get session", "error", err) // handled here
        writeError(w, err)
        return
    }
    writeJSON(w, session)
}
```

Incorrect:

```go
if err != nil {
    log.Error("store get failed", "error", err)
    return nil, err // logged here and again by every caller
}
```

**Why:** logging and then returning writes the same failure several times, each
entry with less context than the last.

---

## Result Objects

Scope: TypeScript functions whose failure is an expected outcome the caller must
branch on (parsing, validation, lookups)

Rule: Use the `Result` type from `@eserstack/primitives/results` (`ok`, `fail`,
`isOk`, `isFail`, `map`, `flatMap`) instead of a hand-rolled union. Throw for
programming errors and unexpected failures; return a `Result` when failing is
part of the function's normal contract.

Correct:

```typescript
import * as results from "@eserstack/primitives/results";

export function parsePort(
  input: string,
): results.Result<number, ValidationError> {
  const port = Number(input);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    return results.fail(
      new ValidationError(
        `port "${input}" is not an integer in 1..65535`,
        "port",
      ),
    );
  }
  return results.ok(port);
}
```

**Why:** one shared type keeps the combinators and type guards consistent across
packages.
