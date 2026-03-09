# eser-go/httpfx

## Overview

**httpfx** package provides a framework for building HTTP services with support for routing, middleware, and OpenAPI
documentation generation.

The documentation below provides an overview of the package, its types, functions, and usage examples. For more detailed
information, refer to the source code and tests.

## Configuration

Configuration struct for the HTTP service:

```go
type Config struct {
	Addr string `conf:"addr" default:":8080"`

	CertString        string        `conf:"cert_string"`
	KeyString         string        `conf:"key_string"`
	ReadHeaderTimeout time.Duration `conf:"read_header_timeout" default:"5s"`
	ReadTimeout       time.Duration `conf:"read_timeout"        default:"10s"`
	WriteTimeout      time.Duration `conf:"write_timeout"       default:"10s"`
	IdleTimeout       time.Duration `conf:"idle_timeout"        default:"120s"`

	InitializationTimeout   time.Duration `conf:"init_timeout"     default:"25s"`
	GracefulShutdownTimeout time.Duration `conf:"shutdown_timeout" default:"5s"`

	SelfSigned bool `conf:"self_signed" default:"false"`

	HealthCheckEnabled bool `conf:"health_check" default:"true"`
	OpenAPIEnabled     bool `conf:"openapi"      default:"true"`
	ProfilingEnabled   bool `conf:"profiling"    default:"false"`
}
```

Example configuration:

```go
config := &httpfx.Config{
	Addr:            ":8080",
	ReadTimeout:     15 * time.Second,
	WriteTimeout:    15 * time.Second,
	IdleTimeout:     60 * time.Second,
	OpenAPIEnabled:  true,
	SelfSigned:      false,
}
```

## API

### NewRouter function

Create a new `Router` object.

```go
// func NewRouter(path string) *RouterImpl

router := httpfx.NewRouter("/")
```

### NewHTTPService function

Creates a new `HTTPService` object based on the provided configuration.

```go
// func NewHTTPService(config *Config, router Router) *HTTPServiceImpl

router := httpfx.NewRouter("/")
hs := httpfx.NewHTTPService(config, router)
```

## Key Features

- HTTP routing with support for path parameters and wildcards
- Middleware support for request/response processing
- OpenAPI documentation generation
- Graceful shutdown handling
- Configurable timeouts and server settings
- Integration with dependency injection
- Support for CORS and security headers
- Request logging and metrics

## Example Usage

```go
func main() {
	// Create router
	router := httpfx.NewRouter("/api")

	// Add routes
	router.Get("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// Add middleware
	router.Use(httpfx.LoggerMiddleware())
	router.Use(httpfx.RecoveryMiddleware())

	// Create and start service
	config := &httpfx.Config{
		Addr: ":8080",
	}
	service := httpfx.NewHTTPService(config, router)

	if err := service.Start(); err != nil {
		log.Fatal(err)
	}
}
```
