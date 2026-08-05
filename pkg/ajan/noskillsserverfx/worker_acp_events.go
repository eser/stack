package noskillsserverfx

import (
	"encoding/json"
)

// ── Event plumbing ───────────────────────────────────────────────────────────

// emit encodes one message and puts it on the events channel.
//
// # Why the lock rather than a select on w.done
//
// Several goroutines emit -- the turn runner, the permission handler, the
// connection watcher -- and a different one closes the channel when the agent
// dies. A select of the form
//
//	select {
//	case w.events <- event:
//	case <-w.done:
//	}
//
// looks like it guards against that and does not: sending on a closed channel
// panics instead of blocking, so that case is always *ready* and the runtime
// may pick it. The result is a panic that takes the whole daemon down, and it
// happens exactly when an agent dies mid-turn. A closed flag under a mutex is
// the only way to make "is it still open" and "send" one atomic step.
//
// A full channel drops the event rather than blocking. The alternative is worse
// than a lost event: emit is called from the ACP read loop's dispatch path, and
// blocking there stops the agent's whole connection -- including the reply to
// the very request whose event could not be delivered.
func (w *acpWorker) emit(msg map[string]any) {
	payload, err := json.Marshal(msg)
	if err != nil {
		if w.logger != nil {
			w.logger.Warn("acp worker: marshal event failed", "err", err)
		}

		return
	}

	kind, _ := msg["type"].(string)

	w.eventMu.Lock()
	defer w.eventMu.Unlock()

	if w.eventsClosed {
		return
	}

	select {
	case w.events <- WorkerEvent{Type: kind, Payload: payload}:
	default:
		if w.logger != nil {
			w.logger.Warn("acp worker: event dropped, queue full", "type", kind)
		}
	}
}

// closeEvents ends the event stream, which is how runPump learns the session is
// over. Idempotent.
func (w *acpWorker) closeEvents() {
	w.eventMu.Lock()
	defer w.eventMu.Unlock()

	if w.eventsClosed {
		return
	}

	w.eventsClosed = true

	close(w.events)
}
