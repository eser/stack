package processfx_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/eser/stack/pkg/ajan/processfx"
)

// TestStartGoroutineIsConcurrencySafe pins the fix for the unsynchronised
// goroutine registry.
//
// StartGoroutine used to write into an exported
// `WaitGroups map[string]*sync.WaitGroup` with no locking, while Shutdown
// ranged over the same map. Concurrent starts aborted the process with
// "fatal error: concurrent map writes" -- a runtime throw, not a panic, so
// recover() could not contain it -- even though the README documented
// StartGoroutine as safe to call concurrently.
func TestStartGoroutineIsConcurrencySafe(t *testing.T) {
	t.Parallel()

	process := processfx.New(context.Background(), nil)
	process.ShutdownTimeout = 5 * time.Second

	const starters = 64

	var wg sync.WaitGroup

	wg.Add(starters)

	for i := range starters {
		go func() {
			defer wg.Done()

			process.StartGoroutine(
				"worker-"+string(rune('a'+i%26))+string(rune('0'+i/26)),
				func(ctx context.Context) error {
					<-ctx.Done()

					return nil
				},
			)
		}()
	}

	wg.Wait()

	if got := len(process.RunningNames()); got != starters {
		t.Fatalf("registered %d goroutines, want %d", got, starters)
	}

	// Cancel and drain: Shutdown must observe every goroutine started above.
	process.Cancel()
	process.Shutdown()
}

// TestShutdownWaitsForGoroutines guards that Shutdown actually blocks on the
// managed goroutines rather than returning immediately -- the property that
// makes calling it after Wait meaningful.
func TestShutdownWaitsForGoroutines(t *testing.T) {
	t.Parallel()

	process := processfx.New(context.Background(), nil)
	process.ShutdownTimeout = 10 * time.Second

	finished := make(chan struct{})

	process.StartGoroutine("slow", func(ctx context.Context) error {
		<-ctx.Done()
		time.Sleep(150 * time.Millisecond)
		close(finished)

		return nil
	})

	process.Cancel()
	process.Shutdown()

	select {
	case <-finished:
		// Shutdown returned only after the goroutine completed.
	default:
		t.Fatal("Shutdown returned before its managed goroutine finished")
	}
}

// TestShutdownHonoursTimeout ensures a goroutine that ignores cancellation
// cannot wedge shutdown forever.
func TestShutdownHonoursTimeout(t *testing.T) {
	t.Parallel()

	process := processfx.New(context.Background(), nil)
	process.ShutdownTimeout = 200 * time.Millisecond

	release := make(chan struct{})

	process.StartGoroutine("stuck", func(_ context.Context) error {
		<-release

		return nil
	})

	process.Cancel()

	done := make(chan struct{})

	go func() {
		process.Shutdown()
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(5 * time.Second):
		t.Fatal("Shutdown ignored ShutdownTimeout")
	}

	close(release)
}
