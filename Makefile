.PHONY: help ok check lint fix test test-coverage build tools vuln ajan-lib ajan-lib-check ajan-wasm ajan-wasm-check ajan-all ajan-packages ajan-clean

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
	go build -trimpath -ldflags="-s -w -X main.version=$$(cat VERSION 2>/dev/null || echo dev)" -o bin/eser ./cmd/eser/
	go build -trimpath -ldflags="-s -w -X main.version=$$(cat VERSION 2>/dev/null || echo dev)" -o bin/noskills ./cmd/noskills/

vuln: ## Report known vulnerabilities reachable from both Go modules (needs network)
	go tool govulncheck ./...
	@# The bridge module cannot resolve the root module's tool directive, so
	@# the root-built binary scans it with -C.
	go tool govulncheck -C pkg/@eserstack/ajan ./...

tools: ## Download tool dependencies declared in go.mod
	go mod download

# ─── ajan bridge library ─────────────────────────────────────────────────────
#
# The C-shared library and the WASM modules of the bridge module in
# pkg/@eserstack/ajan, built with Go and a C compiler only (decision-40). The
# target table matches NATIVE_TARGETS and WASM_TARGETS in
# pkg/@eserstack/ajan/targets.ts; pkg/@eserstack/ajan/makefile-targets.test.ts
# keeps the two in step.

AJAN_DIR := pkg/@eserstack/ajan
AJAN_DIST := $(AJAN_DIR)/dist
AJAN_VERSION := $(shell cat VERSION 2>/dev/null || echo dev)
# -s -w strips the symbol table and DWARF info; the library is loaded through
# a C ABI, and a Go panic still prints its stack from the runtime tables.
AJAN_LDFLAGS := -s -w -X main.Version=$(AJAN_VERSION)

AJAN_TARGETS := aarch64-darwin x86_64-darwin aarch64-linux x86_64-linux x86_64-windows

GOOS_aarch64-darwin := darwin
GOARCH_aarch64-darwin := arm64
LIB_aarch64-darwin := libeser_ajan.dylib
NPM_aarch64-darwin := darwin-arm64

GOOS_x86_64-darwin := darwin
GOARCH_x86_64-darwin := amd64
CC_x86_64-darwin := clang -arch x86_64
LIB_x86_64-darwin := libeser_ajan.dylib
NPM_x86_64-darwin := darwin-x64

GOOS_aarch64-linux := linux
GOARCH_aarch64-linux := arm64
CC_aarch64-linux := aarch64-linux-gnu-gcc
LIB_aarch64-linux := libeser_ajan.so
NPM_aarch64-linux := linux-arm64

GOOS_x86_64-linux := linux
GOARCH_x86_64-linux := amd64
CC_x86_64-linux := x86_64-linux-gnu-gcc
LIB_x86_64-linux := libeser_ajan.so
NPM_x86_64-linux := linux-x64

GOOS_x86_64-windows := windows
GOARCH_x86_64-windows := amd64
CC_x86_64-windows := x86_64-w64-mingw32-gcc
LIB_x86_64-windows := libeser_ajan.dll
NPM_x86_64-windows := win32-x64

# The WASM module: <dir>:<file>:<tags>. Only the slim "wasi" profile is built,
# as a c-shared reactor (decision-45).
AJAN_WASM := wasi:eser-ajan.wasm:eserajan_wasi

# Limits of the WASM profile; raising either needs the owner's approval
# (TASK-272).
AJAN_WASM_MAX_BYTES ?= 8000000
AJAN_WASM_MAX_BROTLI_BYTES ?= 1600000
# Packages the WASM profile must not link: aifx and the vendor AI SDKs it
# linked before TASK-279, gRPC and protobuf, QUIC, process spawning and the
# OpenTelemetry SDK.
AJAN_WASM_FORBIDDEN := /aifx$$|anthropic-sdk-go|openai-go|google.golang.org/genai|google.golang.org/grpc|google.golang.org/protobuf|quic-go|^os/exec$$|^net/http$$|go.opentelemetry.io/otel/sdk
# The native library's budget after TASK-279 dropped the vendor AI SDKs
# (decision-55): 14 MB, measured on darwin/arm64 at about 12.6 MB.
AJAN_LIB_MAX_BYTES ?= 14000000
# Packages the native library must not link: the vendor AI SDKs and gRPC.
AJAN_LIB_FORBIDDEN := anthropic-sdk-go|openai-go|google.golang.org/genai|google.golang.org/grpc

