.PHONY: help init ok fix test test-watch lint fmt check build docs docs-lint clean repl container version-bump tag release go-ok go-test go-lint go-fmt go-build

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
	deno run -A pkg/@eser/codebase/versions.ts $(TYPE)

tag: ## Create and push a release tag from VERSION file
	deno run -A pkg/@eser/codebase/release-tag.ts

release: ## Sync CHANGELOG to GitHub Releases
	deno run -A pkg/@eser/codebase/release-notes.ts

go-ok: ## Run Go validation (fmt, vet, lint, tests)
	cd apps/services && $(MAKE) ok

go-test: ## Run Go tests with race detector
	cd apps/services && $(MAKE) test

go-lint: ## Run Go linter (golangci-lint)
	cd apps/services && $(MAKE) lint

go-fmt: ## Run Go formatter (gofmt)
	cd apps/services && $(MAKE) fix

go-build: ## Build Go binaries
	cd apps/services && $(MAKE) build
