module github.com/eser/ajan

go 1.26.7

// Pinned to the root module's toolchain so the bridge builds with the same
// patch release.
toolchain go1.26.10

require github.com/eser/stack v4.1.56+incompatible

require (
	github.com/BurntSushi/toml v1.6.0 // indirect
	github.com/cespare/xxhash/v2 v2.3.0 // indirect
	github.com/expr-lang/expr v1.17.8 // indirect
	github.com/kr/pretty v0.3.1 // indirect
	github.com/oklog/ulid/v2 v2.1.2 // indirect
	github.com/quic-go/qpack v0.6.0 // indirect
	github.com/quic-go/quic-go v0.64.1 // indirect
	github.com/santhosh-tekuri/jsonschema/v6 v6.0.3 // indirect
	github.com/tailscale/hujson v0.0.0-20260727124030-b80ff77dac4f // indirect
	go.opentelemetry.io/otel v1.47.0 // indirect
	go.opentelemetry.io/otel/log v1.47.0 // indirect
	go.opentelemetry.io/otel/metric v1.47.0 // indirect
	go.opentelemetry.io/otel/trace v1.47.0 // indirect
	golang.org/x/crypto v0.58.0 // indirect
	golang.org/x/net v0.62.0 // indirect
	golang.org/x/sys v0.50.0 // indirect
	golang.org/x/term v0.48.0 // indirect
	golang.org/x/text v0.44.0 // indirect
	gopkg.in/check.v1 v1.0.0-20201130134442-10cb98267c6c // indirect
	gopkg.in/yaml.v3 v3.0.1 // indirect
)

replace github.com/eser/stack => ../../..

// In-tree fork that compiles the metaschemas on first use instead of in init.
// Read third-party/jsonschema/FORK.md before changing it (decision-56).
replace github.com/santhosh-tekuri/jsonschema/v6 => ../../../third-party/jsonschema
