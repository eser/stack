---
name: security-practices
description: "Security rules of this codebase for TypeScript and Go: secrets, output hygiene, input validation, authorization, injection, SSRF, error sanitization, HTTP hardening with httpfx middlewares, tokens, passwords, cookies, crypto, untrusted files, LLM trust. Use when handling secrets, input, auth, sessions, cookies, crypto, uploads, subprocesses, outbound URLs, prompts, production config or a review."
---

# Security Practices

Security rules for every package and service in this codebase, TypeScript and Go
alike.

## Always

- Secrets come from environment variables (`runtime.env` in TypeScript), never
  from code or committed config
- Secrets and personal data never reach logs, errors, responses or traces
- Validate every input where it enters: HTTP, CLI, env, files, IPC, model output
- Every handler checks authorization itself and denies by default
- No command, path, SQL or HTML built from input strings; Go paths go through
  `os.OpenRoot`
- Requests to user-supplied URLs refuse internal addresses at dial time
- Production errors carry a message, a code and a request id, never internals
- Tokens and ids come from a CSPRNG, never `Math.random` or `math/rand`
- Model output is untrusted input
- Go HTTP services compose the ajan `httpfx/middlewares` (rate limit, body size,
  auth, headers, CSP, CSRF, CORS) instead of writing new ones
- Tokens pin their algorithm and require expiry; passwords use Argon2id or
  bcrypt 12+; crypto comes from the standard library or `x/crypto`

## References

| File                                                  | Read when                                                                           |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [security-rules.md](references/security-rules.md)     | Code that handles secrets, input, auth, subprocesses, paths, outbound URLs, prompts |
| [http-and-auth.md](references/http-and-auth.md)       | HTTP services, middleware, tokens, passwords, cookies, redirects, debug endpoints   |
| [crypto-and-files.md](references/crypto-and-files.md) | Encryption, hashing, TLS, uploads, archives, temp files, decoding untrusted data    |
| [review-checklist.md](references/review-checklist.md) | Reviewing a change for security                                                     |
