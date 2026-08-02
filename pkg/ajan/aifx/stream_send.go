package aifx

import "context"

// sendStreamEvent publishes one event to a stream's event channel, abandoning
// the send if the stream's context is cancelled first.
//
// Every emitter must go through this. The channels are buffered (64 slots), and
// a raw `eventCh <- event` blocks forever once that buffer fills with no reader
// draining it -- which is exactly what happens when the consumer stops calling
// Next and cancels instead. The producer goroutine then leaks for the lifetime
// of the process, holding the provider connection open with it.
//
// This lived in adapter_google_shared.go, where only the Google adapters could
// reasonably find it; six of the eight adapters open-coded the raw send.
func sendStreamEvent(
	ctx context.Context,
	eventCh chan<- StreamEvent,
	event StreamEvent,
) {
	select {
	case eventCh <- event:
	case <-ctx.Done():
	}
}
