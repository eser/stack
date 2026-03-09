# eser-go/types

## Overview

**types** is a collection of custom Go types that provide enhanced functionality for common use cases in configuration,
metrics, and data handling. The package focuses on types that support text marshaling/unmarshalling with intelligent
parsing capabilities.

## Key Features

- **Metric Types**: Integer and float types with unit suffix support (k, m, b)
- **Text Marshaling**: Full support for encoding/decoding to/from text formats
- **Configuration-Friendly**: Designed to work seamlessly with configuration systems
- **Unit Parsing**: Automatic parsing of human-readable metric values

## API Reference

### MetricInt

A 64-bit integer type that supports parsing metric values with unit suffixes.

```go
type MetricInt int64
```

#### Supported Units

- `k` or `K`: Thousands (×1,000)
- `m` or `M`: Millions (×1,000,000)
- `b` or `B`: Billions (×1,000,000,000)
- No suffix: Raw value

#### Methods

```go
func (m *MetricInt) UnmarshalText(text []byte) error
func (m MetricInt) MarshalText() ([]byte, error)
```

#### Usage Examples

```go
import "github.com/eser/stack/apps/services/pkg/eser-go/types"

// Parsing from text
var memory types.MetricInt
err := memory.UnmarshalText([]byte("4k"))
// memory = 4000

err = memory.UnmarshalText([]byte("2.5m"))
// memory = 2500000

err = memory.UnmarshalText([]byte("1b"))
// memory = 1000000000

err = memory.UnmarshalText([]byte("100"))
// memory = 100

// Marshaling to text
memory = types.MetricInt(4000)
text, err := memory.MarshalText()
// text = "4000"

// Use in configuration structs
type Config struct {
    MaxMemory     types.MetricInt `conf:"max_memory" default:"512m"`
    MaxConnections types.MetricInt `conf:"max_connections" default:"1k"`
    CacheSize     types.MetricInt `conf:"cache_size" default:"100m"`
}

// Configuration values can be:
// max_memory=512m      → 512,000,000
// max_connections=1k   → 1,000
// cache_size=100m      → 100,000,000
```

### MetricFloat

A 64-bit float type that supports parsing metric values with unit suffixes.

```go
type MetricFloat float64
```

#### Supported Units

- `k` or `K`: Thousands (×1,000)
- `m` or `M`: Millions (×1,000,000)
- `b` or `B`: Billions (×1,000,000,000)
- No suffix: Raw value

#### Methods

```go
func (m *MetricFloat) UnmarshalText(text []byte) error
func (m MetricFloat) MarshalText() ([]byte, error)
```

#### Usage Examples

```go
import "github.com/eser/stack/apps/services/pkg/eser-go/types"

// Parsing from text
var rate types.MetricFloat
err := rate.UnmarshalText([]byte("1.5k"))
// rate = 1500.0

err = rate.UnmarshalText([]byte("2.75m"))
// rate = 2750000.0

err = rate.UnmarshalText([]byte("0.5b"))
// rate = 500000000.0

err = rate.UnmarshalText([]byte("99.9"))
// rate = 99.9

// Marshaling to text
rate = types.MetricFloat(1500.5)
text, err := rate.MarshalText()
// text = "1500.500000"

// Use in configuration structs
type PerformanceConfig struct {
    RequestsPerSecond types.MetricFloat `conf:"requests_per_second" default:"1k"`
    MemoryLimit       types.MetricFloat `conf:"memory_limit" default:"1.5b"`
    ErrorRate         types.MetricFloat `conf:"error_rate" default:"0.01"`
}

// Configuration values can be:
// requests_per_second=1k    → 1000.0
// memory_limit=1.5b         → 1500000000.0
// error_rate=0.01           → 0.01
```

## Configuration Integration

The metric types are designed to work seamlessly with configuration systems:

### With configfx

