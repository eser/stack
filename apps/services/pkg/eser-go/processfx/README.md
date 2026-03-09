# ProcessFX

ProcessFX is a process and goroutine lifecycle management utility for Go applications that provides graceful shutdown
handling, signal management, and coordinated cleanup of concurrent operations.

## Key Features

- **Graceful Shutdown**: Automatic handling of OS signals (SIGINT, SIGTERM)
- **Goroutine Management**: Named goroutine tracking with lifecycle management
- **Context Propagation**: Automatic context cancellation for clean shutdown
- **Timeout Control**: Configurable shutdown timeout to prevent hanging
- **Wait Group Coordination**: Automatic synchronization of concurrent operations
- **Structured Logging**: Integration with LogFX for comprehensive process monitoring
- **Signal Handling**: Robust OS signal interception and processing

## Quick Start

### Basic Usage

```go
package main

import (
    "context"
    "fmt"
    "time"

    "github.com/eser/stack/apps/services/pkg/eser-go/processfx"
    "github.com/eser/stack/apps/services/pkg/eser-go/logfx"
)

func main() {
    ctx := context.Background()
    logger := logfx.NewLogger()

    // Create process manager
    process := processfx.New(ctx, logger)

    // Start background workers
    process.StartGoroutine("worker-1", func(ctx context.Context) error {
        for {
            select {
            case <-ctx.Done():
                return ctx.Err()
            case <-time.After(1 * time.Second):
                fmt.Println("Worker 1 working...")
            }
        }
    })

    process.StartGoroutine("worker-2", func(ctx context.Context) error {
        for {
            select {
            case <-ctx.Done():
                return ctx.Err()
            case <-time.After(2 * time.Second):
                fmt.Println("Worker 2 working...")
            }
        }
    })

    // Wait for shutdown signal
    process.Wait()

    // Gracefully shutdown all workers
    process.Shutdown()

    fmt.Println("Application shutdown complete")
}
```

### With HTTP Server

```go
func main() {
    ctx := context.Background()
    logger := logfx.NewLogger(
        logfx.WithConfig(&logfx.Config{
            Level:      "INFO",
            PrettyMode: true,
            AddSource:  false,
        }),
    )

    process := processfx.New(ctx, logger)

    // Start HTTP server
    server := &http.Server{Addr: ":8080"}

    process.StartGoroutine("http-server", func(ctx context.Context) error {
        go func() {
            <-ctx.Done()
            shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
            defer cancel()
            server.Shutdown(shutdownCtx)
        }()

        if err := server.ListenAndServe(); err != http.ErrServerClosed {
            return err
        }
        return nil
    })

    // Wait and shutdown
    process.Wait()
    process.Shutdown()
}
```

## API Reference

### Process

The main process manager that handles goroutine lifecycle and shutdown coordination.

```go
type Process struct {
    BaseCtx         context.Context
    Ctx             context.Context
    Logger          *logfx.Logger
    Cancel          context.CancelFunc
    Signal          chan os.Signal
    WaitGroups      map[string]*sync.WaitGroup
    ShutdownTimeout time.Duration
}
```

#### Creating a Process

```go
func New(baseCtx context.Context, logger *logfx.Logger) *Process
```

**Parameters:**

- `baseCtx`: Base context for the process (usually `context.Background()`)
- `logger`: LogFX logger instance for structured logging (can be `nil`)

**Returns:**

- `*Process`: Configured process manager

### Starting Goroutines

#### StartGoroutine

Starts a named goroutine with automatic lifecycle management.

```go
func (p *Process) StartGoroutine(name string, fn func(ctx context.Context) error)
```

**Parameters:**

- `name`: Unique name for the goroutine (used for logging and tracking)
- `fn`: Function to execute in the goroutine, receives cancellable context

**Behavior:**

- Automatically adds the goroutine to a wait group
- Provides a cancellable context that signals shutdown
- Logs goroutine start, stop, and error events
- Handles context cancellation gracefully

### Process Control

