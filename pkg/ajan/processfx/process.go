package processfx

import (
	"context"
	"errors"
	"os"
	"os/signal"
	"slices"
	"sync"
	"syscall"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
)

const (
	DefaultShutdownTimeout = 30 * time.Second
)

type Process struct {
	BaseCtx context.Context //nolint:containedctx

	Ctx    context.Context //nolint:containedctx
	Logger *logfx.Logger

	Cancel context.CancelFunc

	Signal chan os.Signal

	ShutdownTimeout time.Duration

	// wg tracks every goroutine started via StartGoroutine.
	//
	// This replaces a former exported `WaitGroups map[string]*sync.WaitGroup`.
	// StartGoroutine wrote to that map with no synchronisation while Shutdown
	// ranged over it, so concurrent starts aborted the process with
	// "fatal error: concurrent map writes" -- a runtime throw that recover()
	// cannot catch -- even though the README documented StartGoroutine as safe
	// to call concurrently. A single WaitGroup needs no locking and cannot be
	// misused from outside the package.
	wg sync.WaitGroup

	// namesMu guards names, which exists only for diagnostics.
	namesMu sync.Mutex
	names   []string
}

func New(baseCtx context.Context, logger *logfx.Logger) *Process {
	// Base context that will be used to signal shutdown to all components.
	ctx, cancel := context.WithCancel(baseCtx)

	// Channel to listen for OS signals (e.g., interrupt or terminate).
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		sig := <-sigChan
		if logger != nil {
			logger.InfoContext(
				ctx,
				"Received OS signal, initiating shutdown...",
				"signal",
				sig.String(),
			)
		}

		cancel()
	}()

	return &Process{
		BaseCtx: baseCtx,
		Logger:  logger,

		Ctx:    ctx,
		Cancel: cancel,

		Signal: sigChan,

		ShutdownTimeout: DefaultShutdownTimeout,
	}
}

// RunningNames returns the names registered via StartGoroutine, for diagnostics.
func (p *Process) RunningNames() []string {
	p.namesMu.Lock()
	defer p.namesMu.Unlock()

	return slices.Clone(p.names)
}

func (p *Process) StartGoroutine(
	name string,
	fn func(ctx context.Context) error, //nolint:varnamelen
) {
	p.namesMu.Lock()
	p.names = append(p.names, name)
	p.namesMu.Unlock()

	p.wg.Go(func() {
		if p.Logger != nil {
			p.Logger.DebugContext(p.Ctx, "Goroutine starting", "name", name)
		}

		err := fn(p.Ctx)
		if err != nil &&
			p.BaseCtx.Err() == nil &&
			!errors.Is(err, context.Canceled) {
			if p.Logger != nil {
				p.Logger.ErrorContext(p.BaseCtx, "Goroutine error", "name", name, "error", err)
			}
		}

		if p.Logger != nil {
			p.Logger.DebugContext(p.BaseCtx, "Goroutine stopped", "name", name)
		}
	})
}

func (p *Process) Wait() {
	// Block until the context is cancelled or an OS signal is received.
	<-p.Ctx.Done()

	if p.Cancel != nil {
		p.Cancel()
	}

	if p.Signal != nil {
		signal.Stop(p.Signal)
		close(p.Signal)
	}
}

func (p *Process) Shutdown() {
	shutdownCtx, shutdownCancel := context.WithTimeout(p.BaseCtx, p.ShutdownTimeout)
	defer shutdownCancel()

	// Wait for all managed goroutines to finish.
	shutdownComplete := make(chan struct{})

	go func() {
		p.wg.Wait()

		close(shutdownComplete)
	}()

	select {
	case <-shutdownComplete:
		if p.Logger != nil {
			p.Logger.InfoContext(p.BaseCtx, "All services shut down gracefully.")
		}

	case <-shutdownCtx.Done():
		if p.Logger != nil {
			p.Logger.WarnContext(
				p.BaseCtx,
				"Graceful shutdown timed out. Some services may not have stopped.",
			)
		}
	}

	if p.Logger != nil {
		p.Logger.InfoContext(p.BaseCtx, "Process shutdown process complete.")
	}
}
