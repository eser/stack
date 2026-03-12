# eser-go/configfx

## Overview

**configfx** is a powerful and flexible configuration management framework for Go applications that supports multiple
configuration sources, type-safe loading, and environment-aware configuration handling.

## Key Features

- **Multiple Configuration Sources**: JSON files, environment files (.env), system environment variables
- **Type-Safe Configuration**: Struct-based configuration with compile-time type safety
- **Environment-Aware**: Automatic environment-specific configuration file loading
- **Nested Configuration**: Support for complex nested structures and maps
- **Tag-Based Mapping**: Use struct tags to define configuration keys, defaults, and requirements
- **Hierarchical Loading**: Configuration values can be overridden by priority (files → env files → system env)
- **Validation**: Built-in validation for required fields and type checking

## Quick Start

### Basic Usage

```go
package main

import (
    "fmt"
    "log"

    "github.com/eser/stack/apps/services/pkg/eser-go/configfx"
)

// Define your configuration structure
type Config struct {
    Server ServerConfig `conf:"server"`
    Database DatabaseConfig `conf:"database"`
    Debug bool `conf:"debug" default:"false"`
}

type ServerConfig struct {
    Host string `conf:"host" default:"localhost"`
    Port int    `conf:"port" default:"8080" required:""`
}

type DatabaseConfig struct {
    URL      string `conf:"url" required:""`
    MaxConns int    `conf:"max_conns" default:"10"`
}

func main() {
    config := &Config{}

    // Create config manager
    manager := configfx.NewConfigManager()

    // Load configuration from multiple sources
    err := manager.Load(config,
        manager.FromJSONFile("config.json"),
        manager.FromEnvFile(".env", true),
        manager.FromSystemEnv(true),
    )
    if err != nil {
        log.Fatal("Failed to load configuration:", err)
    }

    fmt.Printf("Server will run on %s:%d\n", config.Server.Host, config.Server.Port)
}
```

### Using Default Loading

For common scenarios, use the simplified default loading:

```go
config := &Config{}
manager := configfx.NewConfigManager()

// Loads config.json, .env files, and system environment variables
err := manager.LoadDefaults(config)
if err != nil {
    log.Fatal("Failed to load configuration:", err)
}
```

## Configuration Sources

configfx supports multiple configuration sources that are loaded in hierarchical order (later sources override earlier
ones):

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
manager.FromJSONFile("config.json")           // Environment-aware
manager.FromJSONFileDirect("config.json")     // Direct file only
```

### 2. Environment Files (.env)

**.env:**

```env
server__host=localhost
server__port=8080
database__url=postgres://localhost/myapp_dev
database__max_conns=15
debug=true
```

**Loading Environment Files:**

```go
manager.FromEnvFile(".env", true)           // Environment-aware, case insensitive
manager.FromEnvFileDirect(".env", false)    // Direct file, case sensitive
```

### 3. System Environment Variables

```bash
export server__host=production.example.com
export server__port=443
export database__url=postgres://prod-db/myapp
```

**Loading System Environment:**

```go
manager.FromSystemEnv(true)  // Case insensitive key matching
```

## Environment-Aware Configuration

configfx automatically handles environment-specific configuration files:

```
config.json              # Base configuration
config.development.json  # Development overrides
config.production.json   # Production overrides
config.local.json        # Local developer overrides
```

Set the environment using:

```bash
export env=production
```

The loading order will be:

1. `config.json` (base)
2. `config.{environment}.json` (environment-specific)
3. `config.local.json` (local overrides)

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

    // Required with default (default only used if not required)
    Timeout time.Duration `conf:"timeout" default:"30s" required:""`

    // Nested structure
    Database DatabaseConfig `conf:"database"`

    // Anonymous embedding (fields are flattened)
    LogConfig
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

### Key Naming Convention

Configuration keys use double underscore (`__`) as separator for nested structures:

```
server__host=localhost
server__port=8080
database__url=postgres://localhost/db
database__max_conns=10
```

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

```env
features__auth=enabled
features__cache=redis
limits__max_users=1000
limits__rate_limit=100
```

### Anonymous Struct Embedding

Use anonymous structs for composition:

```go
type BaseConfig struct {
    Version string `conf:"version" default:"1.0"`
    Debug   bool   `conf:"debug" default:"false"`
}

type AppConfig struct {
    BaseConfig  // Fields are flattened to root level

    Server ServerConfig `conf:"server"`
}
```

### Type Support

configfx supports automatic type conversion for:

- Basic types: `string`, `int`, `int64`, `float64`, `bool`
- Time durations: `time.Duration` (e.g., "30s", "5m", "1h")
- Slices and arrays: Comma-separated values
- Custom types implementing `encoding.TextUnmarshaler`

## API Reference

### ConfigManager

The main configuration manager that handles loading and parsing.

#### Creating a Manager

```go
func NewConfigManager() *ConfigManager
```

#### Loading Configuration

```go
// Load from multiple sources
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
// JSON file sources
func (cl *ConfigManager) FromJSONFile(filename string) ConfigResource
func (cl *ConfigManager) FromJSONFileDirect(filename string) ConfigResource

