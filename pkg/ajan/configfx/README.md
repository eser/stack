# ⚙️ [ajan/configfx](./)

> **eserstack Go library** in the root module `github.com/eser/stack`. Import
> `github.com/eser/stack/pkg/ajan/configfx`. The module is not published for
> `go get`: build inside this repository, or require `github.com/eser/stack`
> with a `replace` directive that points at a checkout.

`configfx` loads configuration into Go structs for services built on ajan. You
describe the configuration with struct tags (key, default, required), and
`configfx` fills the struct from JSON files, `.env` files and system environment
variables, in the order you list them, so a later source overrides an earlier
one. Environment-aware loading picks up files such as `config.production.json`
for the current environment, and every value is converted to its field's type
with an error that names the key when it does not fit.

## Key Features

- **Multiple Configuration Sources**: JSON files, environment files (.env),
  system environment variables, and sources you write yourself
- **Type-Safe Configuration**: Struct-based configuration with compile-time type
  safety
- **Environment-Aware**: Automatic environment-specific configuration file
  loading
- **Nested Configuration**: Support for nested structures, maps, slices and
  pointers
- **Tag-Based Mapping**: Use struct tags to define configuration keys, defaults,
  and requirements
- **Hierarchical Loading**: Configuration values are overridden in the order of
  the sources (for example files, then env files, then system env)
- **Validation**: Required fields and type checking, with errors that name the
  key

## Quick Start

Describe the configuration as a struct and load it from three sources:

```go
package main

import (
	"fmt"
	"os"

	"github.com/eser/stack/pkg/ajan/configfx"
)

type Config struct {
	Server ServerConfig `conf:"server"`
	Debug  bool         `conf:"debug" default:"false"`
}

type ServerConfig struct {
	Host string `conf:"host" default:"localhost"`
	Port int    `conf:"port" default:"8080"`
}

func main() {
	config := &Config{}
	manager := configfx.NewConfigManager()

	err := manager.Load(config,
		manager.FromJSONFile("config.json"),
		manager.FromEnvFile(".env", true),
		manager.FromSystemEnv(true),
	)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	fmt.Printf("%s:%d debug=%t\n", config.Server.Host, config.Server.Port, config.Debug)
}
```

A missing file is skipped, so with no `config.json` and no `.env` the defaults
apply and it prints `localhost:8080 debug=false`. Run it as
`server__port=9090 go run .` and it prints `localhost:9090 debug=false`.

### Using Default Loading

`LoadDefaults` loads the same three sources: `config.json`, `.env` (keys matched
in any case) and the system environment (keys matched in any case):

```go
config := &Config{}
manager := configfx.NewConfigManager()

err := manager.LoadDefaults(config)
if err != nil {
	return fmt.Errorf("load config: %w", err)
}
```

## Configuration Sources

Each source adds its keys to one map, in the order you pass the sources to
`Load`, so a later source overrides an earlier one. `configfx` then fills the
struct from that map.

### 1. JSON Files

**config.json:**

```json
{
  "server": {
    "host": "::",
    "port": 3000
  },
  "database": {
    "url": "postgres://localhost/myapp",
    "max_conns": 20
  },
  "debug": true
}
```

**Loading JSON:**

```go
manager.FromJSONFile("config.json")       // Environment-aware
manager.FromJSONFileDirect("config.json") // Direct file only
manager.FromJSONString(`{"debug": true}`) // A JSON document in a string
```

Nested objects become keys joined with `__` (`server__port`). Numbers keep the
digits they were written with, so `1048576` loads into an `int` field. A `null`
value removes the key and every key under it, so the field falls back to its
`default` tag. When several files set the same array, their items merge by
index. A file must hold one JSON object; anything after it is an error.

### 2. Environment Files (.env)

**.env:**

```bash
server__host=localhost
server__port=8080
database__url=postgres://localhost/myapp_dev
database__max_conns=15
debug=true
```

**Loading Environment Files:**

```go
manager.FromEnvFile(".env", true)        // Environment-aware, case insensitive
manager.FromEnvFileDirect(".env", false) // Direct file, case sensitive
```

The parser reads the dialect of `@std/dotenv`, which `@eserstack/config` uses,
so a file loads to the same values from Go and TypeScript.
`envparser/testdata/dialect.env` is read by both in their tests.

- `KEY=value`, `KEY = value` and `export KEY=value` set a key. Lines starting
  with `#` are comments, and so is `#` after a space in an unquoted value.
