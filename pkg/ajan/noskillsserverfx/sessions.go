package noskillsserverfx

import (
	"context"
	"errors"
	"fmt"
	"sync"

	"github.com/eser/stack/pkg/ajan/logfx"
)

// errSessionsNotRunning is returned by GetOrCreate before Server.Start and
// once shutdown has begun.
var errSessionsNotRunning = errors.New("noskills sessions are not running (the server is not started or is shutting down)")

// ── Session entry ─────────────────────────────────────────────────────────────

// SessionEntry holds the worker, ledger, and broadcaster for one active session.
type SessionEntry struct {
	SID         string
	Root        string
	Slug        string
	Kind        string // "" / "agent" | "mux"
	Worker      WorkerHandle
	Ledger      *Ledger
	Broadcaster *FanoutBroadcaster

	// Pending joins the two halves of a permission exchange: the tool name
	// arrives from the worker, the decision arrives from a client, and only
	// together do they say how durably the decision must be journalled.
	Pending *pendingPermissions

	// publishMu holds a ledger append and its broadcast together, so clients
	// get the session's events in the order of their ledger lines.
	publishMu sync.Mutex
}

// publish writes line, the client-wire form of evt, to the ledger, fdatasynced
// when durable, and broadcasts evt carrying the number of that line. When the
// line does not reach the ledger nothing is broadcast, and the error is
// returned.
//
// Every event a client gets live goes through here, whoever writes it: the
// session pump, a permission decision or its rejection, a fork notice. That
// is what makes an attach's seq the ledger's line number.
func (e *SessionEntry) publish(evt WorkerEvent, line []byte, durable bool) error {
	e.publishMu.Lock()
	defer e.publishMu.Unlock()

	n, err := e.Ledger.appendLine(line, durable)
	if err != nil {
		return err
	}

	evt.Line = n
	e.Broadcaster.Broadcast(evt)

	return nil
}

// publishOrSend publishes evt like publish, and when the ledger refuses the
// line it still broadcasts evt, with no line number, so attached clients are
// told; it returns the ledger's error.
func (e *SessionEntry) publishOrSend(evt WorkerEvent, line []byte) error {
	err := e.publish(evt, line, false)
	if err != nil {
		e.Broadcaster.Broadcast(evt)
	}

	return err
}

// ── Session manager ───────────────────────────────────────────────────────────

// SessionManager is the in-memory map of active sessions. Thread-safe.
// Phase 3: each session has an append-only JSONL ledger and a fan-out broadcaster.
type SessionManager struct {
	mu       sync.Mutex
	sessions map[string]*SessionEntry // key: "<slug>/<sid>"
	kinds    map[string]string        // key: "<slug>/<sid>" → worker kind, set at create
	pending  map[string]chan struct{} // key: "<slug>/<sid>" → in-flight creation
	server   *Server
	logger   *logfx.Logger

	// lifetime is the server's lifetime context, set by start. Every pump runs
	// under it: its end closes the session's worker, and the push
	// notifications the pump triggers carry it. It is stored, against the
	// usual rule, because sessions are created by attach requests, whose
	// contexts end long before the sessions do.
	lifetime context.Context //nolint:containedctx // server lifetime, see the comment above
	// stopped is set by stop. GetOrCreate then refuses, so no pump starts
	// after stop has begun waiting for the running ones.
	stopped bool
	// pumps tracks the pump goroutines; stop waits for them.
	pumps sync.WaitGroup
}

func newSessionManager(server *Server, logger *logfx.Logger) *SessionManager {
	return &SessionManager{
		sessions: make(map[string]*SessionEntry),
		kinds:    make(map[string]string),
		pending:  make(map[string]chan struct{}),
		server:   server,
		logger:   logger,
	}
}

func sessionKey(slug, sid string) string { return slug + "/" + sid }

// start lets GetOrCreate create sessions whose pumps run under lifetime.
func (sm *SessionManager) start(lifetime context.Context) {
	sm.mu.Lock()
	sm.lifetime = lifetime
	sm.mu.Unlock()
}

// stop refuses new sessions and waits for every pump to return. A pump returns
// once its worker has closed, which the end of the lifetime context given to
// start brings about, so the caller ends that context first.
func (sm *SessionManager) stop() {
	sm.mu.Lock()
	sm.stopped = true
	sm.mu.Unlock()

	sm.pumps.Wait()
}

