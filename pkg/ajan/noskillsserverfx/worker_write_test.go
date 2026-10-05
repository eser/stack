package noskillsserverfx

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"testing/synctest"
	"time"
)

// These tests run in a synctest bubble: net.Pipe's deadlines use the bubble's
// clock, so a write that waits for workerWriteTimeout takes no wall time, and
// the elapsed time each test reads is exact.

// TestWorkerSendsReturnWithinTheWriteTimeout pins that a mux worker that never
// reads cannot hold a sender, or Close, past the write deadline.
func TestWorkerSendsReturnWithinTheWriteTimeout(t *testing.T) {
	t.Parallel()

	cases := []struct {
		name string
		send func(ctx context.Context, w *workerImpl) error
	}{
		{"SendQueryStart", func(ctx context.Context, w *workerImpl) error {
			return w.SendQueryStart(ctx, "/project", "s1", "")
		}},
		{"PushMessage", func(ctx context.Context, w *workerImpl) error {
			return w.PushMessage(ctx, "hello")
		}},
		{"PermissionResponse", func(ctx context.Context, w *workerImpl) error {
			return w.PermissionResponse(ctx, "req-1", "allow", "")
		}},
		{"SendMux", func(ctx context.Context, w *workerImpl) error {
			return w.SendMux(ctx, json.RawMessage(`{"t":"input","data":"ls\n"}`))
		}},
		{"SetMode", func(ctx context.Context, w *workerImpl) error {
			return w.SetMode(ctx, "plan")
		}},
		{"StopTask", func(ctx context.Context, w *workerImpl) error {
			return w.StopTask(ctx)
		}},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()

			synctest.Test(t, func(t *testing.T) {
				local, remote := net.Pipe() // remote is never read
				defer remote.Close()        //nolint:errcheck // a pipe end; nothing to report

				w := newMuxWorker("s1", local, nil)
				defer w.Close() //nolint:errcheck // the shutdown write times out too; the test is over

				started := time.Now()
				err := tc.send(t.Context(), w)
				elapsed := time.Since(started)

				if !errors.Is(err, os.ErrDeadlineExceeded) {
					t.Fatalf("%s to a worker that never reads = %v, want a deadline error", tc.name, err)
				}

				if elapsed != workerWriteTimeout {
					t.Errorf("%s returned after %v, want %v", tc.name, elapsed, workerWriteTimeout)
				}

				// Nothing reached the socket, so the stream is intact and the
				// worker is still usable.
				if errors.Is(err, ErrWorkerStalled) {
					t.Errorf("%s = %v, want the worker kept after a write that sent nothing", tc.name, err)
				}
			})
		})
	}

	t.Run("Close", func(t *testing.T) {
		t.Parallel()

		synctest.Test(t, func(t *testing.T) {
			local, remote := net.Pipe()
			defer remote.Close() //nolint:errcheck // a pipe end; nothing to report

			var stopped atomic.Bool

			w := newMuxWorker("s1", local, func() { stopped.Store(true) })

			started := time.Now()
			if err := w.Close(); err != nil {
				t.Fatalf("Close() = %v, want nil", err)
			}

			if elapsed := time.Since(started); elapsed != workerWriteTimeout {
				t.Errorf("Close() returned after %v, want %v", elapsed, workerWriteTimeout)
			}

			if !stopped.Load() {
				t.Error("Close() did not end the worker process")
			}
		})
	})
}

// TestWorkerSendHonoursTheCallersContext pins that ctx bounds a send: a caller
// that has given up sends nothing, and a deadline sooner than the write
// timeout wins.
func TestWorkerSendHonoursTheCallersContext(t *testing.T) {
	t.Parallel()

	t.Run("cancelled before the send", func(t *testing.T) {
		t.Parallel()

		synctest.Test(t, func(t *testing.T) {
			local, remote := net.Pipe()
			defer remote.Close() //nolint:errcheck // a pipe end; nothing to report

			w := newMuxWorker("s1", local, nil)

			ctx, cancel := context.WithCancel(t.Context())
			cancel()

			started := time.Now()
			err := w.PushMessage(ctx, "hello")

			if !errors.Is(err, context.Canceled) {
				t.Fatalf("PushMessage() on a cancelled context = %v, want context.Canceled", err)
			}

			if elapsed := time.Since(started); elapsed != 0 {
				t.Errorf("PushMessage() on a cancelled context waited %v", elapsed)
			}
		})
	})

	t.Run("deadline before the write timeout", func(t *testing.T) {
		t.Parallel()

		synctest.Test(t, func(t *testing.T) {
			local, remote := net.Pipe()
			defer remote.Close() //nolint:errcheck // a pipe end; nothing to report

			w := newMuxWorker("s1", local, nil)

			const callerBound = 500 * time.Millisecond

			ctx, cancel := context.WithTimeout(t.Context(), callerBound)
			defer cancel()

			started := time.Now()
			err := w.StopTask(ctx)

			if !errors.Is(err, os.ErrDeadlineExceeded) {
				t.Fatalf("StopTask() = %v, want a deadline error", err)
			}

			if elapsed := time.Since(started); elapsed != callerBound {
				t.Errorf("StopTask() returned after %v, want the caller's %v", elapsed, callerBound)
			}
		})
	})
}

// TestWorkerCutFrameEndsTheWorker pins what happens when the worker reads part
// of a frame and then stops: the stream cannot be resynchronised, so the
// connection is closed, the process ended, and later sends fail at once.
func TestWorkerCutFrameEndsTheWorker(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		local, remote := net.Pipe()
		defer remote.Close() //nolint:errcheck // a pipe end; nothing to report

		var stopped atomic.Bool

		w := newMuxWorker("s1", local, func() { stopped.Store(true) })

		// The peer reads the first 16 bytes of the frame and then stalls. It
		// reads again only after the send has returned, to see what the
		// daemon left on the connection.
		release := make(chan struct{})
		peerSaw := make(chan error, 1)

		go func() {
			head := make([]byte, 16)
			if _, err := io.ReadFull(remote, head); err != nil {
				peerSaw <- err

				return
			}

			<-release

			_, err := remote.Read(make([]byte, 1))
			peerSaw <- err
		}()

		started := time.Now()
		err := w.PushMessage(t.Context(), strings.Repeat("x", 4096))

		close(release)

		if !errors.Is(err, ErrWorkerStalled) || !errors.Is(err, os.ErrDeadlineExceeded) {
			t.Fatalf("PushMessage() with a cut frame = %v, want ErrWorkerStalled wrapping the deadline", err)
		}

		if elapsed := time.Since(started); elapsed != workerWriteTimeout {
			t.Errorf("PushMessage() returned after %v, want %v", elapsed, workerWriteTimeout)
		}

		if !stopped.Load() {
			t.Error("the worker process was not ended after a cut frame")
		}

		if readErr := <-peerSaw; !errors.Is(readErr, io.EOF) {
			t.Errorf("worker side read %v after the cut frame, want io.EOF (connection closed)", readErr)
		}

		started = time.Now()

		if err := w.StopTask(t.Context()); !errors.Is(err, ErrWorkerStalled) {
			t.Errorf("StopTask() after a cut frame = %v, want ErrWorkerStalled", err)
		}

		if elapsed := time.Since(started); elapsed != 0 {
			t.Errorf("StopTask() after a cut frame waited %v, want an immediate error", elapsed)
		}
	})
}
