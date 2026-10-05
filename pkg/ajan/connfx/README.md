# 🔌 [ajan/connfx](./)

> **eserstack Go library** in the root module `github.com/eser/stack`. Import
> `github.com/eser/stack/pkg/ajan/connfx`. The module is not published for
> `go get`: build inside this repository, or require `github.com/eser/stack`
> with a `replace` directive that points at a checkout.

**connfx** provides a unified connection management system for the external
services an ajan application talks to: SQL databases, PostgreSQL through pgx,
Redis, RabbitMQ (AMQP), HTTP APIs and OpenTelemetry collectors (OTLP). A
`Registry` creates each connection from a `ConfigTarget` through the factory
registered for its protocol, keeps it under a name, checks its health, and
closes every connection at shutdown. The OTLP connection gives
[logfx](../logfx/README.md) the providers that export logs, metrics and traces.

## Key Features

- 🔗 Unified connection management: a single registry for all external
  connections, looked up by name, behavior, capability or protocol
- 🌐 OTLP adapter: one OpenTelemetry Protocol connection that logging, metrics
  and tracing share through logfx
- 🔄 Connection pooling: pool limits for SQL, pgx and Redis connections from the
  connection's configuration
- 🛡️ Health monitoring: a health check per connection, run concurrently for the
  whole registry
- 🎛️ Protocol support: SQL, pgx, Redis, AMQP, HTTP, OTLP, and custom protocols
  through your own factories
- ⚙️ Configuration management: `Config` loads connection targets from config
  files and the environment through configfx
- 🔧 Bridge pattern: logfx declares the `OTLPConnectionResource` interface and
  connfx satisfies it, so neither package imports the other

## Quick Start

Register the built-in factories, add an in-memory SQLite connection, and use the
`*sql.DB` it holds:

```go
package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"

	"github.com/eser/stack/pkg/ajan/connfx"
	_ "modernc.org/sqlite" // registers the "sqlite" database/sql driver
)

func main() {
	err := run(context.Background())
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(ctx context.Context) (err error) {
	registry := connfx.NewRegistry(connfx.WithDefaultFactories())
	defer func() { err = errors.Join(err, registry.Close(ctx)) }()

	_, err = registry.AddConnection(ctx, connfx.DefaultConnection, &connfx.ConfigTarget{
		Protocol: "sqlite",
		DSN:      ":memory:",
	})
	if err != nil {
		return fmt.Errorf("add database connection: %w", err)
	}

	db, err := connfx.GetTypedConnection[*sql.DB](registry, connfx.DefaultConnection)
	if err != nil {
		return fmt.Errorf("get database: %w", err)
	}

	var answer int

	err = db.QueryRowContext(ctx, "SELECT 40 + 2").Scan(&answer)
	if err != nil {
		return fmt.Errorf("query: %w", err)
	}

	fmt.Println("answer:", answer)

	for name, status := range registry.HealthCheck(ctx) {
		fmt.Println(name, status.State, status.Message)
	}

	return nil
}
```

It prints:

```text
answer: 42
default Ready Connected, live and ready (protocol=sqlite, open=1, inuse=0, idle=1)
```

## Configuration

### ConfigTarget

Each connection is described by a `ConfigTarget`. Which fields an adapter reads
is listed under Protocol Support below.

```go
type ConfigTarget struct {
	Properties map[string]any `conf:"properties"`

	Protocol string `conf:"protocol"` // e.g., "postgres", "redis", "http"
	DSN      string `conf:"dsn"`
	URL      string `conf:"url"`
	Host     string `conf:"host"`
	CertFile string `conf:"cert_file"`
	KeyFile  string `conf:"key_file"`
	CAFile   string `conf:"ca_file"`

	Port            int           `conf:"port"`
	MaxOpenConns    int           `conf:"max_open_conns"     default:"10"`
	MaxConnLifetime time.Duration `conf:"max_conn_lifetime"  default:"1h"`
	MaxIdleConns    int           `conf:"max_idle_conns"     default:"5"`
	MaxConnIdleTime time.Duration `conf:"max_conn_idle_time" default:"1m"`
	Timeout         time.Duration `conf:"timeout"`

	TLS           bool `conf:"tls"`
	TLSSkipVerify bool `conf:"tls_skip_verify"`
}
```

