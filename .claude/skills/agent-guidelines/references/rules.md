# Agent Guidelines - Detailed Rules

## Agent Roles

### Implementer

Scope: Writing code within a single package

Rule: Stay within one package per task. Follow package conventions from `eserstack-monorepo` skill.

Responsibilities:
- Write code within `pkg/@eserstack/<name>/` or `pkg/@cool/<name>/`
- Run `deno task validate` after changes
- Follow package conventions (mod.ts entry, license headers, kebab-case)
- Write tests for new functionality
- Keep functions pure when possible

### Reviewer

Scope: Read-only code analysis

Rule: Analyze without modifying. Check adherence to skills.

Responsibilities:
- Read-only analysis of code quality and patterns
- Check adherence to skills in `.claude/skills/`
- Verify test coverage and type safety
- Suggest improvements without implementing them

### Architect

Scope: Planning cross-package or structural changes

Rule: Plan before implementing. Document decisions.

Responsibilities:
- Plan cross-package changes using the cross-package protocol
- Reference `.github/ARCHITECTURE.md` for package relationships
- Create ADRs in `etc/adrs/` for significant architectural decisions
- Consider impact on all 29+ packages

---

## File Ownership

Scope: Understanding responsibility areas

Rule: Each area has specific concerns. Respect ownership boundaries.

| Area | Owner Concern |
|------|--------------|
| `pkg/@eserstack/fp/` | Functional programming — pure functions, immutability |
| `pkg/@eserstack/di/` | Dependency injection — container patterns |
| `pkg/@eserstack/cli/` | CLI tool — also the npm publishing target |
| `pkg/@eserstack/laroux*/` | Framework — server, bundler, React integration |
| `pkg/@eserstack/standards/` | Cross-platform abstractions — **high impact, change carefully** |
| `pkg/@eserstack/config/` | Configuration management — dotenv, file loaders |
| `pkg/@eserstack/events/` | Event system — pub/sub patterns |
| `pkg/@eserstack/shell/` | Shell interaction — args, exec, env, completions |
| `apps/ajan/pkg/api/business/` | Go business logic — pure domain, no external deps |
| `apps/ajan/pkg/api/adapters/` | Go adapters — external integrations |
| `apps/ajan/cmd/` | Go entry points — server, CLI |
| `apps/ajan/Makefile` | Go build targets — test in branch |
| `etc/templates/` | Project templates — validate after changes |
| `.github/workflows/` | CI/CD — test in a branch before merging |
| `.claude/skills/` | AI guidance — update when conventions change |

---

## Safety Rules - Never Do

Scope: All agent interactions

Rule: These actions are **strictly prohibited**. No exceptions without explicit user approval.

- Run destructive git commands (`checkout`, `commit`, `reset`, `push`, `rebase`, `stash`, `tag`)
- Modify files outside the assigned package without explicit approval
- Change `deno.json` version fields manually (use the version-bump script)
- Remove or weaken TypeScript types
- Skip pre-commit hooks (`--no-verify`)
- Commit secrets or `.env` files
- Use `--allow-all` in production code (only in scripts/tests)
- Modify lock files manually
- Push directly to `main` branch

## Red Flags

Stop and reconsider if you're thinking:
- "Just this once I'll skip validate..."
- "This small change doesn't need tests..."
- "I'll fix the types later..."
- "This version edit is too small to use the script..."

---

## Safety Rules - Ask First

Scope: Actions requiring explicit approval

Rule: Get user confirmation before proceeding with these actions.

- Cross-package dependency changes (adding imports between `@eserstack/*` packages)
- Adding new external dependencies (JSR or npm packages)
- Modifying CI/CD workflows (`.github/workflows/`)
- Schema changes in `@eserstack/standards` (affects all packages)
- Changes to publishing configuration (deno.json exports, publish fields)
- Removing or deprecating public API functions

---

## Safety Rules - Always Do

Scope: Required actions for every task

Rule: These must be done before considering work complete.

- Run `deno task validate` (or `make ok`) — full monorepo validation (Deno + Go)
- Run `make go-ok` after Go changes — Go-specific validation
- Follow existing code patterns in the target package
- Write tests for new functionality (`*.test.ts` co-located)
- Use explicit file extensions in imports (`.ts`, `.tsx`)
- Keep functions pure when possible (side effects at the edges)
- Use `@std/*` for standard library imports
- Use `@eserstack/*` for internal package imports

---

## Cross-Package Change Protocol

Scope: Changes that span multiple `@eserstack/*` packages

Rule: Follow this 5-step protocol. Never skip steps.

1. **Justify** — Explain why multiple packages must change together. Single-package changes are preferred.

2. **Plan** — List all affected packages and describe the change in each:
   ```
   @eserstack/standards: Add new Runtime interface method
   @eserstack/config: Implement the new method
   @eserstack/cli: Use the new method
   ```

3. **Order** — Change dependencies before dependents:
   - Layer 0 (`@eserstack/standards`) first
   - Then Layer 1-2 (utilities, infrastructure)
   - Then Layer 3 (framework)
   - Then Layer 4 (`@eserstack/cli`) last

4. **Test** — Run `deno task validate` after ALL changes (validates entire monorepo)

5. **Version** — If publishing is affected, use the version-bump script

---

## Tech Stack Reference

| Component | Technology |
|-----------|-----------|
| Runtime | Deno 2.x (TS primary), Go 1.24+ (services), Node.js (npm publishing only) |
| Language | TypeScript (strict mode), Go |
| Package Registry | JSR (primary), npm (secondary — only `@eserstack/cli`) |
| Testing | `@std/assert`, `@std/testing` from Deno standard library |
| Linting | Deno built-in linter with 23 custom rules |
| Formatting | Deno built-in formatter |
| CI/CD | GitHub Actions with Codecov coverage |
| @eserstack/codebase | 20+ hooks including validation, kebab-case, typos, conventional commits |
