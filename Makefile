.PHONY: help ok check lint fix test test-coverage build tools

help: ## Show available targets
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

ok: check lint test ## Run all Go checks (fmt, vet, lint, test) — no artifacts

check: ## Type-check (go vet + go build)
	go vet ./...
	go build ./...
	@# The ajan module replaces github.com/eser/stack with ../../.., so a root
	@# go.mod change can leave its go.mod/go.sum stale without failing here.
	go mod tidy -diff
	cd pkg/@eserstack/ajan && go mod tidy -diff && go build ./...

lint: ## Run golangci-lint
	go tool golangci-lint run ./...

fix: ## Auto-fix (gofmt + golangci-lint --fix)
	gofmt -w .
	go tool golangci-lint run --fix ./...

test: ## Run tests with race detector (dry-run, no artifacts)
	go test -race ./...

test-coverage: ## Run tests with race detector and coverage report
	go test -race -coverprofile=coverage.out ./...

build: ## Build binaries
	@mkdir -p bin
	go build -o bin/noskills-server ./cmd/noskills-server/
	go build -o bin/noskills ./cmd/noskills/

tools: ## Download tool dependencies declared in go.mod
	go mod download
