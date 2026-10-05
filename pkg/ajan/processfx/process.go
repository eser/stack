package processfx

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
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

	// Signal receives SIGINT and SIGTERM while Ctx is live. New registers it
	// and the signal watcher removes the registration as soon as Ctx ends, so
	// the handler never outlives the process. A value sent here while Ctx is
	// live cancels it the way a real signal does.
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

	// signalWatcherDone is closed when the goroutine started by New has
	// returned and removed the signal registration. Wait blocks on it, which
	// makes Wait the owner of that goroutine.
	signalWatcherDone chan struct{}
}

// New returns a Process whose Ctx ends on SIGINT, SIGTERM, Cancel or the end
// of baseCtx. The signal handler is registered here, so a signal that arrives
// before Wait still shuts down gracefully, and it is removed once Ctx ends: a
// caller that never calls Wait (a test, for example) releases it by calling
// Cancel or ending baseCtx.
func New(baseCtx context.Context, logger *logfx.Logger) *Process {
	// Base context that will be used to signal shutdown to all components.
	ctx, cancel := context.WithCancel(baseCtx)

	// Channel to listen for OS signals (e.g., interrupt or terminate).
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)

	signalWatcherDone := make(chan struct{})

	go func() {
		defer close(signalWatcherDone)

		watchSignals(ctx, cancel, sigChan, logger)
	}()

	return &Process{
		BaseCtx: baseCtx,
		Logger:  logger,

		Ctx:    ctx,
		Cancel: cancel,

		Signal: sigChan,

		ShutdownTimeout: DefaultShutdownTimeout,

		signalWatcherDone: signalWatcherDone,
	}
}

// watchSignals cancels the process context on the first value from sigChan.
// It also returns when ctx ends for any other reason (Cancel, or baseCtx
// ending) and when sigChan is closed, and it always removes the signal
// registration on the way out.
//
// It used to block on sigChan alone. Wait closed the channel after a cancel
// that was not a signal, the receive then yielded a nil os.Signal, and calling
// String on it crashed the process whenever a logger was set.
func watchSignals(
	ctx context.Context,
	cancel context.CancelFunc,
	sigChan chan os.Signal,
	logger *logfx.Logger,
) {
	defer signal.Stop(sigChan)

	select {
	case <-ctx.Done():
		return

	case sig, ok := <-sigChan:
		if !ok {
			// A closed channel delivers no signal, so this is not a shutdown
			// request: stop listening and leave Ctx alone.
			return
		}

		if logger != nil {
			// fmt.Sprint, not sig.String(): a caller can send a nil os.Signal
			// on the exported channel.
			logger.InfoContext(
				ctx,
				"Received OS signal, initiating shutdown...",
				slog.String("signal", fmt.Sprint(sig)),
			)
		}

		cancel()
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

// Wait blocks until Ctx ends, through an OS signal, Cancel or baseCtx, and
// returns once the signal registration made by New is removed. It is safe to
// call more than once.
func (p *Process) Wait() {
	<-p.Ctx.Done()

	if p.Cancel != nil {
		p.Cancel()
	}

	// The watcher returns as soon as Ctx ends. Waiting for it means the signal
	// handler is gone when Wait returns and the goroutine has an owner.
	if p.signalWatcherDone != nil {
		<-p.signalWatcherDone
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