# The host's target id, in the arch-os form of the table above.
AJAN_HOST := $(subst arm64,aarch64,$(subst amd64,x86_64,$(shell go env GOARCH)))-$(shell go env GOOS)
TARGET ?= $(AJAN_HOST)

ajan-lib: ## Build the ajan C-shared library for TARGET (default: this host)
	@test -n "$(GOOS_$(TARGET))" || { echo "unknown TARGET=$(TARGET); use one of: $(AJAN_TARGETS)"; exit 1; }
	@mkdir -p $(AJAN_DIST)/$(TARGET)
	@# A cross build needs the target's C compiler; the host build uses the default one.
	cd $(AJAN_DIR) && GOWORK=off CGO_ENABLED=1 GOOS=$(GOOS_$(TARGET)) GOARCH=$(GOARCH_$(TARGET)) \
		$(if $(filter $(TARGET),$(AJAN_HOST)),,$(if $(CC_$(TARGET)),CC="$(CC_$(TARGET))")) \
		go build -trimpath -ldflags="$(AJAN_LDFLAGS)" -buildmode=c-shared -o dist/$(TARGET)/$(LIB_$(TARGET)) .
	@test $$(wc -c < $(AJAN_DIST)/$(TARGET)/$(LIB_$(TARGET))) -gt 1024 || { echo "$(AJAN_DIST)/$(TARGET)/$(LIB_$(TARGET)) is too small; the build is broken"; exit 1; }
	@echo "built $(AJAN_DIST)/$(TARGET)/$(LIB_$(TARGET))"