The `default` tags apply only when configfx loads the struct. A `ConfigTarget`
you write in Go starts from zero values, and the adapters treat a zero as unset
and use their own defaults.

### Loading Targets With configfx

`Config` holds named targets. Embed it in your config struct, load it, and pass
it to `LoadFromConfig`:

```go
type AppConfig struct {
	Conn connfx.Config `conf:"conn"`
}

func connect(ctx context.Context, registry *connfx.Registry) error {
	config := &AppConfig{}

	err := configfx.NewConfigManager().LoadDefaults(config)
	if err != nil {
		return fmt.Errorf("load config: %w", err)
	}

	return registry.LoadFromConfig(ctx, &config.Conn)
}
```

Under the `conf:"conn"` field, a target named `default` reads its keys from
`conn__targets__default__*`:

```bash
conn__targets__default__protocol=postgres
conn__targets__default__dsn=postgres://app:your_password@localhost:5432/app
conn__targets__default__max_open_conns=25
```

configfx loads `Properties` values as strings, while the adapters read typed
values from it (a `bool`, an `int`, a `time.Duration`, a map). Properties set
from config files or the environment are therefore ignored; set them in Go code.
`LoadFromConfig` adds the targets in no fixed order and stops at the first that
fails, keeping the ones already added.

## Registry

```go
registry := connfx.NewRegistry(
	connfx.WithDefaultFactories(),
	connfx.WithLogger(logger),
)
```

- `WithDefaultFactories()` registers the built-in protocols: `sqlite`,
  `postgres` and `mysql` (through `database/sql`), `pgx`, `http`, `https`,
  `redis`, `amqp` and `otlp`. Without it, register factories yourself with
  `RegisterFactory`.
- `WithLogger(logger)` takes any value with the slog `DebugContext`,
  `InfoContext`, `WarnContext` and `ErrorContext` methods, such as a
  `*logfx.Logger`. The default is `slog.Default()`.

The registry methods:

- `AddConnection(ctx, name, config)` creates a connection through the factory
  for `config.Protocol` and stores it under `name`. The errors wrap
  `ErrConnectionAlreadyExists`, `ErrUnsupportedProtocol` or
  `ErrFailedToCreateConnection`, which wraps the adapter's own error.
- `GetDefault()` and `GetNamed(name)` return a connection, or nil when there is
  none; `connfx.DefaultConnection` is the name `default`.
- `GetByBehavior`, `GetByCapability` and `GetByProtocol` return every matching
  connection.
- `ListConnections()` and `ListRegisteredProtocols()` return names.
- `HealthCheck(ctx)` checks every connection concurrently and returns a map from
  name to `*HealthStatus`.
- `RemoveConnection(ctx, name)` closes one connection and removes it; a close
  error is logged as a warning.
- `Close(ctx)` closes every connection, empties the registry, and returns an
  error wrapping `ErrFailedToCloseConnections` that lists each failure.
- `GetRepository(name)` returns the connection as a `Repository` when it
  implements one. None of the built-in connections do, so it returns
  `ErrInterfaceNotImplemented` for them; use `GetTypedConnection` or the adapter
  accessors instead.

### GetTypedConnection

`GetTypedConnection[T]` returns the raw handle of a named connection as `T`,
with an error instead of a failed type assertion:

```go
db, err := connfx.GetTypedConnection[*sql.DB](registry, "default")
if err != nil {
	return fmt.Errorf("get database: %w", err)
}
```

| Protocol                      | Raw handle `T`             |
| ----------------------------- | -------------------------- |
| `sqlite`, `postgres`, `mysql` | `*sql.DB`                  |
| `pgx`                         | `*pgxpool.Pool`            |
| `redis`                       | `*redis.Client` (go-redis) |
| `amqp`                        | `*connfx.AMQPAdapter`      |
| `http`, `https`               | `*httpclient.Client`       |
| `otlp`                        | `*connfx.OTLPConnection`   |