- Unquoted values are trimmed and expanded: `${NAME}`, `$NAME`,
  `${NAME:-default}` and `$NAME:-default`. A name resolves to this file's value,
  then to a key an earlier source loaded; a key defined further down the file
  counts. `\$NAME` stays as written.
- Double-quoted values can span lines and are not expanded. `\n`, `\r`, `\t`,
  `\"`, `\'` and `\\` are escapes; any other backslash pair stays as written.
- Single-quoted values are taken as written, up to the next single quote.

The Go reading differs from `@std/dotenv` in four places:

- Keys may contain dots (`server.port=8080`), which configfx maps to nested
  fields, and `KEY: value` works too. `@std/dotenv` skips such keys with a
  warning.
- An unquoted `#` with no space before it stays in the value
  (`URL=http://x/#top`). `@std/dotenv` cuts the value there.
- An undefined name without a default expands to an empty string. `@std/dotenv`
  looks in the process environment and otherwise writes `undefined`.
- Expansion stops after ten passes or when a pass changes nothing, so `A=$A`
  reads as `$A`; `@std/dotenv` loops on it.

### 3. System Environment Variables

```bash
export server__host=production.example.com
export server__port=443
export database__url=postgres://prod-db/myapp
```

**Loading System Environment:**

```go
manager.FromSystemEnv(true) // Case insensitive key matching
```

`FromSystemEnv` reads every variable in the process environment. A variable
whose name matches a key in any case sets that field, so a `DEBUG` variable left
in your shell sets the `debug` field above.

## Environment-Aware Configuration

`FromJSONFile` and `FromEnvFile` read the file you name and the files for the
current environment next to it:

```text
config.json                    # Base configuration
config.production.json         # Overrides for the environment
config.local.json              # Local developer overrides
config.production.local.json   # Local overrides for the environment
```

Set the environment with the `env` variable; it is lowercased, and an unset or
empty value means `development`:

```bash
export env=production
```

The loading order will be:

1. `config.json` (base)
2. `config.{environment}.json` (environment-specific)
3. `config.local.json` (local overrides), skipped when the environment is
   `test`, so local overrides never change test runs
4. `config.{environment}.local.json` (local overrides for the environment)

Each file is optional. The `Direct` variants read only the file you name.

## Struct Tags

configfx uses struct tags to define configuration mapping:

```go
type Config struct {
	// Basic mapping
	Port int `conf:"port"`

	// With default value
	Host string `conf:"host" default:"localhost"`

	// Required field
	APIKey string `conf:"api_key" required:""`

	// Required with a default: a missing value takes the default instead of
	// failing
	Timeout time.Duration `conf:"timeout" default:"30s" required:""`

	// Nested structure
	Database DatabaseConfig `conf:"database"`

	// Anonymous embedding (fields are flattened)
	LogConfig
}

type DatabaseConfig struct {
	URL      string `conf:"url"       required:""`
	MaxConns int    `conf:"max_conns" default:"10"`
}

type LogConfig struct {
	Level string `conf:"log_level" default:"info"`
	File  string `conf:"log_file"`
}
```

### Available Tags

- `conf:"key"`: Maps the field to configuration key
- `default:"value"`: Sets default value if not provided
- `required:""`: Marks field as required (empty value for presence)

A field without a `conf` tag is not loaded. A field with a `conf` tag must be
exported, and an embedded struct pointer must be allocated before `Load`.
Otherwise `Load` returns `ErrUnsettableConfigField` naming the key, whether or
not a value is present.

### Key Naming Convention

Configuration keys use double underscore (`__`) as separator for nested
structures:

```bash
server__host=localhost
server__port=8080
database__url=postgres://localhost/db
database__max_conns=10
```

Keys are matched in any case, so `SERVER__PORT` sets the same field as
`server__port`.

## Advanced Features

### Map Support

configfx supports map fields for dynamic configuration:

```go
type Config struct {
	Features map[string]string `conf:"features"`
	Limits   map[string]int    `conf:"limits"`
}
```

**Configuration:**

```json
{
  "features": {
    "auth": "enabled",
    "cache": "redis"
  },
  "limits": {
    "max_users": 1000,
    "rate_limit": 100
  }
}
```

**Environment variables:**

```bash
features__auth=enabled
features__cache=redis
limits__max_users=1000
limits__rate_limit=100
```

Map keys must be strings, or `Load` returns `ErrUnsupportedConfigType` even when
no value is set. Keys are lowercased (`features__AUTH` becomes
`features["auth"]`). A map value takes any type from Type Support below and
loads from its entry's key; a struct value loads from the keys under its entry
(`targets__openai__model`).

### Anonymous Struct Embedding

Use anonymous structs for composition:

