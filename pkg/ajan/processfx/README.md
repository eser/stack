# 🔄 [ajan/processfx](./)

> **eserstack Go library** in the root module `github.com/eser/stack`. Import
> `github.com/eser/stack/pkg/ajan/processfx`. The module is not published for
> `go get`: build inside this repository, or require `github.com/eser/stack`
> with a `replace` directive that points at a checkout.

processfx is a process and goroutine lifecycle management utility for Go
applications that provides graceful shutdown handling, signal management, and
coordinated cleanup of concurrent operations. It also runs subprocesses so that
cancelling them stops the whole process tree, and supervises long-running
workers that report liveness through heartbeats.

## Key Features

- **Graceful Shutdown**: Automatic handling of OS signals (SIGINT, SIGTERM)
- **Goroutine Management**: Named goroutine tracking with lifecycle management
- **Context Propagation**: Automatic context cancellation for clean shutdown
- **Timeout Control**: Configurable shutdown timeout to prevent hanging
- **Wait Group Coordination**: Automatic synchronization of concurrent
  operations
- **Structured Logging**: Integration with logfx for process monitoring
- **Signal Handling**: OS signal interception and processing
- **Subprocesses**: `Exec` and `Run` capture output and exit codes, and
  cancellation kills grandchildren too (`HardenCommand`)
- **Supervision**: `Supervisor` restarts a worker that stops sending heartbeats,
  with exponential backoff

## Quick Start

Start the long-running work as named goroutines, then wait for a signal:

```go
package main

import (
	"context"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
	"github.com/eser/stack/pkg/ajan/processfx"
)

func main() {
	logger := logfx.NewLogger(logfx.WithPrettyMode(true))
	process := processfx.New(context.Background(), logger)

	process.StartGoroutine("ticker", func(ctx context.Context) error {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-ticker.C:
				logger.InfoContext(ctx, "tick")
			}
		}
	})

	process.Wait()     // Blocks until SIGINT (Ctrl+C) or SIGTERM
	process.Shutdown() // Waits up to ShutdownTimeout for the goroutines
}
```

It logs `tick` every second. Press Ctrl+C and it logs
`Received OS signal, initiating shutdown...`, then
`All services shut down gracefully.` once the goroutine has returned.

`Wait` and `Shutdown` are separate steps and both are needed: `Wait` blocks
until the context is cancelled, `Shutdown` then waits (bounded by
`ShutdownTimeout`) for the managed goroutines to actually finish. Calling only
`Wait` before returning from `main` races the cleanup goroutines into `os.Exit`.

### With HTTP Server

A server goroutine shuts the server down when the process context ends:

```go
func runHTTPServer(process *processfx.Process, logger *logfx.Logger) {
	server := &http.Server{
		Addr:              ":8080",
		Handler:           http.NewServeMux(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	process.StartGoroutine("http-server", func(ctx context.Context) error {
		go func() {
			<-ctx.Done()

			// The process context has ended, so shutdown needs its own.
			shutdownCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
			defer cancel()

			err := server.Shutdown(shutdownCtx)
			if err != nil {
				logger.ErrorContext(shutdownCtx, "HTTP server shutdown error", "error", err)
			}
		}()

		err := server.ListenAndServe()
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return fmt.Errorf("serve HTTP on %s: %w", server.Addr, err)
		}

		return nil
	})
}
```

[httpfx](../httpfx/README.md) services return a cleanup function from `Start`
instead; call it after `Wait`.

## API Reference

### Process

The main process manager that handles goroutine lifecycle and shutdown
coordination.

```go
type Process struct {
	BaseCtx         context.Context
	Ctx             context.Context
	Logger          *logfx.Logger
	Cancel          context.CancelFunc
	Signal          chan os.Signal
	ShutdownTimeout time.Duration
	// unexported: a single sync.WaitGroup tracking every started goroutine,
	// plus a mutex-guarded name slice for diagnostics (see RunningNames),
	// and the done channel of the signal watcher that Wait waits on.
}
```

`Signal` receives SIGINT and SIGTERM while `Ctx` is live. The process owns it:
`Wait` does not close it, and the signal watcher removes the registration when
`Ctx` ends.