```go
import (
    "github.com/eser/stack/apps/services/pkg/eser-go/configfx"
    "github.com/eser/stack/apps/services/pkg/eser-go/types"
)

type DatabaseConfig struct {
    MaxConnections    types.MetricInt   `conf:"max_connections" default:"100"`
    MaxIdleConnections types.MetricInt  `conf:"max_idle_connections" default:"10"`
    ConnectionTimeout types.MetricFloat `conf:"connection_timeout" default:"30.5"`
    PoolSize         types.MetricInt   `conf:"pool_size" default:"1k"`
}

type AppConfig struct {
    Database DatabaseConfig `conf:"database"`
}

// In config.json:
{
  "database": {
    "max_connections": "500",
    "max_idle_connections": "50",
    "connection_timeout": "60.0",
    "pool_size": "2k"
  }
}

// In environment variables:
DATABASE__MAX_CONNECTIONS=1k
DATABASE__POOL_SIZE=5k
DATABASE__CONNECTION_TIMEOUT=45.5

// Load configuration
config := &AppConfig{}
manager := configfx.NewConfigManager()
err := manager.LoadDefaults(config)

// Access parsed values
fmt.Printf("Max connections: %d\n", int64(config.Database.MaxConnections))
// Output: Max connections: 1000

fmt.Printf("Pool size: %d\n", int64(config.Database.PoolSize))
// Output: Pool size: 5000
```

### With JSON Marshaling

```go
import (
    "encoding/json"
    "github.com/eser/stack/apps/services/pkg/eser-go/types"
)

type Metrics struct {
    TotalRequests types.MetricInt   `json:"total_requests"`
    AverageLatency types.MetricFloat `json:"average_latency"`
}

// Marshaling to JSON
metrics := Metrics{
    TotalRequests:  types.MetricInt(1500000),
    AverageLatency: types.MetricFloat(250.5),
}

data, err := json.Marshal(metrics)
// data = {"total_requests":"1500000","average_latency":"250.500000"}

// Unmarshalling from JSON with units
jsonData := `{
    "total_requests": "1.5m",
    "average_latency": "250.5"
}`

var metrics Metrics
err = json.Unmarshal([]byte(jsonData), &metrics)
// metrics.TotalRequests = 1500000
// metrics.AverageLatency = 250.5
```

## Real-World Examples

### Server Configuration

```go
type ServerConfig struct {
    // Memory limits
    MaxMemory        types.MetricInt `conf:"max_memory" default:"1b"`
    CacheSize        types.MetricInt `conf:"cache_size" default:"100m"`

    // Connection limits
    MaxConnections   types.MetricInt `conf:"max_connections" default:"1k"`
    MaxIdleConns     types.MetricInt `conf:"max_idle_conns" default:"100"`

    // Performance thresholds
    RequestTimeout   types.MetricFloat `conf:"request_timeout" default:"30.0"`
    MaxRequestRate   types.MetricFloat `conf:"max_request_rate" default:"1k"`
}

// Environment configuration:
// MAX_MEMORY=2b              → 2,000,000,000 bytes
// CACHE_SIZE=256m            → 256,000,000 bytes
// MAX_CONNECTIONS=5k         → 5,000 connections
// REQUEST_TIMEOUT=45.5       → 45.5 seconds
// MAX_REQUEST_RATE=2.5k      → 2,500 requests/sec
```

### Monitoring Configuration

```go
type MonitoringConfig struct {
    // Metric collection intervals
    ScrapeInterval    types.MetricFloat `conf:"scrape_interval" default:"15.0"`
    RetentionPeriod   types.MetricInt   `conf:"retention_period" default:"7"`

    // Storage limits
    MaxSeries         types.MetricInt   `conf:"max_series" default:"1m"`
    MaxSamples        types.MetricInt   `conf:"max_samples" default:"50m"`

    // Alert thresholds
    ErrorRateThreshold  types.MetricFloat `conf:"error_rate_threshold" default:"0.05"`
    LatencyThreshold    types.MetricFloat `conf:"latency_threshold" default:"1000.0"`
}

// Configuration file:
# monitoring.yaml
scrape_interval: 30.0
retention_period: 30
max_series: 10m
max_samples: 500m
error_rate_threshold: 0.01
latency_threshold: 500.0
```

### Database Pool Configuration

