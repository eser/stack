# Security Rules

Secrets, input handling, authorization, injection, outbound requests and
production settings, in TypeScript and Go.

## Contents

- Secrets Come From the Environment
- Secrets and Personal Data Never Reach Output
- Secure Randomness
- Input Validation
- Authorization in the Handler
- No Injection Through Strings
- Outbound Requests to User-Supplied URLs
- Error Sanitization
- Production Mode and Secure Defaults
- LLM Trust Boundary

---

## Secrets Come From the Environment

Scope: API keys, tokens, passwords, connection strings

Rule: Secrets are read from environment variables at start-up and never live in
code, committed config files or fixtures. A missing required secret stops
start-up with an error that names the variable. TypeScript reads the environment
through `runtime.env` from `@eserstack/standards/cross-runtime`, not
`process.env` or `Deno.env`, so the code runs on every supported runtime.
Provider keys in this repository follow the provider's own names
(`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`), as `pkg/ajan/aifx/config.go` reads
them.

```typescript
import { runtime } from "@eserstack/standards/cross-runtime";

const apiKey = runtime.env.get("OPENAI_API_KEY");
if (apiKey === undefined || apiKey === "") {
  throw new Error("OPENAI_API_KEY is not set; export it or add it to .env");
}
```

```go
apiKey := os.Getenv("OPENAI_API_KEY")
if apiKey == "" {
    return errors.New("OPENAI_API_KEY is not set; export it or add it to .env")
}
```

Never:

```json
{ "openaiApiKey": "sk-..." }
```

---

## Secrets and Personal Data Never Reach Output

Scope: Logs, error messages and their `cause`, response bodies, serialized
objects, CLI output, trace and metric attributes, in TypeScript and Go

Rule: Tokens, passwords, API keys, private keys and personal data (emails,
names, IP addresses) never appear in any output. Log and trace by id, and log a
secret's key name or a fixed mask, never its value. Types that hold a secret
redact it when serialized or printed (`toJSON`,
`[Symbol.for("Deno.customInspect")]`, Go `String()`/`MarshalJSON`). Check new
log lines and error messages for accidental exposure.

- User input goes into log attributes, never into the message string. The
  structured handlers escape attribute values, so a value with a newline or a
  forged `level=` field cannot fake a log entry; a message built with
  `fmt.Sprintf` from input can.
- The same applies to every external sink: OpenTelemetry attributes, error
  trackers, analytics. Send ids and outcomes, and strip `Authorization`,
  `Cookie` and request bodies before an event leaves the process. A new
  third-party sink needs this reviewed before it is wired in.

Correct:

```typescript
logger.info("provider configured", {
  provider: "openai",
  apiKey: "[redacted]",
});
logger.info("user created", { userId, traceId });
```

Incorrect:

```typescript
throw new Error(`auth failed for key ${apiKey}`);
logger.info("user created", { email, apiKey });
```

---

## Secure Randomness

Scope: Tokens, session ids, keys, nonces, passwords, PKCE verifiers, in
TypeScript and Go

Rule: Anything an attacker must not guess comes from a cryptographically secure
generator: `crypto.getRandomValues` or `crypto.randomUUID` in TypeScript,
`crypto/rand` in Go. `Math.random` and `math/rand` are predictable from their
output. They remain fine for jitter, sampling and shuffling test data.

```typescript
const token = crypto.getRandomValues(new Uint8Array(32));
```

```go
token := make([]byte, 32)
if _, err := rand.Read(token); err != nil { // crypto/rand
    return fmt.Errorf("generate token: %w", err)
}
```

---

## Input Validation

Scope: All external inputs: HTTP params, headers, cookies and bodies, file
uploads, CLI arguments and flags, environment variables, config files and other
files read from disk, webhook payloads, OAuth callbacks, websocket and daemon
IPC messages, and output from subprocesses or AI models

Rule: Validate each input at the boundary where it enters, before it reaches
business logic, and fail fast with a message that names the field and the
expected form. When adding an entry point, name its inputs and the validation
for each in the change. Validation of internal invariants (assertions) belongs
to coding-practices.

```go
var req CreateSessionRequest
if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
    http.Error(w, "request body must be a JSON object under 1 MiB", http.StatusBadRequest)
    return
}
if !sessionNamePattern.MatchString(req.Name) {
    http.Error(w, `name must match ^[a-z0-9-]{1,64}$`, http.StatusBadRequest)
    return
}
```

---

## Authorization in the Handler

Scope: Every HTTP route, daemon RPC, WebTransport or websocket action, in
TypeScript and Go

Rule: A new endpoint states who may call it. Each handler checks, on the server,
that the caller may perform this action on this resource, even when middleware
already authenticated the request. Deny by default: a handler that cannot
establish authorization denies, and an endpoint without an explicit check is a
defect, not a public endpoint. Tests cover the denial paths: unauthenticated,
wrong user and wrong role.

