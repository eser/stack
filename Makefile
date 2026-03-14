.PHONY: help init ok fix test test-watch lint fmt check build docs docs-lint clean repl container version-bump tag release release-notes changelog go-ok go-test go-lint go-fmt go-build

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

init: ## Install dependencies and set up pre-commit hooks
	deno install
	@if [ -f apps/services/go.mod ]; then cd apps/services && go mod download; fi
	pre-commit install

ok: ## Run full validation — Deno + Go (fmt, lint, types, tests)
	deno task validate
	@if [ -f apps/services/Makefile ]; then cd apps/services && $(MAKE) ok; fi

fix: ## Run validation with auto-fix
	deno task validate:fix

test: ## Run tests with coverage
	deno task test:run

test-watch: ## Run tests in watch mode
	deno task test

lint: ## Run linter
	deno lint

fmt: ## Run formatter
	deno fmt

check: ## Type-check all package entry points
	deno task check:mod

build: ## Build npm package
	deno task npm-build

docs: ## Generate HTML documentation
	deno task doc:generate

docs-lint: ## Lint documentation comments
	deno task doc:lint

clean: ## Reset coverage and lock file
	deno task cleanup

repl: ## Start Deno REPL with temporal support
	deno task repl

container: ## Build Docker image
	deno task container:build

version-bump: ## Bump version across all packages (usage: make version-bump TYPE=patch)
	deno run --allow-all ./pkg/@eser/codebase/versions.ts $(TYPE)

tag: ## Create and push a release tag from VERSION file
	deno run --allow-all ./pkg/@eser/codebase/release-tag.ts

release: ## Full release: bump, changelog, commit, tag, push (usage: make release TYPE=patch)
	@if [ -z "$(TYPE)" ]; then echo "Usage: make release TYPE=patch|minor|major"; exit 1; fi
	@if [ -n "$$(git status --porcelain)" ]; then \
		echo "Error: Working tree is dirty. Commit or stash changes first."; \
		git status --short; \
		exit 1; \
	fi
	@UNPUSHED=$$(git log @{u}..HEAD --oneline 2>/dev/null); \
	if [ -n "$$UNPUSHED" ]; then \
		echo "Warning: You have unpushed commits:"; \
		echo "$$UNPUSHED"; \
		printf "Continue? [y/N] "; \
		read -r REPLY; \
		if [ "$$REPLY" != "y" ] && [ "$$REPLY" != "Y" ]; then exit 1; fi; \
	fi
	deno run --allow-all ./pkg/@eser/codebase/versions.ts $(TYPE)
	deno run --allow-all ./pkg/@eser/codebase/changelog-gen.ts
	@VERSION=$$(cat VERSION); \
	git add VERSION CHANGELOG.md pkg/*/deno.json pkg/*/package.json package.json && \
	git commit -m "chore(codebase): release v$$VERSION" && \
	$(MAKE) tag && \
	echo "✓ Released v$$VERSION — CI will validate and publish"

release-notes: ## Sync CHANGELOG to GitHub Releases
	deno run --allow-all ./pkg/@eser/codebase/release-notes.ts

changelog: ## Generate CHANGELOG entry from commits (usage: make changelog)
	deno run --allow-all ./pkg/@eser/codebase/changelog-gen.ts

go-ok: ## Run Go validation (fmt, vet, lint, tests)
	cd apps/services && $(MAKE) ok

go-test: ## Run Go tests with race detector and coverage
	cd apps/services && $(MAKE) test-coverage

go-lint: ## Run Go linter (golangci-lint)
	cd apps/services && $(MAKE) lint

go-fmt: ## Run Go formatter (gofmt)
	cd apps/services && $(MAKE) fix

go-build: ## Build Go binaries
	cd apps/services && $(MAKE) build