#### Wait

Blocks until a shutdown signal is received.

```go
func (p *Process) Wait()
```

**Behavior:**

- Blocks until context is cancelled or OS signal received
- Automatically handles SIGINT and SIGTERM signals
- Cleans up signal handlers

#### Shutdown

Gracefully shuts down all managed goroutines.

```go
func (p *Process) Shutdown()
```

**Behavior:**

- Creates shutdown context with timeout
- Waits for all goroutines to complete
- Logs shutdown progress and completion
- Times out after `ShutdownTimeout` duration

## Configuration

### Shutdown Timeout

Control how long the process waits for graceful shutdown:

```go
process := processfx.New(ctx, logger)
process.ShutdownTimeout = 45 * time.Second  // Default: 30 seconds
```

### Signal Handling

ProcessFX automatically handles these OS signals:

- `SIGINT` (Ctrl+C): Interrupt signal
- `SIGTERM`: Termination signal (used by process managers)

## Advanced Usage

### Multiple Workers with Dependencies

```go
func runApplication() {
    ctx := context.Background()
    logger := logfx.NewLogger(
        logfx.WithConfig(&logfx.Config{
            Level:      "INFO",
            PrettyMode: true,
            AddSource:  false,
        }),
    )

    process := processfx.New(ctx, logger)

    // Shared channel for worker communication
    workChan := make(chan string, 100)

    // Producer worker
    process.StartGoroutine("producer", func(ctx context.Context) error {
        ticker := time.NewTicker(1 * time.Second)
        defer ticker.Stop()

        for {
            select {
            case <-ctx.Done():
                close(workChan)
                return ctx.Err()
            case <-ticker.C:
                select {
                case workChan <- fmt.Sprintf("work-%d", time.Now().Unix()):
                    logger.Debug("Produced work item")
                case <-ctx.Done():
                    return ctx.Err()
                }
            }
        }
    })

    // Consumer workers
    for i := 0; i < 3; i++ {
        workerName := fmt.Sprintf("consumer-%d", i)
        process.StartGoroutine(workerName, func(ctx context.Context) error {
            for {
                select {
                case <-ctx.Done():
                    return ctx.Err()
                case work, ok := <-workChan:
                    if !ok {
                        logger.Info("Work channel closed", "worker", workerName)
                        return nil
                    }

                    logger.Info("Processing work", "worker", workerName, "item", work)
                    time.Sleep(500 * time.Millisecond) // Simulate work
                }
            }
        })
    }

    // Wait and shutdown
    process.Wait()
    process.Shutdown()
}
```

### Database Connection Management

```go
func runWithDatabase() {
    ctx := context.Background()
    logger := logfx.NewLogger(
        logfx.WithConfig(&logfx.Config{
            Level:      "INFO",
            PrettyMode: true,
            AddSource:  false,
        }),
    )

    process := processfx.New(ctx, logger)

    // Initialize database connection
    db, err := sql.Open("postgres", "postgres://localhost/mydb")
    if err != nil {
        logger.Error("Failed to connect to database", "error", err)
        return
    }

    // Database cleanup worker
    process.StartGoroutine("db-cleanup", func(ctx context.Context) error {
        ticker := time.NewTicker(5 * time.Minute)
        defer ticker.Stop()

        for {
            select {
            case <-ctx.Done():
                logger.Info("Closing database connection")
                db.Close()
                return ctx.Err()
            case <-ticker.C:
                logger.Debug("Running database cleanup")
                db.Exec("DELETE FROM sessions WHERE expires_at < NOW()")
            }
        }
    })

    // Main application worker
    process.StartGoroutine("app-worker", func(ctx context.Context) error {
        // Main application logic using db
        return nil
    })

    process.Wait()
    process.Shutdown()
}
```

### Integration with HTTP Server