// addLocked registers entry under key and starts its pump. The caller holds
// sm.mu and has checked that the manager is running.
func (sm *SessionManager) addLocked(key string, entry *SessionEntry) {
	sm.sessions[key] = entry

	lifetime := sm.lifetime
	sm.pumps.Go(func() { sm.runPump(lifetime, entry) })
}

// RecordKind remembers the worker flavour chosen at session-create time so the
// worker spawned on first attach matches, regardless of which client attaches or
// what its query string says. A durable fact about the session, not the request.
func (sm *SessionManager) RecordKind(slug, sid, kind string) {
	if kind == "" {
		return
	}

	sm.mu.Lock()
	sm.kinds[sessionKey(slug, sid)] = kind
	sm.mu.Unlock()
}

// GetOrCreate looks up an existing session or creates a new one (starting its
// worker, opening the ledger, and starting the pump goroutine).
// Returns the entry and whether it was newly created.
//
// Creation is expensive -- an agent worker's start can take seconds -- so it runs
// with sm.mu released; holding the global session mutex across a spawn stalls
// every other session operation behind the slowest one. To keep "one worker per
// key" without the lock, the creating caller publishes a placeholder channel in
// sm.pending and concurrent callers for the same key wait on that instead of
// starting a second worker.
func (sm *SessionManager) GetOrCreate(
	ctx context.Context,
	slug, sid, kind string,
) (*SessionEntry, bool, error) {
	key := sessionKey(slug, sid)

	for {
		sm.mu.Lock()

		if sm.lifetime == nil || sm.stopped {
			sm.mu.Unlock()

			return nil, false, errSessionsNotRunning
		}

		if e, ok := sm.sessions[key]; ok {
			sm.mu.Unlock()

			return e, false, nil
		}

		if done, ok := sm.pending[key]; ok {
			sm.mu.Unlock()

			select {
			case <-done:
				// The in-flight creation finished. It may have failed, so loop
				// and re-check: this iteration either finds the entry or claims
				// the creation itself.
				continue
			case <-ctx.Done():
				return nil, false, ctx.Err() //nolint:wrapcheck
			}
		}

		// The kind recorded at session-create wins over the per-attach query, so a
		// session's worker flavour is fixed by its creation, not by whoever attaches.
		effectiveKind := kind
		if recorded, ok := sm.kinds[key]; ok {
			effectiveKind = recorded
		}

		root, ok := sm.server.projectPath(slug)
		if !ok {
			sm.mu.Unlock()

			return nil, false, fmt.Errorf("project %q not found", slug) //nolint:err113
		}

		dataDir := sm.server.config.DataDir

		done := make(chan struct{})
		sm.pending[key] = done
		sm.mu.Unlock()

		entry, err := sm.spawnSession(ctx, slug, sid, root, effectiveKind, dataDir)

		sm.mu.Lock()
		delete(sm.pending, key)

		stopped := sm.stopped
		if err == nil && !stopped {
			sm.addLocked(key, entry)
		}

		sm.mu.Unlock()
		close(done)

		if err != nil {
			return nil, false, err
		}

		if stopped {
			// Shutdown began while the worker was spawning, and nothing would
			// close it now.
			sm.discard(ctx, entry)

			return nil, false, errSessionsNotRunning
		}

		return entry, true, nil
	}
}

// discard tears down a session that was never registered.
func (sm *SessionManager) discard(ctx context.Context, entry *SessionEntry) {
	if err := entry.Worker.Close(); err != nil {
		sm.logger.WarnContext(ctx, "noskills session: close unregistered worker", "sid", entry.SID, "err", err)
	}

	if err := entry.Ledger.Close(); err != nil {
		sm.logger.WarnContext(ctx, "noskills session: close unregistered ledger", "sid", entry.SID, "err", err)
	}
}

// spawnSession performs the expensive half of GetOrCreate. It must be called
// with sm.mu released: it starts a worker and opens a file, and on the
// failure path it tears the worker back down.
func (sm *SessionManager) spawnSession(
	ctx context.Context,
	slug, sid, root, kind, dataDir string,
) (*SessionEntry, error) {
	worker, err := SpawnWorker(ctx, sid, root, dataDir, kind, sm.logger)
	if err != nil {
		return nil, fmt.Errorf("spawn worker: %w", err)
	}

	ledger, err := openLedger(ledgerPath(dataDir, root, sid))
	if err != nil {
		_ = worker.Close()

		return nil, fmt.Errorf("open ledger: %w", err)
	}

	return &SessionEntry{
		SID:         sid,
		Root:        root,
		Slug:        slug,
		Kind:        kind,
		Worker:      worker,
		Ledger:      ledger,
		Broadcaster: newFanoutBroadcaster(),
		Pending:     newPendingPermissions(),
	}, nil
}