```go
type BaseConfig struct {
	Version string `conf:"version" default:"1.0"`
	Debug   bool   `conf:"debug"   default:"false"`
}

type AppConfig struct {
	BaseConfig // Fields are flattened to root level

	Server ServerConfig `conf:"server"`
}
```

### Type Support

configfx converts each value to the type of its field:

- `string`, `bool` (`strconv.ParseBool`), signed and unsigned integers of every
  size, `float32` and `float64`. A named type such as `type Mode string` loads
  like its underlying type.
- `time.Duration` in Go duration syntax (`30s`, `5m`, `1h`).
- Any type that implements `encoding.TextUnmarshaler`, such as `time.Time` (RFC
  3339), `slog.Level`, `netip.Addr`, `netip.Prefix` and `types.MetricInt`
  (`100K`).
- `any`, which receives the string unchanged.
- A pointer to one of these, and slices and maps of them (see Slices, Pointer
  Fields and Map Support).

A value for any other type, such as `complex128` or `[][]int`, makes `Load`
return `ErrUnsupportedConfigType` naming the key. A field of such a type with no
value and no default is left as it is.

### Slices

A slice field loads from the first of these sources that is set:

1. A comma-separated value at the field's key. Items are trimmed and empty items
   are dropped, so an empty value gives an empty slice and clears the default.
2. Indexed keys such as `paths__0` and `paths__1`, which is how JSON arrays
   arrive, or `items__0__name` for a slice of structs. The highest index sets
   the length and a missing index leaves a zero item. An index of
   `configfx.MaxIndexedSliceLength` (10000) or more makes `Load` return
   `ErrInvalidConfigValue`.
3. The `default` tag, also comma-separated.

```go
type Config struct {
	Paths []string `conf:"paths" default:"/health,/metrics"`
	Ports []int    `conf:"ports"`
}
```

Each of these sets the same values:

```bash
export paths=/health,/ready
export ports=8080,8443
```

```json
{
  "paths": ["/health", "/ready"],
  "ports": [8080, 8443]
}
```

The value at the key wins over indexed keys, so an environment variable such as
`paths=/ready` overrides a JSON array. An item that contains a comma needs
indexed keys (`paths__0`), and a slice of structs takes indexed keys only. An
empty JSON array (`[]`) clears the default like an empty value. With
`required:""`, a slice that none of the sources set makes `Load` return
`ErrMissingRequiredConfigValue`.

### Pointer Fields

```go
type Config struct {
	Port     *int            `conf:"port"`
	Database *DatabaseConfig `conf:"database"`
}
```

`Port` stays nil unless a source or a `default` tag sets it, so you can tell an
unset value from a zero. A pointer to a struct stays nil until a source sets its
key or a key under it (`database__url`); configfx then allocates the struct and
loads it like a nested struct, defaults included. A pointer you allocate before
`Load` is loaded in place. With `required:""`, an absent struct section makes
`Load` return `ErrMissingRequiredConfigValue`.

## API Reference

### ConfigManager

The main configuration manager that handles loading and parsing. It holds no
state; `NewConfigManager` returns one you can reuse for every load.

#### Creating a Manager

```go
func NewConfigManager() *ConfigManager
```

#### Loading Configuration

```go
// Load from multiple sources; i is a non-nil pointer to a struct
func (cl *ConfigManager) Load(i any, resources ...ConfigResource) error

// Load with default sources (config.json, .env, system env)
func (cl *ConfigManager) LoadDefaults(i any) error

// Load into a map instead of struct
func (cl *ConfigManager) LoadMap(resources ...ConfigResource) (*map[string]any, error)

// Get metadata about configuration structure
func (cl *ConfigManager) LoadMeta(i any) (ConfigItemMeta, error)
```

#### Configuration Sources

```go
// JSON sources
func (cl *ConfigManager) FromJSONFile(filename string) ConfigResource
func (cl *ConfigManager) FromJSONFileDirect(filename string) ConfigResource
func (cl *ConfigManager) FromJSONString(jsonStr string) ConfigResource

// Environment file sources
func (cl *ConfigManager) FromEnvFile(filename string, keyCaseInsensitive bool) ConfigResource
func (cl *ConfigManager) FromEnvFileDirect(filename string, keyCaseInsensitive bool) ConfigResource

// System environment
func (cl *ConfigManager) FromSystemEnv(keyCaseInsensitive bool) ConfigResource
```

`ConfigManager` implements the `ConfigLoader` interface, which lists these
methods except `FromJSONString`, for code that takes a loader as a dependency.

### ConfigResource

