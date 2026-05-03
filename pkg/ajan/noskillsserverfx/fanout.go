package noskillsserverfx

import (
	"encoding/json"
	"sync"

	"github.com/eser/stack/pkg/ajan/logfx"
)

// FanoutBroadcaster distributes WorkerEvents to all currently registered clients.
// Thread-safe. Phase 2 had one consumer; Phase 3 supports N concurrent clients.
//
// Each client receives its own buffered channel. A slow client that fills its
// buffer gets events dropped (non-blocking send). The worker event channel is
// never blocked by client backpressure.
type FanoutBroadcaster struct {
	mu      sync.Mutex
	clients map[string]chan WorkerEvent
}

func newFanoutBroadcaster() *FanoutBroadcaster {
	return &FanoutBroadcaster{
		clients: make(map[string]chan WorkerEvent),
	}
}

// Register creates a 256-deep buffered channel for clientID and returns it.
// The caller owns the channel; it must call Unregister when disconnecting.
// Events buffer during ledger replay so no live event is missed.
func (f *FanoutBroadcaster) Register(clientID string) <-chan WorkerEvent {
	ch := make(chan WorkerEvent, 256)

	f.mu.Lock()
	f.clients[clientID] = ch
	f.mu.Unlock()

	return ch
}

// Unregister removes clientID and closes its channel. Idempotent: safe to
// call after Close() has already cleared the client.
func (f *FanoutBroadcaster) Unregister(clientID string) {
	f.mu.Lock()
	if ch, ok := f.clients[clientID]; ok {
		delete(f.clients, clientID)
		close(ch)
	}
	f.mu.Unlock()
}

// Broadcast sends evt to every registered client. Clients that have a full
// buffer are skipped (drop-oldest policy is left for Phase 3b; current policy
// is drop-new).
func (f *FanoutBroadcaster) Broadcast(evt WorkerEvent) {
	f.mu.Lock()
	defer f.mu.Unlock()

	for _, ch := range f.clients {
		select {
		case ch <- evt:
		default:
			// slow client — event dropped; Phase 3b adds per-client metrics
		}
	}
}

// Close closes every registered client channel and clears the map.
// Called by the pump goroutine when the worker process exits.
// After Close, Broadcast is a no-op and Unregister is idempotent.
func (f *FanoutBroadcaster) Close() {
	f.mu.Lock()
	defer f.mu.Unlock()

	for _, ch := range f.clients {
		close(ch)
	}

	f.clients = make(map[string]chan WorkerEvent)
}

// ClientCount returns the number of currently registered clients.
func (f *FanoutBroadcaster) ClientCount() int {
	f.mu.Lock()
	defer f.mu.Unlock()

	return len(f.clients)
}

// translateWorkerEvent maps a WorkerEvent from the internal IPC wire to the
// public client wire protocol. Returns nil for events that should be dropped.
func translateWorkerEvent(evt WorkerEvent, logger *logfx.Logger) any {
	switch evt.Type {
	case "query_error":
		var qe struct {
			Error string `json:"error"`
		}
		if err := json.Unmarshal(evt.Payload, &qe); err != nil {
			logger.Warn("fanout: malformed query_error payload", "err", err)

			return map[string]any{"type": "error", "code": "query_error", "message": string(evt.Payload)}
		}

		return map[string]any{"type": "error", "code": "query_error", "message": qe.Error}

	case "sdk_event", "permission_request", "query_done", "spawn_progress", "fork_created":
		var raw map[string]any
		if err := json.Unmarshal(evt.Payload, &raw); err != nil {
			logger.Warn("fanout: malformed event payload", "type", evt.Type, "err", err)

			return nil
		}

		return raw

	default:
		return nil
	}
}

// marshalEventForLedger translates evt to client-wire JSON for persistent storage.
// Returns nil for events that should not be persisted (unknown types, marshal errors).
func marshalEventForLedger(evt WorkerEvent, logger *logfx.Logger) []byte {
	msg := translateWorkerEvent(evt, logger)
	if msg == nil {
		return nil
	}

	data, err := json.Marshal(msg)
	if err != nil {
		logger.Warn("fanout: marshal for ledger failed", "err", err)

		return nil
	}

	return data
}