Correct:

```go
if !session.CanAccess(principal, sessionID) {
    return ErrForbidden
}
```

Incorrect:

```go
// auth middleware ran, so any session id is fine
return store.Get(sessionID)
```

---

## No Injection Through Strings

Scope: Subprocesses, file paths, SQL, and HTML or markdown rendering built from
user, config, network or model input, in TypeScript and Go

Rule: Never build a command, path, query or markup by concatenating input.

- Subprocesses: interpolate values into `@eserstack/shell/exec` (each value
  becomes one argument) or pass an argument array (Go
  `exec.Command(name, args...)`). Never run `sh -c` with a string that contains
  input.
- Paths: resolve a supplied path against an allowed root and reject anything
  that escapes it (`..`, absolute paths, symlinks out of the root). In Go, open
  the root with `os.OpenRoot` (Go 1.24+) and use its methods, which enforce this
  at the system-call level instead of by string checks.
- SQL: parameterized queries only.
- HTML: server-rendered output escapes input. `dangerouslySetInnerHTML` and raw
  markdown-to-HTML output need a sanitizer and a comment saying why.

Correct:

```typescript
import * as shell from "@eserstack/shell";

await shell.exec.exec`git log --format=%H -- ${userPath}`.text();
```

Incorrect:

```typescript
const command = `git log --format=%H -- ${userPath}`;
await shell.exec.exec`sh -c ${command}`.text(); // userPath reaches the shell parser
```

---

## Outbound Requests to User-Supplied URLs

Scope: Webhooks, callbacks, fetchers and any request whose URL comes from input

Rule: Before connecting, resolve the host and refuse loopback, private,
link-local and unspecified addresses, for IPv4 and IPv6. Check the address the
connection actually dials, not a separate lookup done earlier, so a DNS answer
that changes between check and connect (rebinding) cannot bypass it, and apply
the same check to every redirect. Require `https` outside development.

In Go, check in the dialer, with `net/netip`:

```go
dialer := &net.Dialer{
    Control: func(network, address string, _ syscall.RawConn) error {
        addrPort, err := netip.ParseAddrPort(address)
        if err != nil {
            return fmt.Errorf("parse dial address %q: %w", address, err)
        }
        ip := addrPort.Addr().Unmap()
        if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsUnspecified() {
            return fmt.Errorf("refusing to connect to internal address %s", ip)
        }
        return nil
    },
}
```

---

## Error Sanitization

Scope: Error responses of APIs, the daemon and CLI commands that talk to
services

Rule: In production, responses never carry stack traces, internal messages, SQL
or request echoes. Translate each internal error at the boundary into a message
the user can act on plus a stable error code and a request id, and log the
technical detail under the same request id.

Correct:

```typescript
logger.error("request failed", { requestId, error });

return {
  error: "The request could not be completed. Retry, or report this id.",
  code: "INTERNAL_ERROR",
  requestId,
};
```

Incorrect:

```typescript
res.status(500).json({
  error: error.message,
  stack: error.stack,
  query: req.query,
});
```

---

## Production Mode and Secure Defaults

Scope: Services and servers built on `httpfx` or the TypeScript HTTP packages

Rule: The environment name comes from `ENV`, `APP_ENV`, `DENO_ENV` or `NODE_ENV`
(the order `@eserstack/config` reads them), and falls back to `development` when
none is set. A deployment therefore sets it explicitly, and a relaxation that
weakens security (unauthenticated profiling, plain HTTP webhooks, detailed
errors) needs its own opt-in setting, not only the environment name. In
production:

- profiling and debug endpoints are off, or behind a token. The `httpfx`
  profiling module only logs a warning when `PPROF_TOKEN` is unset and leaves
  the endpoints open, so set it wherever the module is mounted;
- errors are sanitized (Error Sanitization);
- rate limits and request size limits are set (`httpfx` config
  `rate_limit_requests` and `max_request_size_mb`);
- outbound connections use TLS;
- cookies are `HttpOnly`, `Secure` and `SameSite`;
- tokens are short-lived and checked for issuer, audience and expiry;
- CORS lists allowed origins explicitly and never reflects the request's
  `Origin`; an empty list allows none.

**Why:** the environment name defaults to `development`, so a check keyed on the
name alone is relaxed in any deployment that forgot to set it.

---

## LLM Trust Boundary

Scope: Code that builds prompts or consumes model output (`@eserstack/ai`,
`aifx`, noskills agents)

Rule: User or external content in a prompt goes in a clearly delimited data
section, never in the instruction text. Model output is untrusted input:
validate it against a schema before use, and never pass it to a shell, a file
path, SQL or `eval` without the same checks as any other external input.