> **Changed:** `WaitGroups map[string]*sync.WaitGroup` was exported and written
> by `StartGoroutine` with no synchronisation, so concurrent starts aborted the
> process with `fatal error: concurrent map writes`, which `recover()` cannot
> catch. It is now an unexported `sync.WaitGroup`. Use `RunningNames()` if you
> need the registered goroutine names.

#### Creating a Process

```go
func New(baseCtx context.Context, logger *logfx.Logger) *Process
```

**Parameters:**

- `baseCtx`: Base context for the process (usually `context.Background()`)
- `logger`: logfx logger instance for structured logging (can be `nil`, which
  turns the process's own log records off)

**Returns:**

- `*Process`: Configured process manager. Its `Ctx` ends on SIGINT, SIGTERM, a
  call to `Cancel`, or the end of `baseCtx`.

### Starting Goroutines

#### StartGoroutine

Starts a named goroutine with automatic lifecycle management.

```go
func (p *Process) StartGoroutine(name string, fn func(ctx context.Context) error)
```

**Parameters:**

- `name`: Name for the goroutine, used in log records and returned by
  `RunningNames`
- `fn`: Function to execute in the goroutine, receives `Ctx`, the process
  context that ends at shutdown

**Behavior:**

- Adds the goroutine to the wait group that `Shutdown` waits on
- Logs the start and the stop at `DEBUG` level
- Logs a returned error at `ERROR` level, except `context.Canceled` and errors
  returned after `baseCtx` has ended
- Does not recover a panic: a panic in `fn` crashes the process, as in any
  goroutine

`RunningNames()` returns the names passed to `StartGoroutine`, for diagnostics.

### Process Control

#### Wait

Blocks until a shutdown signal is received.

```go
func (p *Process) Wait()
```

**Behavior:**

- Blocks until `Ctx` ends: on SIGINT or SIGTERM, a call to `Cancel`, or the end
  of `baseCtx`
- Returns only after the signal handler registered by `New` is removed
- Safe to call more than once

#### Shutdown

Gracefully shuts down all managed goroutines.

```go
func (p *Process) Shutdown()
```

**Behavior:**

- Waits for all goroutines started with `StartGoroutine` to return
- Gives up after `ShutdownTimeout` and logs a warning
- Logs shutdown progress and completion
- Does not cancel `Ctx`: call it after `Wait`, or call `Cancel` first

## Configuration

### Shutdown Timeout

Control how long the process waits for graceful shutdown:

```go
process := processfx.New(ctx, logger)
process.ShutdownTimeout = 45 * time.Second // Default: 30 seconds
```

### Signal Handling

processfx automatically handles these OS signals:

- `SIGINT` (Ctrl+C): Interrupt signal
- `SIGTERM`: Termination signal (used by process managers)

`New` registers the handler, so a signal that arrives before `Wait` still starts
a graceful shutdown. The handler is removed as soon as `Ctx` ends, for any
reason. Code that creates a process and never calls `Wait`, such as a test,
releases the handler by calling `Cancel` or by passing a context that ends
(`t.Context()` in tests):

```go
process := processfx.New(t.Context(), logger)
defer process.Cancel()
```

To simulate a signal in a test, send a value on `Signal`; the process cancels
`Ctx` and logs the signal as it would for a real one:

```go
process.Signal <- os.Interrupt
process.Wait()
```

## Running Commands

`Exec` runs a command string through `sh -c`, and `Run` runs a program with an
argument list and no shell. Both capture standard output and standard error and
block until the command exits:

```go
// func Exec(ctx context.Context, command string, opts ExecOptions) (ExecResult, error)
// func Run(ctx context.Context, command string, args []string, opts ExecOptions) (ExecResult, error)

result, err := processfx.Run(ctx, "git", []string{"status", "--short"}, processfx.ExecOptions{
	Cwd:     repoDir,
	Timeout: 30 * time.Second,
})
if err != nil {
	return fmt.Errorf("run git status: %w", err)
}

if result.Code != 0 {
	return fmt.Errorf("git status exited with %d: %s", result.Code, result.Stderr)
}
```

`ExecOptions` holds:

- `Args`: for `Exec`, arguments after the command string. The first one becomes
  `$0` in the shell and the next one `$1`. `Run` ignores it.
- `Env`: `KEY=VALUE` pairs added to the inherited environment.
- `Cwd`: the working directory; empty means the current one.
- `Stdin`: bytes written to the command's standard input.
- `Timeout`: a limit on the run; zero means none.

`ExecResult` holds `Stdout`, `Stderr` and the exit `Code`. A non-zero exit code
is not an error. A command that cannot start, a timeout or a cancelled context
is returned as the error, together with the output captured so far. `Run` passes
its arguments to the program unchanged; use it whenever part of the command
comes from input, because `Exec` hands the whole string to the shell.

### HardenCommand

`exec.CommandContext` kills only the direct child when the context ends, so a
grandchild (a background job in `sh -c`, a tool that starts another program)
keeps running and holds the output pipes open. `HardenCommand` puts the command
in its own process group and makes cancellation kill the whole group. `Exec` and
`Run` call it; call it yourself on commands you build:

```go
// func HardenCommand(cmd *exec.Cmd)

cmd := exec.CommandContext(ctx, "make", "build")
processfx.HardenCommand(cmd)

err := cmd.Run()
```

Call it before `Start` or `Run`. It sets `WaitDelay` to
`processfx.DefaultWaitDelay` (5 seconds) unless you set one, which bounds how
long `Wait` waits for the pipes after the kill. On Windows it sets no process
group and only the direct child is killed.

## Supervising Workers

A `Supervisor` runs a worker and restarts it when no heartbeat arrives within
`HeartbeatTimeout`. The worker receives a `HeartbeatSender` and calls `Beat`
(alive) or `BeatWithProgress` (alive, with a count of items processed):

```go
func runConsumer(ctx context.Context, logger *logfx.Logger) error {
	config := processfx.DefaultSupervisedConfig("queue-consumer")
	supervisor := processfx.NewSupervisor(config, logger, nil)

	return supervisor.Run(ctx, func(ctx context.Context, hb processfx.HeartbeatSender) error {
		ticker := time.NewTicker(5 * time.Second)
		defer ticker.Stop()

		for {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-ticker.C:
				hb.BeatWithProgress(ctx, 10) // processed 10 items since the last beat
			}
		}
	})
}
```

`DefaultSupervisedConfig` sets a 30 second heartbeat timeout, at most 5
consecutive restarts, and a backoff that starts at 1 second, doubles, and stops
growing at 60 seconds. `Run` checks the config with `Validate`, and returns
`processfx.ErrMaxRestartsExceeded` once the worker exceeds `MaxRestarts`, or the
context's error when `ctx` ends. A heartbeat resets the restart count.

The supervisor tracks a worker only through its heartbeats. A worker that
returns, with or without an error, or panics (the supervisor recovers the panic
and records it as `ErrWorkerPanicked`) is restarted once the heartbeat timeout
passes. Code deeper in the worker gets the sender with
`processfx.HeartbeatFromContext(ctx)`, which returns a no-op sender outside a
supervised worker.

`Status()` returns a `WorkerStatus` with the state (`idle`, `running`, `stuck`,
`restarting` or `failed`), the last heartbeat, restart counts, the last error
and the items processed. A `SupervisorRegistry` collects supervisors for a
health endpoint (`Register`, `IsHealthy`, `Summary`). Pass a `SupervisorMetrics`
implementation to `NewSupervisor` to count heartbeats, restarts, stuck and
failed workers; `nil` records nothing.

## Error Handling

### Goroutine Error Handling

processfx automatically handles goroutine errors:

```go
process.StartGoroutine("failing-worker", func(ctx context.Context) error {
	err := doWork(ctx)
	if err != nil {
		return fmt.Errorf("do work: %w", err)
	}

	return nil
})
```

**Error Behavior:**

- Errors are logged with the goroutine name (`Goroutine error`)
- The process keeps running the other goroutines; an error does not cancel `Ctx`
- `context.Canceled` returned at shutdown is not logged
- A goroutine that returns, with or without an error, no longer holds up
  `Shutdown`

### Custom Error Handling

To keep a goroutine alive after a failure or a panic, handle both inside it:

```go
process.StartGoroutine("custom-error-handling", func(ctx context.Context) error {
	defer func() {
		if r := recover(); r != nil {
			logger.ErrorContext(ctx, "worker panic recovered", "panic", r)
		}
	}()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-time.After(time.Second):
			err := doWork(ctx)
			if err != nil {
				logger.WarnContext(ctx, "work failed, retrying", "error", err)
			}
		}
	}
})
```

## Logging Integration

processfx integrates with logfx for structured logging:

### Automatic Logging

```text
Goroutine start: "Goroutine starting" (DEBUG level)
Goroutine stop: "Goroutine stopped" (DEBUG level)
Goroutine errors: "Goroutine error" (ERROR level)
Signal reception: "Received OS signal, initiating shutdown..." (INFO level)
Shutdown completion: "All services shut down gracefully." (INFO level)
Shutdown timeout: "Graceful shutdown timed out. Some services may not have stopped." (WARN level)
End of Shutdown: "Process shutdown process complete." (INFO level)
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
		case <-time.After(time.Second):
			err := doWork(ctx)
			if err != nil {
				return fmt.Errorf("do work: %w", err)
			}
		}
	}
})

// ❌ Bad: Ignore context
process.StartGoroutine("bad-worker", func(ctx context.Context) error {
	for {
		// This will never stop gracefully
		doWork(ctx)
		time.Sleep(1 * time.Second)
	}
})
```

### 2. Handle Cleanup Properly

```go
process.StartGoroutine("cleanup-worker", func(ctx context.Context) error {
	file, err := os.Open("data.txt")
	if err != nil {
		return fmt.Errorf("open data file: %w", err)
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

Keep `ShutdownTimeout` longer than the slowest cleanup a goroutine runs after
`ctx` ends. Cleanup that needs a context of its own takes one with a deadline,
detached from the cancelled process context:

```go
process.ShutdownTimeout = 30 * time.Second

process.StartGoroutine("slow-worker", func(ctx context.Context) error {
	<-ctx.Done()

	cleanupCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 10*time.Second)
	defer cancel()

	return performCleanup(cleanupCtx)
})
```

## Integration with Other Modules

### With configfx

```go
type ProcessConfig struct {
	ShutdownTimeout time.Duration `conf:"shutdown_timeout" default:"30s"`
	Workers         int           `conf:"workers"          default:"4"`
}