## Connections

Every connection implements `Connection`:

```go
type Connection interface {
	GetBehaviors() []ConnectionBehavior
	GetCapabilities() []ConnectionCapability
	GetProtocol() string
	GetState() ConnectionState
	HealthCheck(ctx context.Context) *HealthStatus
	Close(ctx context.Context) error
	GetRawConnection() any
}
```

| Adapter | Behaviors            | Capabilities                             |
| ------- | -------------------- | ---------------------------------------- |
| SQL     | stateful             | relational, transactional                |
| pgx     | stateful             | relational, transactional                |
| Redis   | stateful, streaming  | key-value, cache, queue                  |
| AMQP    | stateful, streaming  | queue                                    |
| HTTP    | stateless            | none                                     |
| OTLP    | stateless, streaming | observability, logging, metrics, tracing |

### Health Status

`HealthCheck` returns a `HealthStatus` with the check's `Timestamp`, `Latency`,
`State`, a `Message`, and the `Error` when it failed. The states are
`ConnectionStateNotInitialized`, `Connected`, `Live`, `Ready`, `Disconnected`,
`Error` and `Reconnecting`; `String` returns the name without the prefix
(`Ready`). Each adapter sets the state from its own signals, such as the pool
statistics of a database or the status code of an HTTP API.

## Protocol Support

### SQL Connections

The `sqlite`, `postgres` and `mysql` factories call `sql.Open(protocol, DSN)`,
so import a driver that registers that name: `modernc.org/sqlite` registers
`sqlite`. connfx imports no driver itself.

```go
_, err := registry.AddConnection(ctx, "db", &connfx.ConfigTarget{
	Protocol:        "postgres",
	DSN:             "postgres://app:your_password@localhost:5432/app?sslmode=disable",
	MaxOpenConns:    25,
	MaxIdleConns:    10,
	MaxConnLifetime: 5 * time.Minute,
})
```

`MaxOpenConns`, `MaxIdleConns`, `MaxConnLifetime` and `MaxConnIdleTime` set the
pool when they are above zero. The factory pings the database before it returns.
`*connfx.SQLConnection` also has `GetDB()` and `Stats()`.

### PostgreSQL With pgx

The `pgx` factory parses `DSN` with `pgxpool.ParseConfig` and opens a pool:
`MaxOpenConns` sets the maximum size (default 25), `MaxIdleConns` the minimum
(default 2), and `MaxConnLifetime` and `MaxConnIdleTime` default to 1 hour and
30 minutes. Every connection uses UTC and the application name `connfx_pgx`.
`*connfx.PgxConnection` adds `Query`, `QueryRow`, `Exec`, `BeginTx`,
`BeginTxFunc`, `SendBatch`, `CopyFrom`, `Listen` and `WaitForNotification`.

### Redis Connections

The address comes from `DSN` (`redis://user:your_password@localhost:6379/0`,
`rediss://` for TLS, or `host:port`), or from `Host` and `Port`, defaulting to
`localhost:6379`:

```go
_, err := registry.AddConnection(ctx, "cache", &connfx.ConfigTarget{
	Protocol: "redis",
	DSN:      "redis://localhost:6379/0",
	Properties: map[string]any{
		"pool_size":    20,
		"pool_timeout": 4 * time.Second,
	},
})
```

The properties are `password`, `db`, `max_retries`, `pool_size`,
`min_idle_conns` and `max_idle_conns` (`int`), `conn_max_idle_time` and
`pool_timeout` (`time.Duration`), and `tls_enabled` and
`tls_insecure_skip_verify` (`bool`); `TLS` and `TLSSkipVerify` turn TLS on as
well. `*connfx.RedisConnection` has `GetClient()`, `GetStats()` and
`GetAdapter()`, whose `*RedisAdapter` implements the key-value, cache and stream
queue operations (`Get`, `Set`, `SetWithExpiration`, `Publish`,
`ConsumeWithGroup` and more).

### AMQP Connections

The `amqp` factory connects to the URL in `DSN`, or to
`amqp://guest:guest@localhost:5672/` when it is empty. Its raw handle, an
`*AMQPAdapter`, implements the queue operations (`QueueDeclare`, `Publish`,
`Consume`, `AckMessage`).

