package noskillsserverfx

import (
	"fmt"
	"io"
	"net"
	"testing"
	"testing/synctest"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
)

// processExited stands in for the wait on a worker process that has already
// exited.
func processExited() error { return nil }

// TestMuxWorkerDeliversItsLastLinesAfterItsProcessExits pins the order of
// shutdown: lines the worker wrote before it exited still become events, and
// Events closes after them. The process waiter used to close Events as soon
// as the process exited, so the reader's next send panicked.
func TestMuxWorkerDeliversItsLastLinesAfterItsProcessExits(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		local, remote := net.Pipe()

		w := newMuxWorker("s1", local, nil)
		w.run(t.Context(), logfx.NewLogger(logfx.WithWriter(io.Discard)), processExited)

		const lastLines = 3

		go func() {
			for i := range lastLines {
				if _, err := fmt.Fprintf(remote, `{"type":"line_%d"}`+"\n", i); err != nil {
					t.Errorf("worker side write %d: %v", i, err)
				}
			}

			_ = remote.Close() // the worker's end closes with its process
		}()

		var got []string
		for evt := range w.Events() {
			got = append(got, evt.Type)
		}

		want := []string{"line_0", "line_1", "line_2"}
		if fmt.Sprint(got) != fmt.Sprint(want) {
			t.Errorf("events after the process exited = %v, want %v", got, want)
		}
	})
}

// TestMuxWorkerKeepsTheLineThatFollowsReady pins that the handshake and the
// reader share one buffer. worker.ts sends ready and spawn_progress back to
// back; the handshake used to read both through a scanner of its own, and the
// reader, starting a fresh one, never saw the second line.
func TestMuxWorkerKeepsTheLineThatFollowsReady(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		local, remote := net.Pipe()

		w := newMuxWorker("s1", local, nil)

		go func() {
			handshake := `{"type":"ready"}` + "\n" + `{"type":"spawn_progress","stage":"ready"}` + "\n"
			if _, err := remote.Write([]byte(handshake)); err != nil {
				t.Errorf("worker side write: %v", err)
			}

			_ = remote.Close() // the worker exits after the handshake
		}()

		if err := w.waitForReady(t.Context()); err != nil {
			t.Fatalf("waitForReady() = %v", err)
		}

		w.run(t.Context(), logfx.NewLogger(logfx.WithWriter(io.Discard)), processExited)

		var got []string
		for evt := range w.Events() {
			got = append(got, string(evt.Payload))
		}

		want := []string{`{"type":"spawn_progress","stage":"ready"}`}
		if fmt.Sprint(got) != fmt.Sprint(want) {
			t.Errorf("events after the handshake = %v, want %v", got, want)
		}
	})
}

// TestMuxWorkerEventsCloseWhenAChildHoldsTheSocket pins the bound on the
// reader: when the worker has exited but a child it started keeps the socket
// open, Events still closes, workerDrainTimeout after the exit.
func TestMuxWorkerEventsCloseWhenAChildHoldsTheSocket(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		local, remote := net.Pipe()
		defer remote.Close() //nolint:errcheck // a pipe end; nothing to report

		w := newMuxWorker("s1", local, nil)

		started := time.Now()

		w.run(t.Context(), logfx.NewLogger(logfx.WithWriter(io.Discard)), processExited)

		for range w.Events() {
			t.Error("an event arrived from a worker that wrote nothing")
		}

		if elapsed := time.Since(started); elapsed != workerDrainTimeout {
			t.Errorf("Events closed %v after the exit, want %v", elapsed, workerDrainTimeout)
		}
	})
}