type Config struct {
	Process ProcessConfig `conf:"process"`
}

func startWorkers(ctx context.Context, logger *logfx.Logger) (*processfx.Process, error) {
	config := &Config{}

	err := configfx.NewConfigManager().LoadDefaults(config)
	if err != nil {
		return nil, fmt.Errorf("load config: %w", err)
	}

	process := processfx.New(ctx, logger)
	process.ShutdownTimeout = config.Process.ShutdownTimeout

	for i := range config.Process.Workers {
		process.StartGoroutine(fmt.Sprintf("worker-%d", i), workerFunc)
	}

	return process, nil
}
```

## Dependencies

- `context`, `os/signal`, `os/exec`, `sync` and `syscall` from the standard
  library
- `github.com/eser/stack/pkg/ajan/logfx`: structured logging (the logger
  argument may be `nil`)

## Thread Safety

processfx is designed to be thread-safe:

- Safe to call `StartGoroutine` concurrently: the goroutine registry is a single
  `sync.WaitGroup` with a mutex-guarded name slice, so concurrent starts need no
  external locking
- Safe to call `Wait` and `Shutdown` from any goroutine
- `Supervisor.Status`, `IsHealthy` and the `SupervisorRegistry` methods lock
  their state, so a health endpoint can read them while workers run

## Upgrading from 4.x

These changes since 4.5.2 need a change in code, commands or files that use this
package. The [changelog](https://github.com/eser/stack/blob/main/CHANGELOG.md)
lists the changes in every package.

- `Process.Wait` no longer closes `Process.Signal`. Select on `p.Ctx.Done()`
  instead of waiting for the channel to close, and do not close `p.Signal`
  yourself; that only stops signal handling.

## 🔗 Links

- `go doc github.com/eser/stack/pkg/ajan/processfx`: the API reference generated
  from source
- [ajan/logfx](../logfx/README.md): the logger the process and the supervisor
  write to
- [ajan/httpfx](../httpfx/README.md): HTTP services with their own start and
  cleanup functions
- [eser/stack on GitHub](https://github.com/eser/stack)
