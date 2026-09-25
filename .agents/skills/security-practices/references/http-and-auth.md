# HTTP Services and Authentication

How services built on `httpfx` are hardened: the middleware layers, tokens,
passwords, cookies and client identity. General rules (secrets, input,
injection, error sanitization) are in [security-rules.md](security-rules.md).

## Contents

- Layered Controls
- Client Identity Comes From the Server
- Tokens
- Passwords and PINs
- Cookies
- Security Headers
- Redirects and Debug Endpoints

---

## Layered Controls

Scope: Every HTTP service

Rule: No single check protects a service, so each layer assumes the one before
it failed. Compose the existing `httpfx/middlewares` instead of writing new
ones:

| Layer      | Control                                | In this repository                                                               |
| ---------- | -------------------------------------- | -------------------------------------------------------------------------------- |
| Transport  | Server timeouts, header size           | `httpfx` config: read, write, idle, header timeouts                              |
| Transport  | TLS 1.2+, TLS 1.3 for QUIC             | `httpfx` HTTP/3 service, `webtransport`                                          |
| Volume     | Rate limits, per client or per user    | `RateLimitMiddleware` with `WithRateLimiterIPKeyFunc` or user                    |
| Volume     | Request body limit                     | `RequestSizeLimitMiddleware`, `max_request_size_mb`                              |
| Identity   | Token or PIN check on every request    | `AuthMiddleware`, `PinAuthMiddleware`                                            |
| Permission | Per-handler authorization              | security-rules.md: Authorization in the Handler                                  |
| Browser    | Security headers, CSP, CSRF, CORS      | `SecurityHeadersMiddleware`, `CspMiddleware`, `CsrfMiddleware`, `CorsMiddleware` |
| Data       | Encryption and least-privilege storage | crypto-and-files.md                                                              |

Rate-limit login, PIN and token endpoints and expensive operations (search,
export, upload) more tightly than the rest. A per-client limiter keeps one entry
per key, so it must evict idle keys (`RateLimitMiddleware` does); a map that
only grows is itself a memory exhaustion hole (coding-practices: Bound Every
Resource).

**Why:** a missing check in one layer, such as a handler that forgot its
authorization, is then bounded by the others instead of becoming a breach.

---

## Client Identity Comes From the Server

Scope: Anything that reads the client's address, identity or role

Rule: Identity and roles come from a verified token or session, never from a
request header the client can set (`X-Is-Admin`, `X-User-Id`). The client
address comes from `ResolveAddressMiddleware` with
`WithTrustedProxies(httpfx.NewTrustedProxies(...))`: `X-Forwarded-For` is
believed only from the listed proxies, and without the option the socket peer
wins. Hidden URLs and client-side checks are not access control.

Correct:

```go
claims, ok := ctx.Request.Context().Value(middlewares.ContextKeyAuthClaims).(jwt.MapClaims)
if !ok || !hasRole(claims, "admin") {
    return ctx.Results.Error(http.StatusForbidden)
}
```

Incorrect:

```go
if ctx.Request.Header.Get("X-Is-Admin") == "true" { // any client can send this
    return adminPanel(ctx)
}
```

---

## Tokens

Scope: Issuing and validating JWTs and other bearer tokens

Rule: Validate a token completely before trusting any claim:

- Pin the signing algorithm with `jwt.WithValidMethods([]string{"HS256"})` (or
  the RSA or EdDSA method in use). Checking the method's type in the key
  function also works; accepting whatever `alg` the token names does not.
- Require expiry with `jwt.WithExpirationRequired()`, and check issuer and
  audience with `jwt.WithIssuer` and `jwt.WithAudience`. A token without `exp`
  must fail, not pass.
- Keep access tokens short-lived (minutes) and refresh tokens revocable on the
  server.
- Signing keys come from the environment (security-rules.md: Secrets Come From
  the Environment) and differ per environment, so a staging leak does not open
  production.

Correct:

```go
token, err := jwt.Parse(raw, keyFunc,
    jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
    jwt.WithExpirationRequired(),
    jwt.WithIssuer(cfg.Issuer),
    jwt.WithAudience(cfg.Audience),
)
if err != nil {
    return ctx.Results.Unauthorized(httpfx.WithPlainText("invalid token"))
}
```

**Why:** an unpinned algorithm lets an attacker pick one the server did not
intend, and an optional expiry turns a leaked token into a permanent one.

---

## Passwords and PINs

Scope: Storing and checking user secrets

Rule: Store only a slow, salted hash. Use Argon2id
(`golang.org/x/crypto/argon2`, `IDKey` with at least 64 MiB memory, 3 passes, a
16-byte salt from `crypto/rand`) for new storage, or bcrypt with cost 12 or
more, as `noskillsserverfx/auth.go` does for PINs. Compare through the library
(`bcrypt.CompareHashAndPassword`) or `subtle.ConstantTimeCompare`, never with
`==`. Rate-limit the endpoints that check them. Fast hashes (SHA-256, MD5) are
never password storage.

**Why:** a stolen hash database is attacked offline; only a deliberately slow,
memory-hard hash keeps that attack expensive.

---

## Cookies

Scope: Session, auth and CSRF cookies

Rule: Session and auth cookies are `HttpOnly`, `Secure` and `SameSite=Lax` (or
`Strict` for sensitive actions), with `Path: "/"`, no `Domain`, and a bounded
`MaxAge`. Prefer the `__Host-` name prefix, which the browser only accepts with
exactly those settings. `SameSite=None` needs `Secure` and a reason in a
comment. The one exception here is the double-submit CSRF cookie of
`CsrfMiddleware`: it is readable by JavaScript on purpose, so it never carries a
credential. Clear session cookies on logout and invalidate the session on the
server too.

```go
http.SetCookie(w, &http.Cookie{
    Name:     "__Host-session",
    Value:    sessionID,
    Path:     "/",
    MaxAge:   int((8 * time.Hour).Seconds()),
    HttpOnly: true,
    Secure:   true,
    SameSite: http.SameSiteLaxMode,
})
```

---

## Security Headers

Scope: Responses from services that serve browsers

Rule: Mount `SecurityHeadersMiddleware` (sets `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY` and HSTS) and `CspMiddleware` with the narrowest policy
the pages need (`default-src 'self'`, `frame-ancestors 'none'`,
`object-src 'none'`). Neither currently sets `Referrer-Policy`
(`strict-origin-when-cross-origin`) or `Permissions-Policy`; a service that
needs them sets them in its own middleware until they are added there. Send HSTS
only on HTTPS responses.

---

## Redirects and Debug Endpoints

Scope: Redirect targets and diagnostic handlers

Rule:

- Redirect only to relative paths or to hosts on an allowlist. Parse the target
  with `url.Parse` and compare the host exactly; a prefix or substring check
  lets `https://example.com.evil.test` through.
- `/debug/pprof/` and similar endpoints reveal memory and stacks. Mount the
  `httpfx` profiling module only behind `PPROF_TOKEN`, or on a separate listener
  bound to `127.0.0.1`. Services in containers still listen on all interfaces
  for their public port; debug listeners do not.
