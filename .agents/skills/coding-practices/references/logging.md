# Logging

Where and how code logs, in TypeScript (`@eserstack/logging`) and Go
(`pkg/ajan/logfx`). Secrets and personal data rules are in security-practices:
Secrets and Personal Data Never Reach Output.

---

## Structured Logging

Scope: Services, adapters and command handlers (the noskills daemon, HTTP and
CLI handlers, repository adapters). Pure domain functions and library utilities
do not log; they return values or errors, and the caller logs.

Rule: Log through the project loggers with structured properties, never with
`console.*` (lint: `no-console`) or `fmt.Println`. Pick the level by layer and
attach correlation context.

- Repository and data layer: `debug` and `trace`, `warn` for recoverable
  anomalies.
- Service layer: `info` for completed operations that matter to an operator.
- Handlers: `error` once, where the failure is handled (errors.md: Handle Each
  Error Once).
- Every entry carries the ids needed to follow one operation: trace or request
  id, plus the entity id. Attach them once with `logger.with(...)` or
  `logging.context.withContext(...)`. Extra arguments to `info(...)` land in a
  single `args` attribute, so put fields in `with(...)`, not after the message.

Correct:

```typescript
import * as logging from "@eserstack/logging";

const logger = logging.logger.getLogger(["noskills", "sessions"]);

export async function createSession(input: SessionInput, requestId: string) {
  const log = logger.with({ requestId, projectId: input.projectId });
  const session = await store.insert(input);
  await log.with({ sessionId: session.id }).info("session created");
  return session;
}
```

```go
logger.InfoContext(ctx, "session created", "sessionId", session.ID)
logger.DebugContext(ctx, "fetching session from store", "sessionId", id)
```

Incorrect:

```typescript
console.log("session created"); // no structure, no context, fails lint
await logger.info("db query executed"); // wrong level for the repository layer
await logger.error("error"); // no context
```

**Why:** an operator diagnosing a failure has only the log; entries without
level discipline and ids cannot be filtered or joined into one story.
