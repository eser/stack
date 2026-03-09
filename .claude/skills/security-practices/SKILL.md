---
name: security-practices
description: "Security practices: secrets in env vars, input validation, SSRF prevention, error sanitization, and production hardening. Use when handling authentication, secrets, user input, or preparing production deployments."
---

# Security Practices

## Quick Start

1. All secrets in environment variables (never in config files)
2. Validate inputs at system boundaries
3. Sanitize error responses (no stack traces in production)
4. Use HTTPS for all external connections

## Key Principles

- Environment variables for all secrets
- SSRF prevention (block internal IP ranges)
- Development vs Production mode separation
- Rigorous input validation

## Anti-Patterns

**"I'll use --allow-all for convenience"**
No. Only broad permissions in test files and scripts, never production.

**"I'll hardcode the API key for now"**
No. All secrets go in environment variables. No exceptions.

**"I'll skip the pre-commit hook this once"**
No. Never bypass hooks with `--no-verify`.

## References

See [rules.md](references/rules.md) for complete conventions.
