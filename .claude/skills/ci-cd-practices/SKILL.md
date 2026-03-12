---
name: ci-cd-practices
description: "CI/CD operations: GitHub Actions, Kubernetes, ArgoCD, and CI timeout configuration. Use when configuring pipelines, debugging deployments, or working with GitHub Actions. Do NOT use for general development workflow."
---

# CI/CD Practices

## Quick Start

1. Use `gh` CLI for GitHub operations (PRs, issues, actions)
2. Use `kubectl` for Kubernetes inspection and debugging
3. Set reasonable CI timeouts (20 minutes default)
4. Always inspect before acting (check PR status, pod logs first)

## Key Principles

- Operational tools: `gh` for GitHub, `kubectl` for Kubernetes
- Inspect before acting — check status, logs, and state first
- Use `ubuntu-latest` runners, avoid self-hosted unless justified
- ArgoCD image updater workflow for deployments

## References

See [rules.md](references/rules.md) for complete conventions.