```go
type PoolConfig struct {
    MinSize          types.MetricInt   `conf:"min_size" default:"5"`
    MaxSize          types.MetricInt   `conf:"max_size" default:"100"`
    MaxIdleTime      types.MetricFloat `conf:"max_idle_time" default:"300.0"`
    ConnectionTimeout types.MetricFloat `conf:"connection_timeout" default:"30.0"`
}

// Environment variables:
// POOL_MIN_SIZE=10
// POOL_MAX_SIZE=1k           → 1,000 connections
// POOL_MAX_IDLE_TIME=600.0   → 10 minutes
// POOL_CONNECTION_TIMEOUT=60.0 → 1 minute
```

## Error Handling

The types package provides sentinel errors for error checking:

```go
import (
    "errors"
    "github.com/eser/stack/apps/services/pkg/eser-go/types"
)

var value types.MetricInt
err := value.UnmarshalText([]byte("invalid"))

if errors.Is(err, types.ErrFailedToParseFloat) {
    // Handle parsing error
    fmt.Printf("Failed to parse metric value: %v\n", err)
}

// Example error messages:
// "failed to parse float (base=\"invalid\"): strconv.ParseFloat: parsing \"invalid\": invalid syntax"
```

## Type Conversion

Convert between metric types and standard Go types:

```go
// MetricInt to standard types
var metricInt types.MetricInt = 1500
intValue := int(metricInt)           // 1500
int64Value := int64(metricInt)       // 1500

// MetricFloat to standard types
var metricFloat types.MetricFloat = 1500.5
floatValue := float64(metricFloat)   // 1500.5
intValue := int(metricFloat)         // 1500 (truncated)

// Standard types to metric types
standardInt := 1000
metricInt = types.MetricInt(standardInt)

standardFloat := 1500.75
metricFloat = types.MetricFloat(standardFloat)
```

## Best Practices

### 1. Use in Configuration Structs

```go
// Prefer metric types for any numeric configuration that might benefit from units
type Config struct {
    // Good: Memory values often use units
    MaxMemory     types.MetricInt `conf:"max_memory" default:"512m"`

    // Good: Connection counts often use k suffix
    MaxConns      types.MetricInt `conf:"max_conns" default:"1k"`

    // Good: Rates often use decimal values with units
    RequestRate   types.MetricFloat `conf:"request_rate" default:"1.5k"`

    // Less useful: Simple boolean flags don't need metric types
    Debug         bool `conf:"debug" default:"false"`
}
```

### 2. Provide Sensible Defaults

```go
// Always provide reasonable defaults with appropriate units
type ServerConfig struct {
    MemoryLimit   types.MetricInt   `conf:"memory_limit" default:"1b"`    // 1GB
    MaxConns      types.MetricInt   `conf:"max_conns" default:"1k"`       // 1000
    Timeout       types.MetricFloat `conf:"timeout" default:"30.0"`       // 30 seconds
}
```

### 3. Document Expected Units

```go
type Config struct {
    // MaxMemory sets the maximum memory usage in bytes.
    // Supports units: k (thousands), m (millions), b (billions)
    // Examples: "512m" = 512MB, "2b" = 2GB
    MaxMemory types.MetricInt `conf:"max_memory" default:"512m"`

    // RequestRate sets the maximum requests per second.
    // Supports decimal values with units: k, m, b
    // Examples: "1.5k" = 1500 req/s, "0.5m" = 500k req/s
    RequestRate types.MetricFloat `conf:"request_rate" default:"1k"`
}
```

### 4. Validation After Parsing

```go
type Config struct {
    MaxConns types.MetricInt `conf:"max_conns" default:"100"`
}

func (c *Config) Validate() error {
    if c.MaxConns < 1 {
        return errors.New("max_conns must be at least 1")
    }

    if c.MaxConns > 10000 {
        return errors.New("max_conns cannot exceed 10000")
    }

    return nil
}
```

## Dependencies

- Standard library only: `strconv`, `fmt`, `math`, `errors`

## Thread Safety

All types in this package are safe for concurrent access. The parsing functions are stateless and can be called
concurrently from multiple goroutines.
