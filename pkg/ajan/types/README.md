# 📏 [ajan/types](./)

> **eserstack Go library** in the root module `github.com/eser/stack`. Import
> `github.com/eser/stack/pkg/ajan/types`. The module is not published for
> `go get`: build inside this repository, or require `github.com/eser/stack`
> with a `replace` directive that points at a checkout.

`types` holds number types for configuration and metrics that read
human-readable values. `MetricInt` and `MetricFloat` parse `4k`, `2.5m` and `1b`
as 4,000, 2,500,000 and 1,000,000,000, and write plain digits back. Both
implement `encoding.TextUnmarshaler`, so [configfx](../configfx/README.md) loads
them from config files and environment variables like any other field.

## Key Features

- **Metric Types**: Integer and float types with unit suffix support (k, m, b)
- **Text Marshaling**: Encoding to and decoding from text, plus JSON numbers for
  `MetricInt`
- **Configuration-Friendly**: Loads through configfx like any other field
- **Unit Parsing**: Automatic parsing of human-readable metric values

## Quick Start

Parse a value with `UnmarshalText`, then read it as an `int64`:

```go
package main

import (
	"fmt"
	"os"

	"github.com/eser/stack/pkg/ajan/types"
)

func main() {
	for _, input := range []string{"4k", "2.5m", "1b", "100"} {
		var value types.MetricInt

		err := value.UnmarshalText([]byte(input))
		if err != nil {
			fmt.Fprintln(os.Stderr, err)
			os.Exit(1)
		}

		fmt.Println(input, int64(value), value.HumanReadable())
	}
}
```

It prints:

```text
4k 4000 4K
2.5m 2500000 2.5M
1b 1000000000 1B
100 100 100
```

## Supported Units

Both types read the same suffixes, in either case:

- `k` or `K`: thousands (×1,000)
- `m` or `M`: millions (×1,000,000)
- `b` or `B`: billions (×1,000,000,000)
- No suffix: the raw value

The suffixes are decimal counts: `m` is million, not milli, and `b` is billion,
not bytes. An empty string parses as zero.

## MetricInt

A 64-bit integer type that parses metric values with unit suffixes:

```go
type MetricInt int64
```

A scaled decimal such as `2.5m` is rounded to the nearest integer, so `8.11K`
gives 8110. A plain integer parses exactly. A value outside the int64 range,
`NaN` or `Inf` returns an error wrapping `types.ErrMetricIntOutOfRange`.

Methods:

```go
func (m *MetricInt) UnmarshalText(text []byte) error
func (m *MetricInt) UnmarshalJSON(data []byte) error
func (m *MetricInt) MarshalText() ([]byte, error)
func (m *MetricInt) HumanReadable() string
```

`UnmarshalJSON` accepts a JSON number (`1500`) or a string with a unit
(`"1.5k"`). `MarshalText` writes the digits (`4000`). `HumanReadable` writes the
largest unit with at most one decimal place: `1K`, `1.5M`, `2B`.

## MetricFloat

A 64-bit float type that parses metric values with unit suffixes:

```go
type MetricFloat float64
```

Methods:

```go
func (m *MetricFloat) UnmarshalText(text []byte) error
func (m *MetricFloat) MarshalText() ([]byte, error)
func (m *MetricFloat) HumanReadable() string
```

`1.5k` parses as 1500 and `0.5b` as 500,000,000, with no rounding. `MarshalText`
writes six decimal places (`1500.500000`). `MetricFloat` has no `UnmarshalJSON`,
so `encoding/json` decodes it from a JSON string (`"1.5k"`) and rejects a JSON
number.

## Loading Metric Values With configfx

A metric field in a config struct takes the same text in a `default` tag, a
config file or an environment variable:

```go
type DatabaseConfig struct {
	MaxConnections types.MetricInt   `conf:"max_connections" default:"100"`
	PoolSize       types.MetricInt   `conf:"pool_size"       default:"1k"`
	Timeout        types.MetricFloat `conf:"timeout"         default:"30.5"`
}

type AppConfig struct {
	Database DatabaseConfig `conf:"database"`
}

func loadConfig() (*AppConfig, error) {
	config := &AppConfig{}
	manager := configfx.NewConfigManager()

	err := manager.Load(config, manager.FromSystemEnv(true))
	if err != nil {
		return nil, fmt.Errorf("load config: %w", err)
	}

	return config, nil
}
```

With `database__pool_size=5k` in the environment, `config.Database.PoolSize` is
5000; without it, the default gives 1000. configfx passes JSON numbers to
`UnmarshalText` as text too, so `"pool_size": 2000` and `"pool_size": "2k"` in
`config.json` both load.

## JSON Encoding

`MarshalText` has a pointer receiver, so `encoding/json` calls it only for
values it can address. Marshal a pointer to get the text form:

```go
type Metrics struct {
	TotalRequests  types.MetricInt   `json:"total_requests"`
	AverageLatency types.MetricFloat `json:"average_latency"`
}

metrics := Metrics{TotalRequests: 1500000, AverageLatency: 250.5}

asNumbers, err := json.Marshal(metrics)
// {"total_requests":1500000,"average_latency":250.5}

asText, err := json.Marshal(&metrics)
// {"total_requests":"1500000","average_latency":"250.500000"}
```

Decoding accepts units in strings:

```go
var decoded Metrics

err := json.Unmarshal(
	[]byte(`{"total_requests":"1.5m","average_latency":"250.5"}`),
	&decoded,
)
// decoded.TotalRequests = 1500000, decoded.AverageLatency = 250.5
```

## Error Handling

The package exports two sentinel errors:

- `types.ErrFailedToParseFloat`: the text before the unit is not a number.
- `types.ErrMetricIntOutOfRange`: the scaled value does not fit in an int64.

```go
var value types.MetricInt

err := value.UnmarshalText([]byte("invalid"))
if errors.Is(err, types.ErrFailedToParseFloat) {
	// err.Error() is:
	// failed to parse float (base="invalid"): strconv.ParseFloat: parsing "invalid": invalid syntax
}
```

## Type Conversion

Both types are named numbers, so a conversion moves between them and the
standard types:

```go
var metricInt types.MetricInt = 1500
int64Value := int64(metricInt) // 1500

var metricFloat types.MetricFloat = 1500.5
intValue := int(metricFloat) // 1500 (truncated)

metricInt = types.MetricInt(1000)
metricFloat = types.MetricFloat(1500.75)
```

## Concurrency

The parse functions keep no state, so any number of goroutines can parse at the
same time. A `MetricInt` or `MetricFloat` value is a plain number: share one
between goroutines the way you would share an `int64` or a `float64`.

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- `MetricInt` `UnmarshalText` and `UnmarshalJSON` return an error wrapping
  `ErrMetricIntOutOfRange` for values outside int64, NaN and Inf.

## 🔗 Links

- `go doc github.com/eser/stack/pkg/ajan/types`: the API reference generated
  from source
- [ajan/configfx](../configfx/README.md): loads these types from config files
  and the environment
- [eser/stack on GitHub](https://github.com/eser/stack)