```go
func runHTTPServer() {
    ctx := context.Background()
    logger := logfx.NewLogger(
        logfx.WithConfig(&logfx.Config{
            Level:      "INFO",
            PrettyMode: true,
            AddSource:  false,
        }),
    )

    process := processfx.New(ctx, logger)

    // HTTP server setup
    mux := http.NewServeMux()
    mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
        w.WriteHeader(http.StatusOK)
        w.Write([]byte("OK"))
    })

    server := &http.Server{
        Addr:    ":8080",
        Handler: mux,
    }

    // HTTP server worker
    process.StartGoroutine("http-server", func(ctx context.Context) error {
        // Shutdown handler
        go func() {
            <-ctx.Done()
            logger.Info("Shutting down HTTP server")

            shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
            defer cancel()

            if err := server.Shutdown(shutdownCtx); err != nil {
                logger.Error("HTTP server shutdown error", "error", err)
            }
        }()

        logger.Info("Starting HTTP server", "addr", server.Addr)

        if err := server.ListenAndServe(); err != http.ErrServerClosed {
            return fmt.Errorf("HTTP server error: %w", err)
        }

        return nil
    })

    // Background metrics collection
    process.StartGoroutine("metrics", func(ctx context.Context) error {
        ticker := time.NewTicker(30 * time.Second)
        defer ticker.Stop()

        for {
            select {
            case <-ctx.Done():
                return ctx.Err()
            case <-ticker.C:
                logger.Info("Collecting metrics",
                    "goroutines", runtime.NumGoroutine(),
                    "memory", runtime.MemStats{}.Alloc,
                )
            }
        }
    })

    process.Wait()
    process.Shutdown()
}
```

## Error Handling

### Goroutine Error Handling

ProcessFX automatically handles goroutine errors:

```go
process.StartGoroutine("failing-worker", func(ctx context.Context) error {
    // Simulate work that might fail
    time.Sleep(2 * time.Second)

    if someCondition {
        return errors.New("worker failed")
    }

    return nil
})
```

**Error Behavior:**

- Errors are automatically logged with context
- Process continues running other goroutines
- Context cancellation errors are handled gracefully
- Failed goroutines are removed from wait groups

### Custom Error Handling

```go
process.StartGoroutine("custom-error-handling", func(ctx context.Context) error {
    defer func() {
        if r := recover(); r != nil {
            logger.Error("Worker panic recovered", "panic", r)
        }
    }()

    for {
        select {
        case <-ctx.Done():
            return ctx.Err()
        default:
            if err := doWork(); err != nil {
                logger.Error("Work failed, retrying", "error", err)
                time.Sleep(1 * time.Second)
                continue
            }
        }
    }
})
```

## Logging Integration

ProcessFX integrates seamlessly with LogFX for structured logging:

### Automatic Logging

```go
// ProcessFX automatically logs:
// - Goroutine start: "Goroutine starting" (DEBUG level)
// - Goroutine stop: "Goroutine stopped" (DEBUG level)
// - Goroutine errors: "Goroutine error" (ERROR level)
// - Signal reception: "Received OS signal, initiating shutdown..." (INFO level)
// - Shutdown completion: "All services shut down gracefully" (INFO level)
// - Shutdown timeout: "Graceful shutdown timed out..." (WARN level)
```

### Custom Logging

```go
process.StartGoroutine("logged-worker", func(ctx context.Context) error {
    logger.Info("Worker started with custom logging")

    for {
        select {
        case <-ctx.Done():
            logger.Info("Worker received shutdown signal")
            return ctx.Err()
        case <-time.After(5 * time.Second):
            logger.Debug("Worker heartbeat")
        }
    }
})
```

## Best Practices

### 1. Always Use Context

```go
// ✅ Good: Respect context cancellation
process.StartGoroutine("good-worker", func(ctx context.Context) error {
    for {
        select {
        case <-ctx.Done():
            return ctx.Err()
        default:
            // Do work
        }
    }
})

// ❌ Bad: Ignore context
process.StartGoroutine("bad-worker", func(ctx context.Context) error {
    for {
        // This will never stop gracefully
        doWork()
        time.Sleep(1 * time.Second)
    }
})
```