### HTTP Connections

The HTTP adapter wraps a resilient [httpclient](../httpclient/README.md) client
with a circuit breaker and retries, for one base URL:

```go
_, err := registry.AddConnection(ctx, "api", &connfx.ConfigTarget{
	Protocol: "https",
	URL:      "https://api.example.com",
	Timeout:  10 * time.Second,
	Properties: map[string]any{
		"headers": map[string]string{
			"Authorization": "Bearer your_access_token",
		},
		"retry_strategy": map[string]any{
			"max_attempts":     4,
			"initial_interval": 250 * time.Millisecond,
		},
	},
})
```

- `Timeout` defaults to 30 seconds. `TLS`, `TLSSkipVerify`, `CertFile` and
  `KeyFile` configure TLS and a client certificate.
- `headers` (`map[string]string` or `map[string]any` of strings) are sent with
  every request. The default `User-Agent: connfx-http-client/1.0` is replaced by
  a `User-Agent` of your own.
- `circuit_breaker` takes `enabled` (`bool`), `failure_threshold` and
  `half_open_success_needed` (`int`) and `reset_timeout` (`time.Duration`). The
  defaults are on, 5 failures, 2 successes and 10 seconds.
- `retry_strategy` takes `enabled` (`bool`), `max_attempts` (`int`),
  `initial_interval` and `max_interval` (`time.Duration`), and `multiplier` and
  `random_factor` (`float64`). The defaults are on, 3 attempts, 100 ms, 10
  seconds, 2.0 and 0.1.
- `server_error_threshold` (`int`, default 500) is the status code from which a
  response counts as a failure.

`AddConnection` sends a `HEAD` request to the base URL (a `GET` when the server
answers 405) and fails when the API is unreachable or answers with a server
error. The health check maps 2xx to Ready, 429 to Live, 503 and the other 4xx
codes to Connected, and the rest to Error.

Send requests through the connection, which joins the path to the base URL and
adds the headers. The body may be nil, a `string`, a `[]byte` or an `io.Reader`:

```go
conn, err := connfx.GetTypedConnection[*httpclient.Client](registry, "api")
if err != nil {
	return fmt.Errorf("get api client: %w", err)
}

httpConn, ok := registry.GetNamed("api").(*connfx.HTTPConnection)
if !ok {
	return fmt.Errorf("connection %q is not HTTP", "api")
}

req, err := httpConn.NewRequest(ctx, http.MethodGet, "/users/123", nil)
if err != nil {
	return fmt.Errorf("build request: %w", err)
}

resp, err := conn.Do(req)
if err != nil {
	return fmt.Errorf("get user: %w", err)
}
defer resp.Body.Close()
```

`*connfx.HTTPConnection` also has `GetClient()`, `GetStandardClient()`,
`GetBaseURL()`, `GetHeaders()` and `GetCircuitBreakerState()`, which returns
`StateClosed`, `StateHalfOpen` or `StateOpen`.

### OTLP Connections

The `otlp` factory creates OTLP/HTTP exporters for logs, metrics and traces that
send to the collector at `DSN` (`host:port`, usually port 4318). It uses plain
HTTP unless `TLS` is true or the `insecure` property is `false`.
`CreateResource` adds the service identity and builds the providers that
[logfx](../logfx/README.md) takes:

```go
conn, err := registry.AddConnection(ctx, "otel", &connfx.ConfigTarget{
	Protocol: "otlp",
	DSN:      "otel-collector:4318",
})
if err != nil {
	return fmt.Errorf("add OTLP connection: %w", err)
}

otlpConn, ok := conn.(*connfx.OTLPConnection)
if !ok {
	return fmt.Errorf("connection %q is not OTLP", "otel")
}

resource, err := otlpConn.CreateResource("my-service", "1.0.0", "production")
if err != nil {
	return fmt.Errorf("create OTLP resource: %w", err)
}

logger.EnableOTLP(resource)
```