// Remove drops whichever session is registered under slug and sid. Safe to
// call from error paths in handleAttach.
func (sm *SessionManager) Remove(slug, sid string) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	key := sessionKey(slug, sid)
	delete(sm.sessions, key)
	delete(sm.kinds, key)
}

// removeEntry drops entry if it is still the session registered under its
// key. The pump calls it when its worker exits: by then the entry may have
// been dropped and the session created again, and the new entry must stay.
func (sm *SessionManager) removeEntry(entry *SessionEntry) {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	key := sessionKey(entry.Slug, entry.SID)
	if sm.sessions[key] != entry {
		return
	}

	delete(sm.sessions, key)
	delete(sm.kinds, key)
}

// ListBySlug returns all active session entries for the given project slug.
func (sm *SessionManager) ListBySlug(slug string) []*SessionEntry {
	sm.mu.Lock()
	defer sm.mu.Unlock()

	prefix := slug + "/"
	result := make([]*SessionEntry, 0)

	for key, entry := range sm.sessions {
		if len(key) > len(prefix) && key[:len(prefix)] == prefix {
			result = append(result, entry)
		}
	}

	return result
}

// runPump is the single consumer of entry.Worker.Events(). For each event it:
//  1. Writes the translated client JSON to the JSONL ledger (persistent)
//  2. Broadcasts the raw WorkerEvent, with its ledger line, to all registered
//     WT clients; an event with no client form is neither written nor sent
//  3. Lets the push dispatcher decide whether to notify, under ctx
//
// ctx is the server's lifetime context. When it ends, runPump closes the
// worker. When the worker exits, for that reason or its own (Events channel
// closes), runPump closes the ledger, signals all attached clients via
// broadcaster.Close(), then removes the session from the map. A worker that
// ended on its own is closed on the way out too, which releases its socket
// and ends a process that is still running after its reader failed.
func (sm *SessionManager) runPump(ctx context.Context, entry *SessionEntry) {
	closed := make(chan struct{})
	stopClosing := context.AfterFunc(ctx, func() {
		defer close(closed)

		if err := entry.Worker.Close(); err != nil {
			sm.logger.WarnContext(ctx, "noskills session: close worker at shutdown", "sid", entry.SID, "err", err)
		}
	})

	defer func() {
		// The pump owns that close: when it has started, wait for it.
		if !stopClosing() {
			<-closed

			return
		}

		// The lifetime is still running, so the worker ended on its own.
		if err := entry.Worker.Close(); err != nil {
			sm.logger.WarnContext(ctx, "noskills session: close ended worker", "sid", entry.SID, "err", err)
		}
	}()

	for evt := range entry.Worker.Events() {
		// Remember what each permission request is about. The decision comes back
		// on a different path carrying only the request id, so this is the only
		// point at which the tool name and the id are both in hand.
		if evt.Type == "permission_request" {
			if requestID, tool := permissionRequestTool(evt.Payload); requestID != "" {
				entry.Pending.record(requestID, tool)
			}
		}

		if data := marshalEventForLedger(ctx, evt, sm.logger); data != nil {
			if err := entry.publishOrSend(evt, data); err != nil {
				sm.logger.WarnContext(ctx, "runPump: ledger append failed", "sid", entry.SID, "err", err)
			}
		}

		if sm.server.push != nil {
			sm.server.push.MaybeTrigger(ctx, entry, evt)
		}
	}

	// Worker exited — clean up in order: ledger → broadcaster → sessions map.
	if err := entry.Ledger.Close(); err != nil {
		sm.logger.WarnContext(ctx, "runPump: ledger close failed", "sid", entry.SID, "err", err)
	}

	entry.Broadcaster.Close() // unblocks all attach-handler goroutines
	sm.removeEntry(entry)

	sm.logger.InfoContext(ctx, "noskills session ended", "slug", entry.Slug, "sid", entry.SID)
}