### 2. Handle Cleanup Properly

```go
process.StartGoroutine("cleanup-worker", func(ctx context.Context) error {
    file, err := os.Open("data.txt")
    if err != nil {
        return err
    }
    defer file.Close() // Always cleanup resources

    ticker := time.NewTicker(1 * time.Second)
    defer ticker.Stop() // Cleanup ticker

    for {
        select {
        case <-ctx.Done():
            // Perform any additional cleanup
            return ctx.Err()
        case <-ticker.C:
            // Process file
        }
    }
})
```

### 3. Use Appropriate Timeouts

```go
// Set reasonable shutdown timeout
process := processfx.New(ctx, logger)
process.ShutdownTimeout = 30 * time.Second // Adjust based on your needs

// For workers that need time to cleanup
process.StartGoroutine("slow-worker", func(ctx context.Context) error {
    for {
        select {
        case <-ctx.Done():
            // Give yourself time to cleanup
            cleanupCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
            defer cancel()

            return performCleanup(cleanupCtx)
        default:
            // Do work
        }
    }
})
```

### 4. Monitor Resource Usage

```go
process.StartGoroutine("resource-monitor", func(ctx context.Context) error {
    ticker := time.NewTicker(30 * time.Second)
    defer ticker.Stop()

    for {
        select {
        case <-ctx.Done():
            return ctx.Err()
        case <-ticker.C:
            var m runtime.MemStats
            runtime.ReadMemStats(&m)

            logger.Info("Resource usage",
                "goroutines", runtime.NumGoroutine(),
                "memory_mb", m.Alloc/1024/1024,
                "gc_cycles", m.NumGC,
            )
        }
    }
})
```

## Integration with Other Modules

### With ConfigFX

```go
type Config struct {
    Process ProcessConfig `conf:"process"`
}

type ProcessConfig struct {
    ShutdownTimeout time.Duration `conf:"shutdown_timeout" default:"30s"`
    Workers         int           `conf:"workers" default:"4"`
}

func main() {
    // Load configuration
    config := &Config{}
    configManager := configfx.NewConfigManager()
    configManager.LoadDefaults(config)

    // Create process with configured timeout
    process := processfx.New(ctx, logger)
    process.ShutdownTimeout = config.Process.ShutdownTimeout

    // Start configured number of workers
    for i := 0; i < config.Process.Workers; i++ {
        process.StartGoroutine(fmt.Sprintf("worker-%d", i), workerFunc)
    }
}
```

### With MetricsFX

```go
func main() {
    metrics := metricsfx.NewMetricsProvider(&metricsfx.Config{})
    workerCounter, _ := metrics.CreateCounter("workers_active", "Number of active workers")

    process := processfx.New(ctx, logger)

    for i := 0; i < 5; i++ {
        process.StartGoroutine(fmt.Sprintf("worker-%d", i), func(ctx context.Context) error {
            workerCounter.Inc(ctx)
            defer workerCounter.Dec(ctx)

            // Worker logic
            return nil
        })
    }
}
```

## Dependencies

- `context`: Standard library context for cancellation
- `os`: Standard library for OS signal handling
- `os/signal`: Standard library for signal management
- `sync`: Standard library for wait groups
- `syscall`: Standard library for system calls
- `time`: Standard library for timeouts
- `github.com/eser/stack/apps/services/pkg/eser-go/logfx`: Structured logging (optional)

## Thread Safety

ProcessFX is designed to be thread-safe:

- Safe to call `StartGoroutine` concurrently
- Safe to call `Wait` and `Shutdown` from any goroutine
- Internal wait groups and atomic operations ensure consistency

## Performance Considerations

- **Low Overhead**: Minimal performance impact on managed goroutines
- **Efficient Cleanup**: Coordinated shutdown minimizes resource leaks
- **Scalable**: Handles hundreds of concurrent goroutines efficiently
- **Memory Efficient**: Uses sync.WaitGroup for coordination without excessive memory usage