The resource batches log records and spans (spans every 5 seconds or 512 at a
time), exports metrics every 30 seconds, and keeps every trace (sampling ratio
1.0). `resource.Close(ctx)` flushes and shuts the providers down; it shuts the
connection's exporters down too, so a later `registry.Close` reports
`HTTP exporter is shutdown` for that connection.

The OTLP health check builds an exporter and does not contact the collector, so
it reports Ready while the collector is down. Export failures appear when the
providers flush, for example in the error from `resource.Close`.

## Custom Connection Adapters

A protocol of your own needs a `ConnectionFactory` and a `Connection`:

```go
type memoryConnection struct {
	store map[string]string
}

func (c *memoryConnection) GetBehaviors() []connfx.ConnectionBehavior {
	return []connfx.ConnectionBehavior{connfx.ConnectionBehaviorStateful}
}

func (c *memoryConnection) GetCapabilities() []connfx.ConnectionCapability {
	return []connfx.ConnectionCapability{connfx.ConnectionCapabilityKeyValue}
}

func (c *memoryConnection) GetProtocol() string              { return "memory" }
func (c *memoryConnection) GetState() connfx.ConnectionState { return connfx.ConnectionStateReady }
func (c *memoryConnection) Close(_ context.Context) error    { return nil }
func (c *memoryConnection) GetRawConnection() any            { return c.store }

func (c *memoryConnection) HealthCheck(_ context.Context) *connfx.HealthStatus {
	return &connfx.HealthStatus{Timestamp: time.Now(), State: connfx.ConnectionStateReady}
}
```

The factory creates the connection from the target and names its protocol:

```go
type memoryFactory struct{}

func (memoryFactory) GetProtocol() string { return "memory" }

func (memoryFactory) CreateConnection(
	_ context.Context,
	_ *connfx.ConfigTarget,
) (connfx.Connection, error) {
	return &memoryConnection{store: map[string]string{}}, nil
}

func registerMemory(registry *connfx.Registry) {
	registry.RegisterFactory(memoryFactory{})
}
```

## Error Handling

Match the registry's errors with `errors.Is`:

```go
_, err := registry.AddConnection(ctx, "cache", target)

switch {
case errors.Is(err, connfx.ErrUnsupportedProtocol):
	// No factory is registered for target.Protocol
case errors.Is(err, connfx.ErrConnectionAlreadyExists):
	// The name is taken; remove the old connection first
case errors.Is(err, connfx.ErrFailedToCreateConnection):
	// The adapter could not connect; the error wraps its cause
}
```

`GetTypedConnection` returns `ErrRegistryIsNil`, `ErrConnectionNotFound`,
`ErrRawConnectionIsNil` or `ErrInvalidType`, which names the expected and the
actual type.

## Best Practices

1. **Centralize OTLP Configuration**: Use a single OTLP connection for all
   observability signals
2. **Environment-Based Config**: Keep DSNs and URLs in config files or
   environment variables, and set the typed `Properties` in code
3. **Health Monitoring**: Serve `registry.HealthCheck` from a health endpoint
4. **Connection Lifecycle**: Always call `registry.Close(ctx)` during
   application shutdown
5. **Error Handling**: Check the error of every `AddConnection`; a connection
   that failed is not in the registry
6. **Resource Management**: Configure appropriate connection pools and timeouts
7. **Security**: Use TLS for production connections, and keep credentials out of
   committed config
8. **Testing**: Register a factory of your own for a fake protocol in tests

## Concurrency

The registry guards its maps with a read-write mutex, so lookups, health checks
and adds can run from several goroutines. `AddConnection` holds the lock while
the factory connects, so other registry calls wait for a slow connection. The
connections report their state with atomic values.

## 🔗 Links

- `go doc github.com/eser/stack/pkg/ajan/connfx`: the API reference generated
  from source
- [ajan/logfx](../logfx/README.md): takes the OTLP resource with `EnableOTLP`
- [ajan/httpclient](../httpclient/README.md): the resilient client inside HTTP
  connections
- [ajan/configfx](../configfx/README.md): loads `Config` from files and the
  environment
- [eser/stack on GitHub](https://github.com/eser/stack)