A function type that loads configuration data:

```go
type ConfigResource func(target *map[string]any) error
```

Write your own to add a source. It sets flattened keys (`server__port`) to
string values:

```go
func fromFlags(port string) configfx.ConfigResource {
	return func(target *map[string]any) error {
		if port != "" {
			(*target)["server__port"] = port
		}

		return nil
	}
}
```

### Error Handling

configfx provides sentinel errors for different failure scenarios. Each error
names the key or file it is about:

```go
if errors.Is(err, configfx.ErrNotStruct) {
	// Target is not a non-nil pointer to a struct
}

if errors.Is(err, configfx.ErrMissingRequiredConfigValue) {
	// Required field is missing
}

if errors.Is(err, configfx.ErrInvalidConfigValue) {
	// A value or a default tag does not parse as the field's type
}

if errors.Is(err, configfx.ErrUnsettableConfigField) {
	// A conf-tagged field is unexported or sits behind a nil embedded pointer
}

if errors.Is(err, configfx.ErrUnsupportedConfigType) {
	// A value is set for a field type configfx cannot parse
}

if errors.Is(err, configfx.ErrFailedToParseJSONFile) {
	// JSON file parsing failed
}

if errors.Is(err, configfx.ErrFailedToParseJSONString) {
	// The string passed to FromJSONString is not one JSON object
}

if errors.Is(err, configfx.ErrFailedToParseEnvFile) {
	// Environment file parsing failed
}
```

## Validating Loaded Values

Tags check presence and type; check ranges and relations between fields in a
method you call after loading:

```go
type Config struct {
	Port int `conf:"port" default:"8080"`
}

func (c *Config) Validate() error {
	if c.Port < 1 || c.Port > 65535 {
		return fmt.Errorf("invalid port: %d", c.Port)
	}

	return nil
}

func loadConfig() (*Config, error) {
	config := &Config{}

	err := configfx.NewConfigManager().LoadDefaults(config)
	if err != nil {
		return nil, fmt.Errorf("load config: %w", err)
	}

	err = config.Validate()
	if err != nil {
		return nil, fmt.Errorf("validate config: %w", err)
	}

	return config, nil
}
```

## Dependencies

configfx uses the following internal packages:

- `ajan/configfx/jsonparser`: JSON parsing functionality
- `ajan/configfx/envparser`: Environment file parsing
- `ajan/lib`: Utility functions for environment handling

## Concurrency

`ConfigManager` holds no state, so goroutines can load different structs at the
same time. `Load` writes into the struct you pass, so finish loading before
other goroutines read it, and treat the loaded struct as read-only afterwards.
To reload, load into a new struct and swap it in.

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- `Load` returns errors instead of panicking or skipping: a conf-tagged field it
  cannot set (unexported, or behind a nil embedded struct pointer) wraps
  `ErrUnsettableConfigField`; a target that is not a non-nil pointer, or a map
  whose struct value embeds a non-struct type, returns `ErrNotStruct`; a field
  type it cannot parse (`complex128`, `[][]int`, interfaces with methods), or a
  map with non-string keys, returns `ErrUnsupportedConfigType`. Export the field
  or remove its `conf` tag, allocate embedded struct pointers before `Load`, and
  change unsupported field types.
- Slice fields load their `default` tag and a comma-separated value at their
  key, and the value at the key wins over indexed keys (`PATHS__0`). An index at
  or above `MaxIndexedSliceLength` (10000) returns `ErrInvalidConfigValue`. Use
  indices 0 to 9999.
- Map values of every supported type are parsed (`map[string]any` gets the
  string, where it got nil, and `map[string]int` its numbers), and structs that
  implement `encoding.TextUnmarshaler`, such as `time.Time`, load from one
  value. Pointer fields such as `Port *int` are set from a source or a default,
  and a pointer to a struct section is allocated when a key under it is set.
  Code that relied on them staying nil checks the loaded value.
- jsonparser keeps the written text of JSON numbers, so `1e3` or `10.0` no
  longer loads into an int field; write integers without a fraction or exponent.
  `null` removes the key and its children so the default applies (it used to set
  the string `<nil>`), and an empty array clears a slice default.

## 🔗 Links

- `go doc github.com/eser/stack/pkg/ajan/configfx`: the API reference generated
  from source
- [ajan/types](../types/README.md): `MetricInt` and `MetricFloat`, which load
  values such as `100K`
- [ajan/lib](../lib/README.md): the environment-aware file names behind
  `FromJSONFile` and `FromEnvFile`
- [eser/stack on GitHub](https://github.com/eser/stack)
