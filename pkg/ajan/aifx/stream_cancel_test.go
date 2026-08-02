package aifx

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"
)

// TestStreamIteratorCloseUnblocksNext pins the StreamIterator mutex fix.
//
// Next used to hold iter.mu across the blocking `<-iter.eventCh` receive, and
// Close takes the same mutex. So the documented way to stop a stalled stream
// deadlocked against the stall itself: Close could not acquire the lock until
// Next returned, and Next could not return until an event arrived.
func TestStreamIteratorCloseUnblocksNext(t *testing.T) {
	t.Parallel()

	// Nothing ever sends on this channel, so Next blocks.
	eventCh := make(chan StreamEvent)

	_, cancel := context.WithCancel(t.Context())
	iter := NewStreamIterator(eventCh, cancel)

	nextReturned := make(chan bool, 1)

	go func() { nextReturned <- iter.Next() }()

	// Let Next reach the receive.
	time.Sleep(50 * time.Millisecond)

	closed := make(chan error, 1)

	go func() { closed <- iter.Close() }()

	select {
	case <-closed:
		// Close acquired the mutex while Next was parked -- the fix.
	case <-time.After(3 * time.Second):
		t.Fatal("Close blocked: Next is holding iter.mu across its receive")
	}

	// Releasing the producer lets the parked Next unwind.
	close(eventCh)

	select {
	case <-nextReturned:
	case <-time.After(3 * time.Second):
		t.Fatal("Next never returned after Close and channel close")
	}
}

// TestStreamIteratorNextHonoursConcurrentClose ensures a Next whose receive was
// already in flight when Close ran does not publish an event afterwards.
func TestStreamIteratorNextHonoursConcurrentClose(t *testing.T) {
	t.Parallel()

	eventCh := make(chan StreamEvent)

	_, cancel := context.WithCancel(t.Context())
	iter := NewStreamIterator(eventCh, cancel)

	result := make(chan bool, 1)

	go func() { result <- iter.Next() }()

	time.Sleep(50 * time.Millisecond)
	_ = iter.Close()

	// Deliver an event after Close; Next must still report "done".
	select {
	case eventCh <- newStreamEventContentDelta("late"):
	case <-time.After(time.Second):
	}

	select {
	case got := <-result:
		if got {
			t.Fatal("Next published an event delivered after Close")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("Next did not return after Close")
	}
}

// TestParseJsonlStreamStopsOnCancel pins the emitter fix.
//
// The 27 raw `eventCh <- event` sends across six adapters blocked forever once
// the 64-slot buffer filled with nobody draining it -- which is exactly the
// state after a consumer cancels instead of finishing the stream. The producer
// goroutine then leaked for the process lifetime, holding its provider
// connection open. Routing every send through sendStreamEvent makes
// cancellation an exit path.
func TestParseJsonlStreamStopsOnCancel(t *testing.T) {
	t.Parallel()

	// More lines than the channel can hold, and nothing reads from it.
	var input strings.Builder
	for range 500 {
		input.WriteString(`{"text":"chunk"}` + "\n")
	}

	eventCh := make(chan StreamEvent, 4)

	ctx, cancel := context.WithCancel(t.Context())

	done := make(chan struct{})

	go func() {
		defer close(done)

		ParseJsonlStream(
			ctx,
			strings.NewReader(input.String()),
			eventCh,
			func(raw json.RawMessage) *StreamEvent {
				var obj struct {
					Text string `json:"text"`
				}

				if err := json.Unmarshal(raw, &obj); err != nil {
					return nil
				}

				event := newStreamEventContentDelta(obj.Text)

				return &event
			},
		)
	}()

	// Let it fill the buffer and block.
	time.Sleep(100 * time.Millisecond)
	cancel()

	select {
	case <-done:
		// The producer observed cancellation and unwound.
	case <-time.After(5 * time.Second):
		t.Fatal("ParseJsonlStream ignored cancellation and stayed blocked on a full channel")
	}
}

// TestSendStreamEventReturnsOnCancel covers the helper directly.
func TestSendStreamEventReturnsOnCancel(t *testing.T) {
	t.Parallel()

	// Unbuffered with no reader: the send can only complete via cancellation.
	eventCh := make(chan StreamEvent)

	ctx, cancel := context.WithCancel(t.Context())

	done := make(chan struct{})

	go func() {
		defer close(done)

		sendStreamEvent(ctx, eventCh, newStreamEventContentDelta("x"))
	}()

	time.Sleep(50 * time.Millisecond)
	cancel()

	select {
	case <-done:
	case <-time.After(3 * time.Second):
		t.Fatal("sendStreamEvent blocked past cancellation")
	}
}