ajan-wasm: ## Build the ajan WASM reactor of the wasi profile (wasip1)
	@set -e; for spec in $(AJAN_WASM); do \
		dir=$${spec%%:*}; rest=$${spec#*:}; file=$${rest%%:*}; tags=$${rest#*:}; \
		mkdir -p $(AJAN_DIST)/$$dir; \
		(cd $(AJAN_DIR) && GOWORK=off CGO_ENABLED=0 GOOS=wasip1 GOARCH=wasm \
			go build -trimpath -buildmode=c-shared -ldflags="$(AJAN_LDFLAGS)" $${tags:+-tags=$$tags} -o dist/$$dir/$$file .); \
		test $$(wc -c < $(AJAN_DIST)/$$dir/$$file) -gt 1024; \
		echo "built $(AJAN_DIST)/$$dir/$$file"; \
	done

ajan-wasm-check: ajan-wasm ## Check the WASM profile's size and that it links no forbidden package
	@size=$$(wc -c < $(AJAN_DIST)/wasi/eser-ajan.wasm | tr -d ' '); \
	brotli=$$(node -e 'const z=require("node:zlib");process.stdout.write(String(z.brotliCompressSync(require("node:fs").readFileSync(process.argv[1]),{params:{[z.constants.BROTLI_PARAM_QUALITY]:11}}).length))' $(AJAN_DIST)/wasi/eser-ajan.wasm); \
	echo "wasi profile: $$size bytes, $$brotli bytes brotli (limits $(AJAN_WASM_MAX_BYTES) and $(AJAN_WASM_MAX_BROTLI_BYTES))"; \
	test $$size -le $(AJAN_WASM_MAX_BYTES) || { echo "the wasi profile is over $(AJAN_WASM_MAX_BYTES) bytes"; exit 1; }; \
	test $$brotli -le $(AJAN_WASM_MAX_BROTLI_BYTES) || { echo "the wasi profile is over $(AJAN_WASM_MAX_BROTLI_BYTES) bytes brotli"; exit 1; }
	@forbidden=$$(cd $(AJAN_DIR) && GOWORK=off GOOS=wasip1 GOARCH=wasm go list -deps -tags eserajan_wasi . | grep -E '$(AJAN_WASM_FORBIDDEN)' || true); \
	test -z "$$forbidden" || { echo "the wasi profile links forbidden packages:"; echo "$$forbidden"; exit 1; }; \
	echo "wasi profile links no forbidden package"

ajan-lib-check: ajan-lib ## Check the native library's size and that it links no AI SDK or gRPC
	@size=$$(wc -c < $(AJAN_DIST)/$(TARGET)/$(LIB_$(TARGET)) | tr -d ' '); \
	echo "$(TARGET) library: $$size bytes (limit $(AJAN_LIB_MAX_BYTES))"; \
	test $$size -le $(AJAN_LIB_MAX_BYTES) || { echo "the $(TARGET) library is over $(AJAN_LIB_MAX_BYTES) bytes"; exit 1; }
	@forbidden=$$(cd $(AJAN_DIR) && GOWORK=off GOOS=$(GOOS_$(TARGET)) GOARCH=$(GOARCH_$(TARGET)) CGO_ENABLED=1 go list -deps . | grep -E '$(AJAN_LIB_FORBIDDEN)' || true); \
	test -z "$$forbidden" || { echo "the $(TARGET) library links forbidden packages:"; echo "$$forbidden"; exit 1; }; \
	echo "$(TARGET) library links no AI SDK or gRPC"

ajan-all: ## Build the ajan library for every target, then the WASM modules
	@set -e; for target in $(AJAN_TARGETS); do $(MAKE) --no-print-directory ajan-lib TARGET=$$target; done
	@$(MAKE) --no-print-directory ajan-wasm

ajan-packages: ## Stage the built libraries into the @eserstack/ajan-* platform packages
	@set -e; staged=0; \
	for target in $(AJAN_TARGETS); do \
		case $$target in \
			aarch64-darwin) lib="$(LIB_aarch64-darwin)"; npm="$(NPM_aarch64-darwin)";; \
			x86_64-darwin) lib="$(LIB_x86_64-darwin)"; npm="$(NPM_x86_64-darwin)";; \
			aarch64-linux) lib="$(LIB_aarch64-linux)"; npm="$(NPM_aarch64-linux)";; \
			x86_64-linux) lib="$(LIB_x86_64-linux)"; npm="$(NPM_x86_64-linux)";; \
			x86_64-windows) lib="$(LIB_x86_64-windows)"; npm="$(NPM_x86_64-windows)";; \
		esac; \
		src=$(AJAN_DIST)/$$target; dest=pkg/@eserstack/ajan-$$npm; \
		if [ -f $$src/$$lib ]; then \
			test -f $$dest/package.json || { echo "$$dest/package.json is missing; the platform packages are committed workspace members"; exit 1; }; \
			cp $$src/$$lib $$dest/; \
			if [ -f $$src/libeser_ajan.h ]; then cp $$src/libeser_ajan.h $$dest/; fi; \
			echo "staged $$dest/$$lib"; staged=$$((staged + 1)); \
		fi; \
	done; \
	for spec in $(AJAN_WASM); do \
		dir=$${spec%%:*}; rest=$${spec#*:}; file=$${rest%%:*}; \
		if [ -f $(AJAN_DIST)/$$dir/$$file ]; then \
			cp $(AJAN_DIST)/$$dir/$$file pkg/@eserstack/ajan-wasm/; \
			echo "staged pkg/@eserstack/ajan-wasm/$$file"; staged=$$((staged + 1)); \
		fi; \
	done; \
	test $$staged -gt 0 || { echo "no platform package was staged; run make ajan-lib or make ajan-wasm first"; exit 1; }

ajan-clean: ## Remove the ajan build output and the staged platform binaries
	rm -rf $(AJAN_DIST)
	rm -f pkg/@eserstack/ajan-*/libeser_ajan.* pkg/@eserstack/ajan-wasm/*.wasm
