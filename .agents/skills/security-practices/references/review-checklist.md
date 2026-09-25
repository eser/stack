# Security Review Checklist

A checklist for reviewing a change, ordered by severity. Each line points to the
rule that explains it; review the lines that the change touches.

---

## Critical

- [ ] No secret, key or password in code, config, fixtures or logs
      (security-rules.md: Secrets Come From the Environment)
- [ ] SQL uses placeholders; commands take separate arguments; no `sh -c` with
      input (security-rules.md: No Injection Through Strings)
- [ ] No `eval`, dynamic `Function`, or `gob` on untrusted input
      (crypto-and-files.md: Decoding Untrusted Formats)
- [ ] GCM nonces are random per encryption, never reused (crypto-and-files.md:
      Use Vetted Primitives)

## High

- [ ] Every privileged handler checks authorization itself (security-rules.md:
      Authorization in the Handler)
- [ ] Tokens: algorithm pinned, expiry required, issuer and audience checked
      (http-and-auth.md: Tokens)
- [ ] Passwords and PINs stored with Argon2id or bcrypt 12+ (http-and-auth.md:
      Passwords and PINs)
- [ ] Identity and client address come from the server, not client headers
      (http-and-auth.md: Client Identity Comes From the Server)
- [ ] User paths and archive entries confined with `os.OpenRoot`
      (crypto-and-files.md: Files From Untrusted Sources)
- [ ] Outbound requests to user URLs refuse internal addresses at dial time
      (security-rules.md: Outbound Requests to User-Supplied URLs)
- [ ] Tokens and ids come from `crypto/rand` or `crypto.getRandomValues`
      (security-rules.md: Secure Randomness)
- [ ] TLS 1.2+, no `InsecureSkipVerify` without a pin (crypto-and-files.md: Use
      Vetted Primitives)
- [ ] Prompts keep external text in a data section; model output is validated
      (security-rules.md: LLM Trust Boundary)
- [ ] `go test -race` passes for code with shared state (go-practices testing)
- [ ] `go tool govulncheck ./...` reports nothing reachable

## Medium

- [ ] Input validated at the boundary with allowlists and length limits
      (security-rules.md: Input Validation)
- [ ] Body size, rate limits and server timeouts in place (http-and-auth.md:
      Layered Controls)
- [ ] Responses to clients carry no stack traces, SQL or internal paths
      (security-rules.md: Error Sanitization)
- [ ] No secret or personal data in logs, traces or third-party events
      (security-rules.md: Secrets and Personal Data Never Reach Output)
- [ ] Cookies `HttpOnly`, `Secure`, `SameSite`; CSRF protection on
      state-changing requests (http-and-auth.md: Cookies)
- [ ] Redirect targets relative or allowlisted (http-and-auth.md: Redirects and
      Debug Endpoints)
- [ ] Decompressed and computed sizes bounded (crypto-and-files.md: Files From
      Untrusted Sources)

## Low

- [ ] Security headers and CSP mounted for browser-facing services
      (http-and-auth.md: Security Headers)
- [ ] File permissions no wider than needed (crypto-and-files.md: Files From
      Untrusted Sources)
