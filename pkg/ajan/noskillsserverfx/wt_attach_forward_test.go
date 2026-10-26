package noskillsserverfx

import (
	"bufio"
	"encoding/json"
	"errors"
	"io"
	"net"
	"os"
	"testing"
	"testing/synctest"
	"time"

	"github.com/eser/stack/pkg/ajan/logfx"
)

// These tests run in a synctest bubble: net.Pipe's deadlines use the bubble's
// clock, so a write that waits for attachWriteTimeout takes no wall time.

// TestForwardEventsEndsWhenTheClientStopsReading pins that a client that never
// reads cannot hold the live forwarder, and with it the attach handler that
// waits for it, past attachWriteTimeout.
func TestForwardEventsEndsWhenTheClientStopsReading(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		local, remote := net.Pipe() // remote is never read
		defer local.Close()         //nolint:errcheck // a pipe end; nothing to report
		defer remote.Close()        //nolint:errcheck // a pipe end; nothing to report

		// The channel stays open, so only the stalled write can end the loop.
		events := make(chan WorkerEvent, 1)
		events <- WorkerEvent{Type: "query_done", Payload: []byte(`{"type":"query_done"}`)}

		var seq int64

		out := boundedWriter{stream: local, timeout: attachWriteTimeout}
		logger := logfx.NewLogger(logfx.WithWriter(io.Discard))

		started := time.Now()
		err := forwardEvents(t.Context(), out, &seq, replayCut{}, events, nil, logger)
		elapsed := time.Since(started)

		if !errors.Is(err, os.ErrDeadlineExceeded) {
			t.Fatalf("forwardEvents() to a client that never reads = %v, want a deadline error", err)
		}

		if elapsed != attachWriteTimeout {
			t.Errorf("forwardEvents() returned after %v, want %v", elapsed, attachWriteTimeout)
		}
	})
}

// TestForwardEventsDeliversUntilTheChannelCloses pins the normal path: every
// event the client protocol knows arrives as one line whose seq is its ledger
// line, an event written as a line the replay covered is dropped, an event
// with no ledger line repeats the seq, unknown events are dropped, and a
// closed channel ends the loop without an error.
func TestForwardEventsDeliversUntilTheChannelCloses(t *testing.T) {
	t.Parallel()

	synctest.Test(t, func(t *testing.T) {
		local, remote := net.Pipe()
		defer remote.Close() //nolint:errcheck // a pipe end; nothing to report

		received := make(chan []map[string]any, 1)

		go func() {
			var lines []map[string]any

			scanner := bufio.NewScanner(remote)
			for scanner.Scan() {
				var line map[string]any
				if err := json.Unmarshal(scanner.Bytes(), &line); err != nil {
					t.Errorf("client read a line that is not JSON: %q", scanner.Text())
				}

				lines = append(lines, line)
			}

			received <- lines
		}()

		events := make(chan WorkerEvent, 5)
		events <- WorkerEvent{Type: "query_done", Payload: []byte(`{"type":"query_done"}`), Line: 7}
		events <- WorkerEvent{Type: "query_done", Payload: []byte(`{"type":"query_done"}`), Line: 8}
		events <- WorkerEvent{Type: "worker_internal", Payload: []byte(`{"type":"worker_internal"}`), Line: 0}
		events <- WorkerEvent{Type: "spawn_progress", Payload: []byte(`{"type":"spawn_progress"}`), Line: 0}
		events <- WorkerEvent{Type: "query_error", Payload: []byte(`{"type":"query_error","error":"boom"}`), Line: 9}
		close(events)

		seq := int64(7) // the replay sent lines 1 to 7
		cut := replayCut{lines: 7, offset: 0}

		out := boundedWriter{stream: local, timeout: attachWriteTimeout}
		logger := logfx.NewLogger(logfx.WithWriter(io.Discard))

		if err := forwardEvents(t.Context(), out, &seq, cut, events, nil, logger); err != nil {
			t.Fatalf("forwardEvents() = %v, want nil once the channel closes", err)
		}

		if err := local.Close(); err != nil {
			t.Fatalf("close the daemon side: %v", err)
		}

		lines := <-received

		want := []struct {
			typ string
			seq float64 // JSON numbers decode as float64
		}{
			{typ: "query_done", seq: 8},
			{typ: "spawn_progress", seq: 8},
			{typ: "error", seq: 9},
		}

		if len(lines) != len(want) {
			t.Fatalf("client received %d lines %v, want %d", len(lines), lines, len(want))
		}

		for i, w := range want {
			if lines[i]["type"] != w.typ || lines[i]["seq"] != w.seq {
				t.Errorf("line %d = %v, want type %q with seq %v", i, lines[i], w.typ, w.seq)
			}
		}
	})
}

// TestForwardEventsEndsAtAMissedLedgerLine pins that a client which did not
// get a ledger line live, as when its buffer was full, is not sent the lines
// after it: its seq would pass the line it lacks, so the attach ends and the
// client gets the line from the replay when it reattaches.
func TestForwardEventsEndsAtAMissedLedgerLine(t *testing.T) {
	t.Parallel()

	events := make(chan WorkerEvent, 2)
	events <- WorkerEvent{Type: "query_done", Payload: []byte(`{"type":"query_done"}`), Line: 3}
	events <- WorkerEvent{Type: "query_done", Payload: []byte(`{"type":"query_done"}`), Line: 5}

	seq := int64(2)
	logger := logfx.NewLogger(logfx.WithWriter(io.Discard))

	err := forwardEvents(t.Context(), io.Discard, &seq, replayCut{lines: 2, offset: 0}, events, nil, logger)
	if !errors.Is(err, errClientMissedEvents) {
		t.Fatalf("forwardEvents() past a missed line = %v, want errClientMissedEvents", err)
	}

	if seq != 3 {
		t.Errorf("seq = %d, want 3, the last line the client got", seq)
	}
}