// Environment file sources
func (cl *ConfigManager) FromEnvFile(filename string, keyCaseInsensitive bool) ConfigResource
func (cl *ConfigManager) FromEnvFileDirect(filename string, keyCaseInsensitive bool) ConfigResource

// System environment
func (cl *ConfigManager) FromSystemEnv(keyCaseInsensitive bool) ConfigResource
```

### ConfigResource

A function type that loads configuration data:

```go
type ConfigResource func(target *map[string]any) error
```

### Error Handling

configfx provides sentinel errors for different failure scenarios:

```go
import "errors"

if errors.Is(err, configfx.ErrNotStruct) {
    // Target is not a struct pointer
}

if errors.Is(err, configfx.ErrMissingRequiredConfigValue) {
    // Required field is missing
}

if errors.Is(err, configfx.ErrFailedToParseJSONFile) {
    // JSON file parsing failed
}

if errors.Is(err, configfx.ErrFailedToParseEnvFile) {
    // Environment file parsing failed
}
```

## Best Practices

### 1. Configuration Structure Organization

```go
// Group related configuration
type Config struct {
    App      AppConfig      `conf:"app"`
    Server   ServerConfig   `conf:"server"`
    Database DatabaseConfig `conf:"database"`
    Cache    CacheConfig    `conf:"cache"`
    External ExternalConfig `conf:"external"`
}

// Use descriptive names and sensible defaults
type ServerConfig struct {
    Host         string        `conf:"host" default:"::"`
    Port         int           `conf:"port" default:"8080"`
    ReadTimeout  time.Duration `conf:"read_timeout" default:"30s"`
    WriteTimeout time.Duration `conf:"write_timeout" default:"30s"`
    TLS          TLSConfig     `conf:"tls"`
}
```

### 2. Environment-Specific Configuration

```go
// Use environment-aware loading for different deployments
err := manager.Load(config,
    manager.FromJSONFile("config.json"),        // Base config
    manager.FromEnvFile(".env", true),          // Environment overrides
    manager.FromSystemEnv(true),                // Runtime overrides
)
```

### 3. Validation and Required Fields

```go
type DatabaseConfig struct {
    // Always require critical configuration
    URL      string `conf:"url" required:""`
    Username string `conf:"username" required:""`
    Password string `conf:"password" required:""`

    // Provide sensible defaults for optional settings
    MaxConns    int           `conf:"max_conns" default:"10"`
    Timeout     time.Duration `conf:"timeout" default:"30s"`
    SSLMode     string        `conf:"ssl_mode" default:"prefer"`
}
```

### 4. Configuration Validation

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

// After loading
config := &Config{}
err := manager.LoadDefaults(config)
if err != nil {
    return err
}

if err := config.Validate(); err != nil {
    return fmt.Errorf("configuration validation failed: %w", err)
}
```

## Integration Examples

### With HTTP Server

```go
type ServerConfig struct {
    Host string `conf:"host" default:"localhost"`
    Port int    `conf:"port" default:"8080"`
    TLS  bool   `conf:"tls" default:"false"`
}

func (c *ServerConfig) Address() string {
    return fmt.Sprintf("%s:%d", c.Host, c.Port)
}

// Usage
config := &Config{}
manager.LoadDefaults(config)
server := http.Server{Addr: config.Server.Address()}
```

### With Database

```go
type DatabaseConfig struct {
    Driver   string `conf:"driver" default:"postgres"`
    Host     string `conf:"host" default:"localhost"`
    Port     int    `conf:"port" default:"5432"`
    Database string `conf:"database" required:""`
    Username string `conf:"username" required:""`
    Password string `conf:"password" required:""`
}

func (c *DatabaseConfig) DSN() string {
    return fmt.Sprintf("%s://%s:%s@%s:%d/%s",
        c.Driver, c.Username, c.Password, c.Host, c.Port, c.Database)
}
```

### Configuration Hot Reloading

```go
import "github.com/fsnotify/fsnotify"

func watchConfig(configFile string, config *Config, manager *configfx.ConfigManager) {
    watcher, err := fsnotify.NewWatcher()
    if err != nil {
        log.Fatal(err)
    }
    defer watcher.Close()

    watcher.Add(configFile)

    for {
        select {
        case event := <-watcher.Events:
            if event.Op&fsnotify.Write == fsnotify.Write {
                log.Println("Config file changed, reloading...")
                err := manager.LoadDefaults(config)
                if err != nil {
                    log.Printf("Failed to reload config: %v", err)
                }
            }
        }
    }
}
```

## Dependencies

configfx uses the following internal packages:

- `eser-go/configfx/jsonparser`: JSON parsing functionality
- `eser-go/configfx/envparser`: Environment file parsing
- `eser-go/lib`: Utility functions for environment handling

## Thread Safety

The ConfigManager is safe for concurrent use during the loading phase, but the loaded configuration structs should be
treated as immutable after loading to ensure thread safety.
